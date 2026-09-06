// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Mandates} from "../../src/Mandates.sol";
import {RialtoMarket} from "../../src/RialtoMarket.sol";
import {Status, Request} from "../../src/RialtoTypes.sol";
import {MockERC20, MockSecurity} from "../mocks/Tokens.sol";

/**
 * Drives the market through random but legal-looking sequences.
 *
 * Reverts are expected and ignored: the point is not that every call succeeds,
 * it is that no reachable sequence of calls breaks the accounting. Time moves
 * forward on its own so auctions actually close and terms actually mature.
 */
contract Handler is CommonBase, StdCheats, StdUtils {
    Mandates public immutable mandates;
    RialtoMarket public immutable market;
    MockSecurity public immutable bond;
    MockERC20 public immutable cash;

    address[3] public borrowers;
    address[3] public underwriters;

    uint256 public opened;
    uint256 public awarded;
    uint256 public repaid;
    uint256 public defaulted;
    uint256 public cancelled;
    uint256 public released;
    uint256 public couponsRecorded;

    constructor(Mandates m, RialtoMarket mk, MockSecurity b, MockERC20 c) {
        mandates = m;
        market = mk;
        bond = b;
        cash = c;

        borrowers = [makeAddr("b0"), makeAddr("b1"), makeAddr("b2")];
        underwriters = [makeAddr("u0"), makeAddr("u1"), makeAddr("u2")];

        for (uint256 i; i < 3; i++) {
            bond.mint(borrowers[i], 1e30);
            cash.mint(borrowers[i], 1e30);
            vm.prank(borrowers[i]);
            bond.approve(address(market), type(uint256).max);
            vm.prank(borrowers[i]);
            cash.approve(address(market), type(uint256).max);

            cash.mint(underwriters[i], 1e30);
            vm.prank(underwriters[i]);
            cash.approve(address(market), type(uint256).max);

            // Generous, fixed mandates. They are deliberately never mutated
            // during the run: the exposure invariant is about the market's
            // arithmetic, not about an owner lowering a limit under a live bid.
            vm.startPrank(underwriters[i]);
            mandates.setMandate(address(0), 1e26, 5e26, 0, 60 days);
            mandates.allowAsset(address(bond), true);
            vm.stopPrank();
        }
    }

    function _borrower(uint256 s) internal view returns (address) {
        return borrowers[s % 3];
    }

    function _underwriter(uint256 s) internal view returns (address) {
        return underwriters[s % 3];
    }

    function _id(uint256 s) internal view returns (uint256) {
        uint256 n = market.requests();
        return n == 0 ? type(uint256).max : s % n;
    }

    function open(uint256 who, uint256 principal, uint256 collateral, uint256 term, uint256 window) public {
        principal = bound(principal, 1, 1e24);
        collateral = bound(collateral, 1, 1e24);
        term = bound(term, 1, uint256(market.MAX_TERM()));
        window = bound(window, market.MIN_BID_WINDOW(), 3 days);

        vm.prank(_borrower(who));
        try market.open(
            address(bond), collateral, address(cash), principal, uint64(term), uint64(window), bytes32("prospectus"), 0
        ) {
            opened++;
        } catch {}
    }

    function bid(uint256 who, uint256 id, uint256 repayAmount) public {
        id = _id(id);
        if (id == type(uint256).max) return;
        Request memory r = market.get(id);
        repayAmount = bound(repayAmount, r.principal, r.principal * 2 + 1);

        vm.prank(_underwriter(who));
        try market.bid(id, repayAmount, bytes32(0)) {} catch {}
    }

    function award(uint256 id) public {
        id = _id(id);
        if (id == type(uint256).max) return;
        try market.award(id) {
            awarded++;
        } catch {}
    }

    function repay(uint256 who, uint256 id) public {
        id = _id(id);
        if (id == type(uint256).max) return;
        vm.prank(_borrower(who));
        try market.repay(id) {
            repaid++;
        } catch {}
    }

    /**
     * Declare a coupon and record it against a live request.
     *
     * Without this the fuzzer never produces a non-zero `manufacturedOwed`, and
     * every invariant about settlement has only ever been checked on the easy
     * half of the arithmetic — the half where the netting term is zero.
     *
     * The rate is bounded rather than free so that both sides of the netting
     * rule get exercised: small coupons that net off cleanly, and ones large
     * enough to exceed the whole repayment and leave a residue.
     */
    function coupon(uint256 id, uint256 rate) public {
        id = _id(id);
        if (id == type(uint256).max) return;

        Request memory r = market.get(id);
        if (r.dueAt == 0) return;

        uint64 awardedAt = r.dueAt - r.term;
        if (block.timestamp < awardedAt) return;

        // The record date has to be inside the term *and* already behind us:
        // the security only fixes an entitlement once it passes, so a coupon
        // dated in the future makes `recordCoupon` revert and the whole action
        // becomes a silent no-op. Getting this wrong is how the netting
        // invariants end up passing without ever seeing a non-zero obligation.
        uint256 latest = block.timestamp < r.dueAt ? block.timestamp : r.dueAt;
        uint256 recordDate = bound(rate, awardedAt, latest);

        uint256 couponId = bond.setCouponAt(recordDate, bound(uint256(keccak256(abi.encode(rate))), 0, 2e18));
        try market.recordCoupon(id, couponId) {
            couponsRecorded++;
        } catch {}
    }

    function claim(uint256 id) public {
        id = _id(id);
        if (id == type(uint256).max) return;
        try market.claim(id) {
            defaulted++;
        } catch {}
    }

    function cancel(uint256 who, uint256 id) public {
        id = _id(id);
        if (id == type(uint256).max) return;
        vm.prank(_borrower(who));
        try market.cancel(id) {
            cancelled++;
        } catch {}
    }

    function releaseBid(uint256 id) public {
        id = _id(id);
        if (id == type(uint256).max) return;
        try market.releaseBid(id) {
            released++;
        } catch {}
    }

    /// Someone with no mandate at all, poking at every entry point.
    function stranger(uint256 id, uint256 repayAmount) public {
        id = _id(id);
        if (id == type(uint256).max) return;
        address who = makeAddr("nobody");
        vm.startPrank(who);
        try market.bid(id, repayAmount, bytes32(0)) {} catch {}
        try market.cancel(id) {} catch {}
        try market.repay(id) {} catch {}
        vm.stopPrank();
    }

    /// Auctions have to close and terms have to mature, or most of the state
    /// machine is unreachable.
    function warp(uint256 secs) public {
        vm.warp(block.timestamp + bound(secs, 1 hours, 20 days));
    }
}
