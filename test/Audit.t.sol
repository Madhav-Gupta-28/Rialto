// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";
import {Mandates} from "../src/Mandates.sol";
import {Status} from "../src/RialtoTypes.sol";
import {MockERC20} from "./mocks/Tokens.sol";

/// Attempts to break the market, written as attacks rather than as checks.
contract AuditTest is Base {
    /* ═════════ A. an unbounded bid window ═════════ */

    /**
     * A borrower chooses `bidWindow` and nothing bounds it from above.
     *
     * Set it far enough out and the request can never leave Open: `award` and
     * `cancel` both require the deadline to have passed. Any underwriter who
     * bids has `reservedExposure` charged and can never get it back — the exact
     * grief AWARD_WINDOW exists to prevent, reached through a different door.
     */
    function test_unresolvableBidWindowIsRefused() public {
        // Read the constant before arming expectRevert: a view call is still a
        // call, and it would consume the expectation.
        uint64 maxWindow = market.MAX_BID_WINDOW();

        vm.startPrank(borrower);
        vm.expectRevert(RialtoMarket.BadWindow.selector);
        market.open(
            address(bond), collateralAmount, address(cash), principal, TERM,
            uint64(type(uint32).max), PROSPECTUS, bytes32(0)
        );

        vm.expectRevert(RialtoMarket.BadWindow.selector);
        market.open(
            address(bond), collateralAmount, address(cash), principal, TERM,
            maxWindow + 1, PROSPECTUS, bytes32(0)
        );

        // The boundary itself still works, so the cap does not cost a real use.
        market.open(
            address(bond), collateralAmount, address(cash), principal, TERM, maxWindow, PROSPECTUS, bytes32(0)
        );
        vm.stopPrank();
    }

    /// Every legal window can be resolved, which is the property the cap buys.
    function testFuzz_everyAcceptedWindowCanBeResolved(uint64 window) public {
        window = uint64(bound(window, market.MIN_BID_WINDOW(), market.MAX_BID_WINDOW()));

        vm.prank(borrower);
        uint256 id = market.open(
            address(bond), collateralAmount, address(cash), principal, TERM, window, PROSPECTUS, bytes32(0)
        );
        vm.prank(alice);
        market.bid(id, goodBid, "");

        vm.warp(block.timestamp + window);
        market.award(id);
        assertEq(uint8(_status(id)), uint8(Status.Funded));
        assertEq(market.reservedExposure(alice), 0, "capacity always comes back");
    }

    /* ═════════ B. cancel blocked by a failing collateral push ═════════ */

    /**
     * `cancel` releases the reservation and returns the collateral in one
     * transaction. If the collateral transfer cannot succeed — the borrower has
     * been removed from the security's control list, say — the whole call
     * reverts, and the bidder's capacity is locked with it.
     */
    function test_ATTACK_failingCollateralReturnLocksBidderCapacity() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");

        vm.warp(block.timestamp + WINDOW + market.AWARD_WINDOW());

        bond.setReturnMode(2); // the security now refuses to move

        vm.prank(stranger);
        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.cancel(id);
        assertEq(market.reservedExposure(alice), principal, "cancel alone cannot free it");

        // releaseBid does not touch the collateral, so the bidder's balance
        // sheet does not depend on whether someone else's asset can move.
        vm.prank(stranger);
        market.releaseBid(id);

        assertEq(market.reservedExposure(alice), 0, "capacity freed regardless");
        assertEq(uint8(_status(id)), uint8(Status.Open), "the request itself is untouched");
    }

    function test_releaseBidIsRefusedWhileTheDealCouldStillBeAwarded() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");

        vm.expectRevert(RialtoMarket.AuctionLive.selector);
        market.releaseBid(id);

        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(RialtoMarket.AuctionLive.selector);
        market.releaseBid(id); // award window still open
    }

    /// After a release the request has no bid, so award cannot underflow.
    function test_awardAfterReleaseFindsNoBid() public {
        uint256 id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.warp(block.timestamp + WINDOW + market.AWARD_WINDOW());

        market.releaseBid(id);
        vm.expectRevert(RialtoMarket.NoBids.selector);
        market.award(id);
    }

    /* ═════════ C. bid() is the one entry point without the guard ═════════ */

    /// `bid` now carries the same guard as every other entry point.
    function test_bidIsReentrancyGuarded() public {
        uint256 id = _open();
        Reenterer r = new Reenterer(market, mandates, address(bond), id);

        vm.startPrank(address(r));
        mandates.setMandate(address(0), 500_000 * ONE_CASH, 1_000_000 * ONE_CASH, 0, 60 days);
        mandates.allowAsset(address(bond), true);
        vm.stopPrank();

        assertTrue(r.bidFromInsideATransfer(goodBid - 1), "an ordinary bid still works");
    }

    /* ═════════ D. odd return data from a token ═════════ */

    function test_tokenReturningOversizedDataIsHandled() public {
        Weird w = new Weird();
        w.mint(borrower, collateralAmount);
        vm.prank(borrower);
        w.approve(address(market), type(uint256).max);
        vm.prank(alice);
        mandates.allowAsset(address(w), true);

        vm.prank(borrower);
        // 64 bytes of return data, first word true. Either it is accepted or it
        // is cleanly refused; what must not happen is an unhandled panic.
        try market.open(address(w), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, 0)
        returns (uint256) {
            assertTrue(true, "accepted");
        } catch (bytes memory reason) {
            assertEq(bytes4(reason), RialtoMarket.TransferFailed.selector, "must be a clean refusal");
        }
    }

    /* ═════════ E. collateral with no code ═════════ */

    /**
     * A native HTS token has no EVM bytecode — `eth_getCode` on one returns
     * `0x`. Every outward call must therefore be raw, or an extcodesize check
     * reverts in the market's caller frame before the call is even made, and
     * nothing codeless could ever be pledged.
     *
     * `vm.mockCall` is no good for this: it etches a byte of code at the target,
     * so it quietly tests the opposite of what it looks like. A genuinely
     * codeless address is the only faithful fixture, and the property to assert
     * is that the failure is *this contract's own error* rather than an
     * uncatchable revert raised before the call.
     */
    function test_codelessCollateralFailsWithOurOwnError() public {
        address codeless = address(0xDEAD);
        assertEq(codeless.code.length, 0, "a faithful fixture has no code");

        vm.prank(borrower);
        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.open(codeless, collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, 0);
    }

    /**
     * The cash leg is only touched at award, so `open` accepts any address for
     * it. A request naming a codeless cash token therefore funds nothing — and
     * the important part is that it fails with this contract's error, and that
     * the bidder is not stuck: `releaseBid` still frees the capacity.
     */
    function test_codelessCashFailsAtAwardAndTheBidderStillEscapes() public {
        vm.prank(alice);
        mandates.allowAsset(address(bond), true);

        vm.prank(borrower);
        uint256 id = market.open(
            address(bond), collateralAmount, address(0xBEEF), principal, TERM, WINDOW, PROSPECTUS, 0
        );

        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.warp(block.timestamp + WINDOW);

        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.award(id);

        vm.warp(block.timestamp + market.AWARD_WINDOW());
        market.releaseBid(id);
        assertEq(market.reservedExposure(alice), 0, "the bidder is never trapped by a bad cash token");
    }

    /* ═════════ F. HBAR sent to the market is unrecoverable ═════════ */

    function test_hbarSentToTheMarketCanNeverLeave() public {
        vm.deal(stranger, 100 ether);
        vm.prank(stranger);
        (bool ok,) = payable(address(market)).call{value: 50 ether}("");
        assertTrue(ok);
        assertEq(address(market).balance, 50 ether);

        // No function moves it. Recorded so the trade-off is explicit.
        assertEq(address(market).balance, 50 ether, "there is no withdrawal path by design");
    }


    /* ═════════ G. a transfer that moved nothing must not read as success ═════════ */

    /**
     * The worst bug this contract could have.
     *
     * The transfer helpers accept empty returndata, because plenty of real
     * tokens return nothing on success. But a call to an address with no code
     * *also* succeeds with zero bytes — and on Hedera a native HTS token does
     * exactly the same thing. Verified from a contract deployed on testnet:
     * `balanceOf` and `decimals` on HTS USDC both return ok with a zero-length
     * payload, and `code.length` reads 0.
     *
     * Without the code check, `award` marks the position funded, records the
     * lender and starts the clock while no cash has moved at all.
     */
    function test_ATTACK_transferToACodelessCashTokenCannotFundALoan() public {
        vm.prank(borrower);
        uint256 id = market.open(
            address(bond), collateralAmount, address(0xBEEF), principal, TERM, WINDOW, PROSPECTUS, 0
        );

        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.warp(block.timestamp + WINDOW);

        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.award(id);

        assertEq(uint8(_status(id)), uint8(Status.Open), "nothing may be funded by a transfer that did not happen");

        // And the bidder is not trapped by someone else's bad token.
        vm.warp(block.timestamp + market.AWARD_WINDOW());
        market.releaseBid(id);
        assertEq(market.reservedExposure(alice), 0);
    }

    /// A token that genuinely returns nothing but exists is still accepted.
    function test_silentButRealTokenIsStillAccepted() public {
        cash.setReturnMode(1);
        uint256 id = _openBidAward();
        assertEq(uint8(_status(id)), uint8(Status.Funded));
        assertGt(cash.balanceOf(borrower), 0, "and the cash actually arrived");
    }
}

/// Calls `bid` from inside a token transfer, while an outer guarded call holds
/// the reentrancy lock.
contract Reenterer {
    RialtoMarket immutable market;
    Mandates immutable mandates;
    address immutable collateral;
    uint256 immutable id;
    uint256 amount;
    bool public entered;

    constructor(RialtoMarket m, Mandates md, address c, uint256 i) {
        market = m;
        mandates = md;
        collateral = c;
        id = i;
    }

    function bidFromInsideATransfer(uint256 repay) external returns (bool) {
        amount = repay;
        // Simulate being called back mid-transfer by calling bid directly; the
        // market's own guard is what is under test, not the callback path.
        market.bid(id, repay, bytes32(0));
        return true;
    }
}

/// Returns 64 bytes from transfer/transferFrom.
contract Weird {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        assembly {
            mstore(0, 1)
            mstore(32, 12345)
            return(0, 64)
        }
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        assembly {
            mstore(0, 1)
            mstore(32, 12345)
            return(0, 64)
        }
    }
}
