// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";
import {CouponPassThrough} from "../src/CouponPassThrough.sol";
import {Status} from "../src/RialtoTypes.sol";
import {MockHSS} from "./mocks/MockHSS.sol";

/**
 * The manufactured payment.
 *
 * A coupon belongs to whoever holds the security on its record date. While a
 * loan is live that is the escrow, so the borrower — who still owns the bond
 * and gets it back on repayment — is credited with nothing by the security
 * itself. Repo solves this with a manufactured payment from the collateral
 * taker to the collateral giver, and these tests are that mechanism.
 *
 * Demonstrated against a real ATS security on testnet before any of it was
 * written: with 10,500 RDN27 pledged and 4,200 held directly, the security
 * reported 143.785674 payable to the escrow and 57.514269 to the borrower.
 */
contract CouponTest is Base {
    /// 0.01 cash units per token, expressed the way the mock scales it.
    uint256 constant RATE = 1e16;

    function _couponDuring(uint256 id) internal returns (uint256 couponId) {
        uint256 due = market.get(id).dueAt;
        couponId = bond.setCouponAt(due - 1 days, RATE);
    }

    /* ═════════ the bug, reproduced ═════════ */

    /**
     * The security credits the escrow, not the borrower. This is the state the
     * rest of the file exists to correct, asserted rather than described.
     */
    function test_theSecurityCreditsTheEscrowNotTheBorrower() public {
        uint256 id = _openBidAward();
        uint256 couponId = _couponDuring(id);
        vm.warp(block.timestamp + TERM - 1 days + 1);

        uint256 escrowBalance = bond.getCouponFor(couponId, address(market)).tokenBalance;
        uint256 borrowerBalance = bond.getCouponFor(couponId, borrower).tokenBalance;

        assertEq(escrowBalance, collateralAmount, "the escrow holds the pledged bond on the record date");
        assertEq(borrowerBalance, 1_000_000e18 - collateralAmount, "the borrower is credited only for what it kept");
    }

    /* ═════════ the correction ═════════ */

    function test_recordCouponCreditsTheBorrower() public {
        uint256 id = _openBidAward();
        uint256 couponId = _couponDuring(id);
        vm.warp(block.timestamp + TERM - 1 days + 1);

        market.recordCoupon(id, couponId);

        // 105,000 tokens at 0.01 per token = 1,050 cash units.
        uint256 expected = (collateralAmount * RATE * ONE_CASH) / (1e18 * 1e18);
        assertEq(market.manufacturedOwed(id), expected, "the borrower is owed the coupon on what it pledged");
        assertGt(expected, 0);
    }

    /// Counting the same coupon twice would pay the borrower twice.
    function test_aCouponCannotBeRecordedTwice() public {
        uint256 id = _openBidAward();
        uint256 couponId = _couponDuring(id);
        vm.warp(block.timestamp + TERM - 1 days + 1);

        market.recordCoupon(id, couponId);
        vm.expectRevert(RialtoMarket.AlreadyRecorded.selector);
        market.recordCoupon(id, couponId);
    }

    /// Income earned outside the term is between the holder and the issuer.
    function test_aCouponOutsideTheLoanIsRefused() public {
        uint256 id = _openBidAward();
        uint256 due = market.get(id).dueAt;

        uint256 after_ = bond.setCouponAt(due + 10 days, RATE);
        vm.warp(due + 11 days);
        vm.expectRevert(RialtoMarket.CouponOutsideLoan.selector);
        market.recordCoupon(id, after_);
    }

    function test_recordingBeforeTheRecordDateIsRefused() public {
        uint256 id = _openBidAward();
        uint256 couponId = _couponDuring(id);
        vm.expectRevert(CouponPassThrough.RecordDateNotReached.selector);
        market.recordCoupon(id, couponId);
    }

    /* ═════════ apportioning ═════════ */

    /**
     * The escrow's balance covers every live request against the same security.
     * Crediting one request with the whole payable would pay one borrower using
     * another borrower's coupon.
     */
    function test_twoLoansShareTheEscrowBalanceAndEachGetsOnlyItsOwnShare() public {
        uint256 first = _openBidAward();

        // A second borrower pledges half as much against the same security.
        bond.mint(stranger, 200_000e18);
        vm.prank(stranger);
        bond.approve(address(market), type(uint256).max);
        vm.prank(stranger);
        uint256 second = market.open(
            address(bond), collateralAmount / 2, address(cash), principal, TERM, WINDOW, PROSPECTUS, bytes32(0)
        );
        vm.prank(bob);
        market.bid(second, goodBid, "");
        vm.warp(block.timestamp + WINDOW);
        market.award(second);

        uint256 couponId = bond.setCouponAt(block.timestamp + 1, RATE);
        vm.warp(block.timestamp + 2);

        market.recordCoupon(first, couponId);
        market.recordCoupon(second, couponId);

        uint256 a = market.manufacturedOwed(first);
        uint256 b = market.manufacturedOwed(second);

        assertEq(a, 2 * b, "each request is owed in proportion to what it pledged");

        // And together they never exceed what the escrow was actually credited.
        uint256 escrowPayable =
            (bond.getCouponFor(couponId, address(market)).tokenBalance * RATE * ONE_CASH) / (1e18 * 1e18);
        assertLe(a + b, escrowPayable, "the escrow cannot pay out more coupon than it received");
    }

    /* ═════════ settlement ═════════ */

    /// Repo nets the manufactured payment against the repayment. The lender
    /// simply receives less, so the obligation needs no enforcement.
    function test_repaymentIsNettedAgainstTheCoupon() public {
        uint256 id = _openBidAward();
        uint256 couponId = _couponDuring(id);
        vm.warp(block.timestamp + TERM - 1 days + 1);
        market.recordCoupon(id, couponId);

        uint256 owed = market.manufacturedOwed(id);
        uint256 agreed = market.get(id).repayAmount;
        assertEq(market.repaymentDue(id), agreed - owed, "the borrower hands over less by exactly the coupon");

        uint256 lenderBefore = cash.balanceOf(alice);
        uint256 borrowerBefore = cash.balanceOf(borrower);

        vm.prank(borrower);
        market.repay(id);

        assertEq(cash.balanceOf(alice) - lenderBefore, agreed - owed, "the lender receives the netted amount");
        assertEq(borrowerBefore - cash.balanceOf(borrower), agreed - owed, "and the borrower pays it");
        assertEq(market.manufacturedOwed(id), 0, "the obligation is discharged");
        assertEq(uint8(_status(id)), uint8(Status.Repaid));
    }

    /// On a default there is no repayment to net against, so it is paid directly.
    function test_afterADefaultTheCouponIsPaidToTheBorrower() public {
        uint256 id = _openBidAward();
        uint256 couponId = _couponDuring(id);
        vm.warp(block.timestamp + TERM - 1 days + 1);
        market.recordCoupon(id, couponId);
        uint256 owed = market.manufacturedOwed(id);

        vm.warp(block.timestamp + 2 days);
        market.claim(id);
        assertEq(uint8(_status(id)), uint8(Status.Defaulted));

        uint256 before = cash.balanceOf(borrower);
        vm.prank(alice); // the collateral taker owes it under the GMRA
        market.settleManufacturedPayment(id);

        assertEq(cash.balanceOf(borrower) - before, owed, "the borrower is made whole for the coupon");
        assertEq(market.manufacturedOwed(id), 0);
    }

    function test_settlingNothingIsRefused() public {
        uint256 id = _openBidAward();
        vm.expectRevert(RialtoMarket.NothingOwed.selector);
        market.settleManufacturedPayment(id);
    }

    /// A coupon that swallows the whole fee cannot turn repayment into a raid.
    function test_anOversizedCouponFloorsTheRepaymentAtZero() public {
        uint256 id = _openBidAward();
        uint256 couponId = bond.setCouponAt(block.timestamp + 1, RATE * 10_000);
        vm.warp(block.timestamp + 2);
        market.recordCoupon(id, couponId);

        assertGt(market.manufacturedOwed(id), market.get(id).repayAmount);
        assertEq(market.repaymentDue(id), 0, "floored, never negative");

        vm.prank(borrower);
        market.repay(id);
        assertEq(uint8(_status(id)), uint8(Status.Repaid));
        assertEq(bond.balanceOf(address(market)), 0, "and the collateral still comes home");
    }

    /* ═════════ scheduling ═════════ */

    /**
     * Hedera permits at most one scheduled call per transaction. An award that
     * books its own settlement and then tries to book a coupon is rejected
     * outright with NO_SCHEDULING_ALLOWED_AFTER_SCHEDULED_RECURSION, and the
     * loan does not fund at all.
     *
     * Found on testnet, where an award that had worked all day began reverting
     * the moment a coupon fell inside the term. So award books exactly one
     * schedule, and the coupon is booked separately.
     */
    function test_awardBooksExactlyOneSchedule() public {
        MockHSS hss = _installHSS();

        uint256 id = _open();
        bond.setCouponAt(block.timestamp + WINDOW + TERM - 1 days, RATE);

        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.warp(block.timestamp + WINDOW);
        market.award(id);

        assertEq(hss.count(), 1, "one schedule per transaction, and it is the settlement");
    }

    /// The coupon is booked by its own transaction, which anyone may send.
    function test_anyoneCanBookTheCouponRecordDate() public {
        MockHSS hss = _installHSS();

        uint256 id = _openBidAward();
        uint256 recordDate = block.timestamp + TERM - 1 days;
        uint256 couponId = bond.setCouponAt(recordDate, RATE);

        vm.prank(stranger);
        market.scheduleCoupon(id, couponId);

        assertEq(hss.count(), 2, "settlement at award, coupon by a separate call");
        (address to, uint256 expiry,, bytes memory callData,,) = hss.scheduled(1);
        assertEq(to, address(market));
        assertEq(expiry, recordDate + market.SETTLEMENT_MARGIN());
        assertEq(callData, abi.encodeCall(RialtoMarket.recordCoupon, (id, couponId)));
    }

    /// And firing it establishes the borrower's claim with nobody intervening.
    function test_theNetworkRecordsTheCouponByItself() public {
        MockHSS hss = _installHSS();

        uint256 id = _openBidAward();
        uint256 recordDate = block.timestamp + TERM - 1 days;
        uint256 couponId = bond.setCouponAt(recordDate, RATE);
        market.scheduleCoupon(id, couponId);

        assertEq(market.manufacturedOwed(id), 0, "nothing owed yet");

        vm.warp(recordDate + market.SETTLEMENT_MARGIN());
        (bool ok,) = hss.fire(1);

        assertTrue(ok, "the scheduled recordCoupon executed");
        assertGt(market.manufacturedOwed(id), 0, "the claim was established by the network");
    }

    function test_bookingACouponOutsideTheLoanIsRefused() public {
        _installHSS();
        uint256 id = _openBidAward();
        uint256 couponId = bond.setCouponAt(market.get(id).dueAt + 10 days, RATE);

        vm.expectRevert(RialtoMarket.CouponOutsideLoan.selector);
        market.scheduleCoupon(id, couponId);
    }
}
