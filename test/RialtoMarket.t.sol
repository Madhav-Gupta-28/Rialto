// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Mandates} from "../src/Mandates.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";
import {Status, Request} from "../src/RialtoTypes.sol";
import {MockHSS} from "./mocks/MockHSS.sol";

contract RialtoMarketTest is Base {
    /* ══════════════════ the two endings ══════════════════ */

    function test_lifecycle_repaid() public {
        uint256 borrowerCashBefore = cash.balanceOf(borrower);
        uint256 aliceCashBefore = cash.balanceOf(alice);

        uint256 id = _openBidAward();

        // Cash went straight from lender to borrower. None of it rested here.
        assertEq(cash.balanceOf(borrower), borrowerCashBefore + principal);
        assertEq(cash.balanceOf(alice), aliceCashBefore - principal);
        assertEq(cash.balanceOf(address(market)), 0, "the market never holds cash");
        assertEq(bond.balanceOf(address(market)), collateralAmount, "collateral is escrowed");
        assertEq(market.liveExposure(alice), principal);

        vm.warp(block.timestamp + TERM - 1);
        vm.prank(borrower);
        market.repay(id);

        assertEq(uint8(_status(id)), uint8(Status.Repaid));
        assertEq(bond.balanceOf(address(market)), 0, "collateral returned");
        assertEq(cash.balanceOf(alice), aliceCashBefore - principal + goodBid, "lender earned the fee");
        assertEq(market.liveExposure(alice), 0);
        assertEq(market.reservedExposure(alice), 0);
    }

    function test_lifecycle_defaulted() public {
        uint256 id = _openBidAward();
        uint256 aliceBondBefore = bond.balanceOf(alice);

        vm.warp(block.timestamp + TERM + 1);
        vm.prank(stranger); // permissionless on purpose
        market.claim(id);

        assertEq(uint8(_status(id)), uint8(Status.Defaulted));
        assertEq(bond.balanceOf(alice), aliceBondBefore + collateralAmount, "collateral went to the lender");
        assertEq(market.liveExposure(alice), 0);
    }

    /// The lender is paid from storage, never from msg.sender. A stranger
    /// calling claim must not be able to redirect the collateral to itself.
    function test_claim_paysTheRecordedLenderNotTheCaller() public {
        uint256 id = _openBidAward();
        vm.warp(block.timestamp + TERM + 1);

        uint256 strangerBefore = bond.balanceOf(stranger);
        vm.prank(stranger);
        market.claim(id);

        assertEq(bond.balanceOf(stranger), strangerBefore, "caller gains nothing");
        assertEq(bond.balanceOf(alice), collateralAmount);
    }

    /* ══════════════════ the document is the product ══════════════════ */

    /// The keystone property. A borrower must not be able to name the hash that
    /// underwriters will bid against — it has to come off the security itself.
    function test_open_readsHashFromSecurityAndIgnoresTheBorrower() public {
        vm.prank(borrower);
        uint256 id = market.open(
            address(bond), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, LIE_HASH
        );

        Request memory r = market.get(id);
        assertEq(r.docHash, REAL_HASH, "the on-chain document wins");
        assertTrue(r.docFromChain, "and the request records that it did");
        assertTrue(r.docHash != LIE_HASH, "the borrower's preferred hash never lands");
    }

    /// A plain ERC-20 has no documentation facet. The request still opens, but
    /// it must be honest about where the hash came from.
    function test_open_fallsBackWhenTheSecurityHasNoDocuments() public {
        bond.setDocumentsBroken(true);

        vm.prank(borrower);
        uint256 id = market.open(
            address(bond), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, LIE_HASH
        );

        Request memory r = market.get(id);
        assertEq(r.docHash, LIE_HASH, "fallback is used when there is no facet");
        assertFalse(r.docFromChain, "and it is flagged as not from the chain");
    }

    /// An unset document is not a partially trusted result.
    function test_open_treatsMissingDocumentAsNotFromChain() public {
        vm.prank(borrower);
        uint256 id = market.open(
            address(bond), collateralAmount, address(cash), principal, TERM, WINDOW, bytes32("absent"), LIE_HASH
        );
        assertFalse(market.get(id).docFromChain);
    }

    /// Replacing the document mid-auction must not move a bid that was already
    /// placed against the old bytes.
    function test_bidsStayBoundToTheHashFrozenAtOpen() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, bytes32("hcs-1"));

        bond.setDocument(PROSPECTUS, "ipfs://rewritten", keccak256("senior becomes subordinated"));

        assertEq(market.get(id).docHash, REAL_HASH, "the frozen hash does not follow the issuer");
    }

    /* ══════════════════ scheduled settlement ══════════════════ */

    /// The failure that would have shipped: the capacity check is a staticcall,
    /// and on any chain without HSS at 0x16b it returns empty data. Decoding
    /// that reverts, which would have taken the whole award down with it.
    /// Awarding on a network with no Schedule Service must simply not schedule.
    function test_award_succeedsOnAChainWithNoScheduleService() public {
        assertEq(HSS_ADDR.code.length, 0, "nothing deployed at the HSS address");

        uint256 id = _openBidAward(); // must not revert

        assertEq(uint8(_status(id)), uint8(Status.Funded));
        assertEq(market.settlementSchedule(id), address(0), "no schedule, and that is fine");
    }

    function test_award_schedulesClaimAtMaturity() public {
        MockHSS hss = _installHSS();
        uint256 id = _openBidAward();

        assertEq(hss.count(), 1, "one schedule created");
        assertTrue(market.settlementSchedule(id) != address(0));

        (address to, uint256 expiry,,,,) = hss.scheduled(0);
        assertEq(to, address(market));
        assertEq(
            expiry,
            uint256(market.get(id).dueAt) + market.SETTLEMENT_MARGIN(),
            "fires a margin past maturity, not one second"
        );
    }

    /// The whole point: nobody shows up, and the position still settles.
    function test_networkFiresTheScheduleAndTheLenderIsPaid() public {
        MockHSS hss = _installHSS();
        uint256 id = _openBidAward();

        vm.warp(uint256(market.get(id).dueAt) + 1);
        (bool ok,) = hss.fire(0);

        assertTrue(ok, "the scheduled claim executed");
        assertEq(uint8(_status(id)), uint8(Status.Defaulted));
        assertEq(bond.balanceOf(alice), collateralAmount, "settled with no user transaction");
    }

    function test_repay_releasesThePendingSchedule() public {
        MockHSS hss = _installHSS();
        uint256 id = _openBidAward();

        vm.prank(borrower);
        market.repay(id);

        assertEq(hss.deleteCount(), 1, "the schedule was released");
        assertEq(market.settlementSchedule(id), address(0));
    }

    /// A schedule that fires on an already-repaid request is harmless.
    function test_scheduleFiringAfterRepaymentChangesNothing() public {
        MockHSS hss = _installHSS();
        uint256 id = _openBidAward();

        vm.prank(borrower);
        market.repay(id);

        vm.warp(uint256(market.get(id).dueAt) + 1);
        (bool ok,) = hss.fire(0);

        assertFalse(ok, "claim reverts on a repaid request, and nothing else happens");
        assertEq(uint8(_status(id)), uint8(Status.Repaid));
    }

    function test_award_survivesEveryScheduleFailure() public {
        MockHSS hss = _installHSS();

        // The second is full.
        hss.setCapacity(false);
        uint256 a = _openBidAward();
        assertEq(uint8(_status(a)), uint8(Status.Funded));
        assertEq(market.settlementSchedule(a), address(0));

        // Creation refused with a response code rather than a revert.
        hss.setCapacity(true);
        hss.setFailCreate(true);
        uint256 b = _openBidAward();
        assertEq(uint8(_status(b)), uint8(Status.Funded));
        assertEq(market.settlementSchedule(b), address(0));

        // The service itself fails at the EVM level.
        hss.setFailCreate(false);
        hss.setRevertAll(true);
        uint256 c = _openBidAward();
        assertEq(uint8(_status(c)), uint8(Status.Funded));
        assertEq(market.settlementSchedule(c), address(0));
    }

    /* ══════════════════ exposure accounting ══════════════════ */

    function test_reservedExposureHoldsCapacityWhileABidStands() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");

        assertEq(market.reservedExposure(alice), principal);
        assertEq(market.liveExposure(alice), 0);

        vm.warp(block.timestamp + WINDOW);
        market.award(id);

        assertEq(market.reservedExposure(alice), 0, "reservation converts, never doubles");
        assertEq(market.liveExposure(alice), principal);
    }

    function test_beingOutbidReturnsYourCapacity() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.prank(bob);
        market.bid(id, goodBid - 1, "");

        assertEq(market.reservedExposure(alice), 0, "outbid frees the loser");
        assertEq(market.reservedExposure(bob), principal);
    }

    /// Improving your own bid must not charge you twice for the same request.
    function test_improvingYourOwnBidDoesNotDoubleCount() public {
        uint256 id = _open();
        vm.startPrank(alice);
        market.bid(id, goodBid, "");
        market.bid(id, goodBid - 1, "");
        market.bid(id, goodBid - 2, "");
        vm.stopPrank();

        assertEq(market.reservedExposure(alice), principal, "still one commitment");
    }

    /// Without reservedExposure, maxTotal is checkable but not enforceable:
    /// each auction passes the check alone and the limit breaks when they award.
    function test_maxTotalIsEnforcedAcrossSimultaneousAuctions() public {
        vm.prank(alice);
        mandates.setMandate(agentA, 500_000 * ONE_CASH, 150_000 * ONE_CASH, 500, 60 days);

        uint256 first = _open();
        uint256 second = _open();

        vm.prank(alice);
        market.bid(first, goodBid, "");

        // 100k reserved, 150k ceiling: a second 100k commitment must not fit.
        vm.prank(alice);
        vm.expectRevert(RialtoMarket.OverTotal.selector);
        market.bid(second, goodBid, "");
    }

    function test_failedBidDoesNotFreeTheStandingBidder() public {
        vm.prank(bob);
        mandates.setMandate(agentB, 500_000 * ONE_CASH, 150_000 * ONE_CASH, 500, 60 days);

        uint256 first = _open();
        uint256 second = _open();

        vm.prank(bob);
        market.bid(second, goodBid, ""); // bob commits 100k of his 150k

        vm.prank(alice);
        market.bid(first, goodBid, "");

        // Bob tries to take the first auction too and cannot afford it.
        vm.prank(bob);
        vm.expectRevert(RialtoMarket.OverTotal.selector);
        market.bid(first, goodBid - 1, "");

        assertEq(market.reservedExposure(alice), principal, "alice's commitment survived bob's failure");
        assertEq(market.reservedExposure(bob), principal);
    }

    /* ══════════════════ the walk-away grief ══════════════════ */

    /// A borrower who opens requests, attracts bids and then disappears would
    /// otherwise pin an underwriter's capacity forever.
    function test_anyoneMayCancelAStaleRequestAndFreeTheBidder() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");
        assertEq(market.reservedExposure(alice), principal);

        vm.warp(block.timestamp + WINDOW + market.AWARD_WINDOW());

        vm.prank(stranger);
        market.cancel(id);

        assertEq(uint8(_status(id)), uint8(Status.Cancelled));
        assertEq(market.reservedExposure(alice), 0, "capacity is released");
        assertEq(bond.balanceOf(borrower), 1_000_000e18, "collateral still goes to the borrower");
    }

    function test_beforeTheAwardWindowOnlyTheBorrowerMayCancel() public {
        uint256 id = _open();
        vm.warp(block.timestamp + WINDOW);

        vm.prank(stranger);
        vm.expectRevert(RialtoMarket.NotBorrower.selector);
        market.cancel(id);

        vm.prank(borrower);
        market.cancel(id);
        assertEq(uint8(_status(id)), uint8(Status.Cancelled));
    }

    function test_cancelDuringTheAuctionIsRefused() public {
        uint256 id = _open();
        vm.prank(borrower);
        vm.expectRevert(RialtoMarket.AuctionLive.selector);
        market.cancel(id);
    }

    /* ══════════════════ bidding rules ══════════════════ */

    function test_bidBelowPrincipalIsRefused() public {
        vm.prank(alice);
        mandates.setMandate(agentA, 500_000 * ONE_CASH, 1_000_000 * ONE_CASH, 0, 60 days);

        uint256 id = _open();
        vm.prank(alice);
        vm.expectRevert(RialtoMarket.BelowPrincipal.selector);
        market.bid(id, principal - 1, "");
    }

    function test_lowestBidWins() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.prank(bob);
        vm.expectRevert(RialtoMarket.NotBetter.selector);
        market.bid(id, goodBid, "equal is not better");

        vm.prank(bob);
        market.bid(id, goodBid - 1, "");

        vm.warp(block.timestamp + WINDOW);
        market.award(id);
        assertEq(market.get(id).lender, bob);
    }

    function test_agentBidsForItsOwner() public {
        uint256 id = _open();
        vm.prank(agentA);
        market.bid(id, goodBid, bytes32("hcs-reasoning"));

        vm.warp(block.timestamp + WINDOW);
        market.award(id);

        assertEq(market.get(id).lender, alice, "the owner lends, not the agent key");
        assertEq(cash.balanceOf(agentA), 0, "the agent never touches money");
    }

    /// A stolen agent key is bounded by limits its owner already set.
    function test_compromisedAgentCannotExceedItsMandate() public {
        vm.prank(alice);
        mandates.setMandate(agentA, 1 * ONE_CASH, 1_000_000 * ONE_CASH, 500, 60 days);

        uint256 id = _open();
        vm.prank(agentA);
        vm.expectRevert(RialtoMarket.OverPerDeal.selector);
        market.bid(id, goodBid, "");
    }

    function test_revokedAgentCannotBid() public {
        uint256 id = _open();
        vm.prank(alice);
        mandates.revoke();

        vm.prank(agentA);
        vm.expectRevert(RialtoMarket.NoMandate.selector);
        market.bid(id, goodBid, "");
    }

    function test_bidderWithoutAMandateIsRefused() public {
        uint256 id = _open();
        vm.prank(stranger);
        vm.expectRevert(RialtoMarket.NoMandate.selector);
        market.bid(id, goodBid, "");
    }

    function test_disallowedAssetIsRefused() public {
        vm.prank(alice);
        mandates.allowAsset(address(bond), false);

        uint256 id = _open();
        vm.prank(alice);
        vm.expectRevert(RialtoMarket.AssetNotAllowed.selector);
        market.bid(id, goodBid, "");
    }

    function test_rateBelowTheMandateMinimumIsRefused() public {
        vm.prank(alice);
        mandates.setMandate(agentA, 500_000 * ONE_CASH, 1_000_000 * ONE_CASH, 2_000, 60 days);

        uint256 id = _open();
        vm.prank(alice);
        vm.expectRevert(RialtoMarket.RateTooLow.selector);
        market.bid(id, goodBid, ""); // ~973 bps, mandate wants 2000
    }

    function test_termLongerThanTheMandateIsRefused() public {
        vm.prank(alice);
        mandates.setMandate(agentA, 500_000 * ONE_CASH, 1_000_000 * ONE_CASH, 500, 7 days);

        uint256 id = _open();
        vm.prank(alice);
        vm.expectRevert(RialtoMarket.TermTooLong.selector);
        market.bid(id, goodBid, "");
    }

    function test_biddingAfterTheDeadlineIsRefused() public {
        uint256 id = _open();
        vm.warp(block.timestamp + WINDOW);
        vm.prank(alice);
        vm.expectRevert(RialtoMarket.AuctionClosed.selector);
        market.bid(id, goodBid, "");
    }

    /* ══════════════════ award, repay, claim guards ══════════════════ */

    function test_awardBeforeTheDeadlineIsRefused() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.expectRevert(RialtoMarket.AuctionLive.selector);
        market.award(id);
    }

    function test_awardWithNoBidsIsRefused() public {
        uint256 id = _open();
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(RialtoMarket.NoBids.selector);
        market.award(id);
    }

    function test_awardTwiceIsRefused() public {
        uint256 id = _openBidAward();
        vm.expectRevert(RialtoMarket.NotOpen.selector);
        market.award(id);
    }

    function test_onlyTheBorrowerRepays() public {
        uint256 id = _openBidAward();
        vm.prank(stranger);
        vm.expectRevert(RialtoMarket.NotBorrower.selector);
        market.repay(id);
    }

    function test_repayAfterMaturityIsRefused() public {
        uint256 id = _openBidAward();
        vm.warp(uint256(market.get(id).dueAt) + 1);
        vm.prank(borrower);
        vm.expectRevert(RialtoMarket.TooLate.selector);
        market.repay(id);
    }

    /// The boundary itself: repayment is allowed at dueAt, default only after.
    function test_maturityBoundaryIsExact() public {
        uint256 id = _openBidAward();
        uint256 due = market.get(id).dueAt;

        vm.warp(due);
        vm.expectRevert(RialtoMarket.StillCurrent.selector);
        market.claim(id);

        vm.prank(borrower);
        market.repay(id); // still in time, at the last possible second
        assertEq(uint8(_status(id)), uint8(Status.Repaid));
    }

    function test_claimBeforeMaturityIsRefused() public {
        uint256 id = _openBidAward();
        vm.expectRevert(RialtoMarket.StillCurrent.selector);
        market.claim(id);
    }

    function test_claimTwiceIsRefused() public {
        uint256 id = _openBidAward();
        vm.warp(block.timestamp + TERM + 1);
        market.claim(id);
        vm.expectRevert(RialtoMarket.NotOpen.selector);
        market.claim(id);
    }

    /* ══════════════════ opening guards ══════════════════ */

    function test_openRejectsBadInput() public {
        vm.startPrank(borrower);

        vm.expectRevert(RialtoMarket.BadWindow.selector);
        market.open(address(bond), collateralAmount, address(cash), principal, TERM, 59, PROSPECTUS, 0);

        vm.expectRevert(RialtoMarket.BadTerm.selector);
        market.open(address(bond), collateralAmount, address(cash), principal, 0, WINDOW, PROSPECTUS, 0);

        vm.expectRevert(RialtoMarket.BadTerm.selector);
        market.open(address(bond), collateralAmount, address(cash), principal, 61 days, WINDOW, PROSPECTUS, 0);

        vm.expectRevert(RialtoMarket.ZeroAmount.selector);
        market.open(address(bond), collateralAmount, address(cash), 0, TERM, WINDOW, PROSPECTUS, 0);

        vm.expectRevert(RialtoMarket.ZeroAmount.selector);
        market.open(address(bond), 0, address(cash), principal, TERM, WINDOW, PROSPECTUS, 0);

        vm.expectRevert(RialtoMarket.ZeroAddress.selector);
        market.open(address(0), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, 0);

        vm.expectRevert(RialtoMarket.CashIsCollateral.selector);
        market.open(address(bond), collateralAmount, address(bond), principal, TERM, WINDOW, PROSPECTUS, 0);

        vm.stopPrank();
    }

    /// MAX_TERM is set by a measured Hedera limit, not by taste: a scheduled
    /// transaction cannot expire more than 62 days out.
    function test_maxTermStaysUnderTheHederaSchedulingCeiling() public view {
        assertLe(uint256(market.MAX_TERM()), 5_356_800, "must fit scheduling.maxExpirationFutureSeconds");
        assertEq(uint256(market.MAX_TERM()), 60 days);
    }

    /* ══════════════════ awkward tokens ══════════════════ */

    function test_collateralThatSkimsOnTransferIsRecordedAtWhatArrived() public {
        bond.setFeeBps(100); // 1%

        vm.prank(borrower);
        uint256 id = market.open(
            address(bond), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, bytes32(0)
        );

        uint256 arrived = (collateralAmount * 9_900) / 10_000;
        assertEq(market.get(id).collateralAmount, arrived, "record what escrow holds, not what was asked");
        assertEq(bond.balanceOf(address(market)), arrived);
    }

    function test_tokenReturningNothingIsAccepted() public {
        cash.setReturnMode(1); // returns no data, like several older tokens
        uint256 id = _openBidAward();
        assertEq(uint8(_status(id)), uint8(Status.Funded));
    }

    function test_tokenReturningFalseIsRejected() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.warp(block.timestamp + WINDOW);

        cash.setReturnMode(2); // silent false
        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.award(id);
    }

    function test_revertingTokenIsRejected() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.warp(block.timestamp + WINDOW);

        cash.setReturnMode(3);
        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.award(id);
    }

    /* ══════════════════ the rate ══════════════════ */

    function test_rateBps_matchesTheWorkedExample() public view {
        // 800 of fee on 100,000 over 30 days ≈ 9.73% annualised.
        assertEq(market.rateBps(100_000 * ONE_CASH, 100_800 * ONE_CASH, 30 days), 973);
    }

    function test_rateBps_isZeroWhenThereIsNoFee() public view {
        assertEq(market.rateBps(100 * ONE_CASH, 100 * ONE_CASH, 30 days), 0);
        assertEq(market.rateBps(100 * ONE_CASH, 99 * ONE_CASH, 30 days), 0);
        assertEq(market.rateBps(0, 100, 30 days), 0);
        assertEq(market.rateBps(100, 200, 0), 0);
    }

    /// A tiny fee on 6-decimal cash must not round to zero, or a mandate's
    /// minimum rate becomes trivially satisfiable.
    function test_rateBps_doesNotTruncateSmallFeesToZero() public view {
        uint256 p = 1_000 * ONE_CASH;
        assertGt(market.rateBps(p, p + (ONE_CASH / 2), 7 days), 0, "half a unit of cash still prices");
    }

    /// An absurd bid must cap rather than panic; it loses the auction anyway.
    function test_rateBps_capsInsteadOfOverflowing() public view {
        assertEq(market.rateBps(1, type(uint256).max, 1), type(uint16).max);
    }

    function testFuzz_rateBps_neverReverts(uint256 p, uint256 repay, uint64 term) public view {
        market.rateBps(p, repay, term);
    }

    /**
     * The bug that only shows up on Hedera.
     *
     * Its Schedule Service is a native system contract: it answers calls but
     * has no EVM bytecode, so `extcodesize` at 0x…016b is zero. A high-level
     * call reverts before it is made, and a `code.length` guard skips
     * scheduling entirely — which silently disables the feature on the only
     * network that has it.
     *
     * `vm.mockCall` reproduces that exactly, because it makes an address answer
     * without giving it code. If this passes, the raw-call path is reaching a
     * codeless responder the way it must on Hedera.
     */
    function test_schedulesAgainstACodelessSystemContract() public {
        assertEq(HSS_ADDR.code.length, 0, "the fixture must have no code, as Hedera does not");

        vm.mockCall(
            HSS_ADDR,
            abi.encodeWithSignature("hasScheduleCapacity(uint256,uint256)"),
            abi.encode(true)
        );
        vm.mockCall(
            HSS_ADDR,
            abi.encodeWithSignature("scheduleCall(address,uint256,uint256,uint64,bytes)"),
            abi.encode(int64(22), address(0xC0FFEE))
        );

        uint256 id = _openBidAward();

        assertEq(uint8(_status(id)), uint8(Status.Funded));
        assertEq(market.settlementSchedule(id), address(0xC0FFEE), "settlement must be scheduled");
    }

    /// And a codeless address that answers with nothing is still just "no
    /// scheduling here", not a failed award.
    function test_awardSurvivesACodelessAddressThatReturnsNothing() public {
        vm.mockCall(HSS_ADDR, abi.encodeWithSignature("hasScheduleCapacity(uint256,uint256)"), "");
        uint256 id = _openBidAward();
        assertEq(uint8(_status(id)), uint8(Status.Funded));
        assertEq(market.settlementSchedule(id), address(0));
    }

    /**
     * The scheduled claim must be funded for a real security, not for the mock.
     *
     * A claim against an ATS diamond measured 472,252 gas on testnet, because
     * the transfer runs through control-list and compliance facets. The mock
     * used everywhere else in this suite costs a fraction of that, which is
     * exactly why a 400,000 budget passed every test here and then reverted the
     * first time a schedule fired in production.
     */
    function test_scheduledClaimBudgetCoversARealSecurity() public {
        uint256 id = _openBidAward();
        vm.warp(block.timestamp + TERM + 1);

        uint256 before = gasleft();
        market.claim(id);
        uint256 usedOnMock = before - gasleft();

        uint256 measuredOnATS = 472_252; // receipt, Hedera testnet
        uint256 budget = 1_200_000; // CLAIM_GAS

        assertLt(usedOnMock, budget, "the mock fits, which proves nothing on its own");
        assertLt(measuredOnATS, budget, "the measured ATS cost is what the budget has to cover");
    }


    /**
     * The settlement must be scheduled late enough for `claim`'s own time check
     * to pass when the network runs it.
     *
     * A scheduled call sees a `block.timestamp` behind the second it was
     * scheduled for — measured on testnet at two seconds early. Scheduling at
     * `dueAt + 1` therefore hands the network a call that reverts StillCurrent,
     * which is what happened twice in production while this suite stayed green,
     * because Foundry's clock has no such lag.
     */
    function test_settlementIsScheduledLateEnoughToActuallySettle() public {
        MockHSS hss = _installHSS();
        uint256 id = _openBidAward();

        (, uint256 expiry,,,,) = hss.scheduled(0);
        uint256 due = market.get(id).dueAt;

        assertEq(expiry, due + market.SETTLEMENT_MARGIN(), "scheduled at maturity plus the margin");
        assertGe(market.SETTLEMENT_MARGIN(), 10, "one second is not enough for the observed lag");

        // The property that matters: even with the EVM clock running behind the
        // scheduled second, claim's check still passes.
        uint256 observedLag = 5;
        vm.warp(expiry - observedLag);
        assertGt(block.timestamp, due, "claim would still see itself as past maturity");

        market.claim(id);
        assertEq(uint8(_status(id)), uint8(Status.Defaulted));
    }

}
