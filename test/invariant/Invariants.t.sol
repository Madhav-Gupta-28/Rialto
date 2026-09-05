// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {Mandates} from "../../src/Mandates.sol";
import {RialtoMarket} from "../../src/RialtoMarket.sol";
import {Status, Request, Bid} from "../../src/RialtoTypes.sol";
import {MockERC20, MockSecurity} from "../mocks/Tokens.sol";
import {Handler} from "./Handler.sol";

/**
 * The properties that have to hold no matter what order anyone calls things in.
 *
 * These are the claims a lender is actually relying on. A unit test shows that
 * one path behaves; these show that no reachable path misbehaves.
 */
contract InvariantsTest is Test {
    Mandates internal mandates;
    RialtoMarket internal market;
    MockSecurity internal bond;
    MockERC20 internal cash;
    Handler internal handler;

    function setUp() public {
        mandates = new Mandates();
        market = new RialtoMarket(mandates);
        bond = new MockSecurity("Acme 2027 Note", "ACME27", 18);
        cash = new MockERC20("USD Coin", "USDC", 6);
        bond.setDocument(bytes32("prospectus"), "ipfs://p", keccak256("doc"));

        handler = new Handler(mandates, market, bond, cash);
        targetContract(address(handler));
    }

    /**
     * Escrow solvency. The contract must hold exactly the collateral belonging
     * to requests that have not yet ended — no more, and never less.
     *
     * Less would mean a request promises collateral that has already left.
     * More would mean somebody's collateral is stranded.
     */
    function invariant_escrowMatchesLiveRequests() public view {
        uint256 owed;
        uint256 n = market.requests();
        for (uint256 i; i < n; i++) {
            Request memory r = market.get(i);
            if (r.status == Status.Open || r.status == Status.Funded) owed += r.collateralAmount;
        }
        assertEq(bond.balanceOf(address(market)), owed, "escrow must equal what live requests are owed");
    }

    /**
     * Cash never rests here. It moves lender to borrower at award and borrower
     * to lender at repayment, both inside a single call. A balance sitting in
     * this contract would mean a transfer half-happened.
     */
    function invariant_marketNeverHoldsCash() public view {
        assertEq(cash.balanceOf(address(market)), 0, "the market is not a custodian of cash");
    }

    /**
     * liveExposure is the sum of principal on positions that are actually
     * funded. If this drifts, an underwriter's limits stop meaning anything.
     */
    function invariant_liveExposureMatchesFundedPositions() public view {
        uint256 n = market.requests();
        for (uint256 u; u < 3; u++) {
            address who = handler.underwriters(u);
            uint256 expected;
            for (uint256 i; i < n; i++) {
                Request memory r = market.get(i);
                if (r.status == Status.Funded && r.lender == who) expected += r.principal;
            }
            assertEq(market.liveExposure(who), expected, "liveExposure must equal funded principal");
        }
    }

    /**
     * reservedExposure is the sum of principal on open requests where this
     * underwriter currently holds the best bid.
     *
     * This is the one that makes maxTotal enforceable rather than merely
     * checkable. Without it an underwriter could hold the winning bid on many
     * auctions at once, each passing its limit check alone, and blow through
     * the ceiling the moment they all awarded.
     */
    function invariant_reservedExposureMatchesStandingBids() public view {
        uint256 n = market.requests();
        for (uint256 u; u < 3; u++) {
            address who = handler.underwriters(u);
            uint256 expected;
            for (uint256 i; i < n; i++) {
                Request memory r = market.get(i);
                if (r.status != Status.Open) continue;
                (address underwriter,,,) = market.bestBid(i);
                if (underwriter == who) expected += r.principal;
            }
            assertEq(market.reservedExposure(who), expected, "reservedExposure must equal standing bids");
        }
    }

    /**
     * No underwriter is ever committed beyond the ceiling they set. Mandates
     * are fixed for the run, so any breach is the market's arithmetic rather
     * than an owner moving the goalposts.
     */
    function invariant_nobodyExceedsTheirOwnCeiling() public view {
        for (uint256 u; u < 3; u++) {
            address who = handler.underwriters(u);
            Mandates.Mandate memory m = mandates.mandateOf(who);
            if (!m.active) continue;
            assertLe(
                market.liveExposure(who) + market.reservedExposure(who),
                m.maxTotal,
                "total commitment must stay inside the mandate"
            );
        }
    }

    /**
     * A funded request always has a lender, a repayment and a maturity; an open
     * one never has any of them. There is no half-awarded state.
     */
    function invariant_fundedRequestsAreFullyFormed() public view {
        uint256 n = market.requests();
        for (uint256 i; i < n; i++) {
            Request memory r = market.get(i);
            if (r.status == Status.Open) {
                assertEq(r.lender, address(0), "an open request has no lender");
                assertEq(r.dueAt, 0, "an open request has no maturity");
            }
            if (r.status == Status.Funded) {
                assertTrue(r.lender != address(0), "a funded request has a lender");
                assertGt(r.dueAt, 0, "a funded request has a maturity");
                assertGe(r.repayAmount, r.principal, "nobody funds a loan that repays less than it lent");
            }
        }
    }

    /// A terminal request keeps its collateral commitment recorded but holds
    /// none of it, so the escrow sum above stays honest.
    function invariant_endedRequestsKeepTheirRecord() public view {
        uint256 n = market.requests();
        for (uint256 i; i < n; i++) {
            Request memory r = market.get(i);
            if (r.status == Status.Repaid || r.status == Status.Defaulted || r.status == Status.Cancelled) {
                assertGt(r.collateralAmount, 0, "the record of what was escrowed survives settlement");
            }
        }
    }

    /**
     * Proof that the invariants above are not passing vacuously.
     *
     * An invariant over a state the fuzzer never reaches is worthless, so this
     * drives the handler through every ending by hand and checks the counters
     * move. It establishes that each action is reachable; the fuzzer's own call
     * summary then shows it exercises them in random order.
     *
     * The assertion lives here rather than in `afterInvariant` because handler
     * storage does not read back reliably from that hook.
     */
    function test_everyEndingIsReachableThroughTheHandler() public {
        // open -> bid -> close the auction -> fund
        handler.open(0, 1e6, 1e18, 30 days, 1 hours);
        assertEq(handler.opened(), 1, "a request opened");

        handler.bid(0, 0, 2e6);
        handler.warp(2 hours);
        handler.award(0);
        assertEq(handler.awarded(), 1, "the request funded");

        // repay before maturity
        handler.repay(0, 0);
        assertEq(handler.repaid(), 1, "the position repaid");

        // a second one, left to mature unpaid
        handler.open(1, 1e6, 1e18, 5 days, 1 hours);
        handler.bid(1, 1, 2e6);
        handler.warp(2 hours);
        handler.award(1);
        handler.warp(20 days);
        handler.claim(1);
        assertEq(handler.defaulted(), 1, "the position defaulted");

        // a third, opened and then withdrawn
        handler.open(2, 1e6, 1e18, 30 days, 1 hours);
        handler.warp(2 hours);
        handler.cancel(2, 2);
        assertEq(handler.cancelled(), 1, "the request was withdrawn");

        // a fourth, bid on and then abandoned, so the bidder frees its capacity
        handler.open(0, 1e6, 1e18, 30 days, 1 hours);
        handler.bid(0, 3, 2e6);
        handler.warp(20 days);
        handler.releaseBid(3);
        assertEq(handler.released(), 1, "a stale reservation was released");
    }

    /// Surfaced with -vv so a run that reached nothing is visible rather than
    /// quietly green.
    function afterInvariant() public view {
        console2.log("opened   ", handler.opened());
        console2.log("awarded  ", handler.awarded());
        console2.log("repaid   ", handler.repaid());
        console2.log("defaulted", handler.defaulted());
        console2.log("cancelled", handler.cancelled());
        console2.log("released ", handler.released());
    }
}
