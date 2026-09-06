// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";
import {Mandates} from "../src/Mandates.sol";
import {MockHSS} from "./mocks/MockHSS.sol";
import {MockERC20} from "./mocks/Tokens.sol";
import {Status} from "../src/RialtoTypes.sol";

/**
 * A collateral token that calls back into the market mid-transfer.
 *
 * The point is not that the outer call fails — a token that reverts fails
 * anyway. It is that the *inner* call is refused by the lock rather than
 * running against half-written state, so the revert reason is captured and
 * asserted instead of being inferred from the outer failure.
 */
contract Reentrant is MockERC20 {
    RialtoMarket public market;
    bytes public innerRevert;
    bool public armed;

    constructor() MockERC20("Reentrant", "RE", 18) {}

    function arm(RialtoMarket m) external {
        market = m;
        armed = true;
    }

    function _move(address from, address to, uint256 amount) internal override {
        super._move(from, to, amount);
        if (armed && address(market) != address(0)) {
            armed = false;
            try market.claim(0) {
                innerRevert = hex"";
            } catch (bytes memory reason) {
                innerRevert = reason;
            }
        }
    }
}

/// Succeeds, returns true, moves nothing.
contract Liar {
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return true;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

/// Schedules, but answers `scheduleCall` with too few bytes to decode.
contract ShortHSS {
    function hasScheduleCapacity(uint256, uint256) external pure returns (bool) {
        return true;
    }

    function scheduleCall(address, uint256, uint256, uint64, bytes memory) external pure returns (bytes32) {
        return bytes32(uint256(22));
    }
}

/// Books schedules happily and refuses to release them.
contract UndeletableHSS {
    function hasScheduleCapacity(uint256, uint256) external pure returns (bool) {
        return true;
    }

    function scheduleCall(address, uint256, uint256, uint64, bytes memory) external pure returns (int64, address) {
        return (22, address(0xC0FFEE));
    }

    function deleteSchedule(address) external pure returns (int64) {
        revert("will not release");
    }
}

contract MarketGuardsTest is Base {
    /* ═════════ the reentrancy lock actually fires ═════════ */

    /**
     * Reentrancy is contained rather than merely fatal.
     *
     * The callback is refused, and the call it interrupted still completes with
     * consistent state — one request recorded, the collateral that actually
     * arrived escrowed against it. A guard that turned every hostile token into
     * a failed transaction would be safe but useless; this shows the outer call
     * is unharmed.
     */
    function test_aCallbackIsRefusedAndTheOuterCallStillCompletes() public {
        Reentrant evil = new Reentrant();
        evil.mint(borrower, collateralAmount);
        vm.prank(borrower);
        evil.approve(address(market), type(uint256).max);
        vm.prank(alice);
        mandates.allowAsset(address(evil), true);
        evil.arm(market);

        uint256 before = market.requests();
        vm.prank(borrower);
        uint256 id =
            market.open(address(evil), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, REAL_HASH);

        assertEq(market.requests(), before + 1, "exactly one request, not zero and not two");
        assertEq(market.get(id).collateralAmount, collateralAmount, "escrowed what arrived");
        assertEq(evil.balanceOf(address(market)), collateralAmount);
        assertEq(uint8(_status(id)), uint8(Status.Open));
        assertEq(bytes4(evil.innerRevert()), RialtoMarket.Reentrancy.selector, "and the callback was refused");
    }

    /// The same callback, on a path that tolerates it, so the reason is readable.
    function test_theLockReportsReentrancyRatherThanSomethingElse() public {
        Reentrant evil = new Reentrant();
        evil.mint(borrower, collateralAmount * 2);
        vm.prank(borrower);
        evil.approve(address(market), type(uint256).max);
        vm.prank(alice);
        mandates.allowAsset(address(evil), true);

        // Not armed: the first open succeeds and gives us a request to reenter on.
        vm.prank(borrower);
        market.open(address(evil), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, REAL_HASH);

        evil.arm(market);
        vm.prank(borrower);
        try market.open(
            address(evil), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, REAL_HASH
        ) {} catch {}

        assertEq(
            bytes4(evil.innerRevert()),
            RialtoMarket.Reentrancy.selector,
            "the inner call was refused by the lock, not by something downstream"
        );
    }

    /* ═════════ a token that lies about moving ═════════ */

    function test_aTransferThatMovesNothingIsRefused() public {
        Liar liar = new Liar();
        vm.prank(alice);
        mandates.allowAsset(address(liar), true);
        vm.prank(borrower);
        vm.expectRevert(RialtoMarket.NothingReceived.selector);
        market.open(address(liar), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, REAL_HASH);
    }

    /* ═════════ the mandate's agent binding ═════════ */

    /// A mandate naming an agent is not an invitation to the whole world.
    function test_aStrangerCannotBidAgainstSomeoneElsesMandate() public {
        uint256 id = _open();
        vm.prank(alice);
        mandates.setMandate(agentA, 500_000 * ONE_CASH, 1_000_000 * ONE_CASH, 0, 60 days);

        vm.prank(stranger);
        vm.expectRevert(RialtoMarket.NoMandate.selector);
        market.bid(id, goodBid, "");
    }

    /* ═════════ coupons on a request that never awarded ═════════ */

    function test_recordCouponRefusesARequestThatNeverFunded() public {
        uint256 id = _open();
        vm.expectRevert(RialtoMarket.NotAwarded.selector);
        market.recordCoupon(id, 1);
    }

    function test_scheduleCouponRefusesARequestThatNeverFunded() public {
        uint256 id = _open();
        vm.expectRevert(RialtoMarket.NotAwarded.selector);
        market.scheduleCoupon(id, 1);
    }

    /* ═════════ scheduling a coupon that cannot be scheduled ═════════ */

    /// Collateral with no coupon facet at all — a plain ERC-20, or a native token.
    function test_scheduleCouponRefusesASecurityWithNoCoupons() public {
        MockERC20 plain = new MockERC20("Plain", "PLN", 18);
        plain.mint(borrower, collateralAmount);
        vm.prank(borrower);
        plain.approve(address(market), type(uint256).max);
        vm.prank(alice);
        mandates.allowAsset(address(plain), true);

        vm.prank(borrower);
        uint256 id =
            market.open(address(plain), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, REAL_HASH);
        vm.prank(alice);
        market.bid(id, goodBid, "");
        vm.warp(block.timestamp + WINDOW + 1);
        market.award(id);

        vm.expectRevert(RialtoMarket.CouponUnschedulable.selector);
        market.scheduleCoupon(id, 1);
    }

    /// The coupon is readable and inside the term, but the network will not book it.
    function test_scheduleCouponRefusesWhenTheNetworkHasNoCapacity() public {
        MockHSS hss = _installHSS();
        uint256 id = _openBidAward();
        uint256 couponId = bond.setCouponAt(market.get(id).dueAt - 1 days, 1e16);

        hss.setCapacity(false);
        vm.expectRevert(RialtoMarket.CouponUnschedulable.selector);
        market.scheduleCoupon(id, couponId);
    }

    /* ═════════ the schedule service answering oddly ═════════ */

    /// Too few bytes to decode is not a schedule. Awarding must still succeed.
    function test_aTruncatedSchedulingAnswerDegradesToManualSettlement() public {
        ShortHSS short = new ShortHSS();
        vm.etch(HSS_ADDR, address(short).code);

        uint256 id = _openBidAward();
        assertEq(uint8(_status(id)), uint8(Status.Funded), "the loan funded regardless");
        assertEq(market.settlementSchedule(id), address(0), "and no schedule was recorded");
    }

    /// Releasing a schedule is a courtesy. It must never fail a repayment.
    function test_aScheduleThatCannotBeReleasedDoesNotBlockRepayment() public {
        UndeletableHSS stubborn = new UndeletableHSS();
        vm.etch(HSS_ADDR, address(stubborn).code);

        uint256 id = _openBidAward();
        assertTrue(market.settlementSchedule(id) != address(0), "a schedule was booked");

        vm.expectEmit(true, false, false, false, address(market));
        emit RialtoMarket.SettlementReleaseFailed(id, market.settlementSchedule(id));

        vm.prank(borrower);
        market.repay(id);
        assertEq(uint8(_status(id)), uint8(Status.Repaid), "the repayment went through anyway");
    }
}

/**
 * A mandate registry that does not keep its own invariant.
 *
 * The real `Mandates` guarantees that if it resolves an agent key to an owner,
 * that owner's mandate names the same key — so the market's cross-check can
 * never fire against it. But the registry is a constructor argument, and this
 * is what the market is being handed if that guarantee is ever weakened. The
 * check is defence against the dependency, so the dependency is what has to be
 * substituted to prove it works.
 */
contract LooseMandates {
    address public owner;
    Mandates.Mandate private m;
    mapping(address => bool) public allowed;

    function configure(address _owner, address agent, uint256 perDeal, uint256 total, uint64 maxTerm) external {
        owner = _owner;
        m = Mandates.Mandate(agent, perDeal, total, 0, maxTerm, true);
    }

    function allow(address asset) external {
        allowed[asset] = true;
    }

    /// Resolves *every* caller to the same owner, whatever the mandate says.
    function ownerOfAgent(address) external view returns (address) {
        return owner;
    }

    function mandateOf(address) external view returns (Mandates.Mandate memory) {
        return m;
    }

    function assetAllowed(address, address asset) external view returns (bool) {
        return allowed[asset];
    }
}

contract LooseRegistryTest is Base {
    function test_theMarketRefusesAKeyTheRegistryVouchesForButTheMandateDoesNot() public {
        LooseMandates loose = new LooseMandates();
        RialtoMarket m2 = new RialtoMarket(Mandates(address(loose)));

        // The registry resolves everyone to alice; alice's mandate names agentA.
        loose.configure(alice, agentA, 500_000 * ONE_CASH, 1_000_000 * ONE_CASH, 60 days);
        loose.allow(address(bond));

        vm.prank(borrower);
        bond.approve(address(m2), type(uint256).max);
        vm.prank(borrower);
        uint256 id =
            m2.open(address(bond), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, REAL_HASH);

        // agentA is the named agent, so it gets through.
        vm.prank(agentA);
        m2.bid(id, goodBid, "");

        // A stranger the registry also vouches for does not, because the
        // mandate itself names someone else.
        vm.prank(stranger);
        vm.expectRevert(RialtoMarket.NoMandate.selector);
        m2.bid(id, goodBid - 1, "");
    }
}
