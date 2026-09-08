// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {Status} from "../src/RialtoTypes.sol";

/**
 * A coupon worth more than the whole repayment.
 *
 * Over-collateralisation makes this reachable rather than theoretical: a
 * borrower pledging a large holding against a small principal can earn more
 * income on the pledge than the loan costs. Netting is capped by what the
 * borrower owes, so the excess has to survive as a debt rather than evaporate
 * into the lender's pocket.
 */
contract CouponExcessTest is Base {
    function _excessCoupon(uint256 id) internal returns (uint256 couponId) {
        uint256 due = market.get(id).dueAt;
        couponId = bond.setCouponAt(due - 1 days, 1e18); // 1 cash unit per token
        vm.warp(block.timestamp + TERM - 1 days + 1);
    }

    function test_theExcessSurvivesRepaymentAsADebt() public {
        uint256 id = _openBidAward();
        market.recordCoupon(id, _excessCoupon(id));

        uint256 owed = market.manufacturedOwed(id);
        uint256 agreed = market.get(id).repayAmount;
        assertGt(owed, agreed, "the case only exists if the coupon exceeds the repayment");

        uint256 lenderBefore = cash.balanceOf(alice);

        vm.prank(borrower);
        market.repay(id);

        assertEq(uint8(_status(id)), uint8(Status.Repaid));
        assertEq(cash.balanceOf(alice), lenderBefore, "the lender receives nothing; the coupon covered it all");
        assertEq(market.manufacturedOwed(id), owed - agreed, "and still owes the difference");
    }

    function test_andTheLenderCanThenPayIt() public {
        uint256 id = _openBidAward();
        market.recordCoupon(id, _excessCoupon(id));
        uint256 residual = market.manufacturedOwed(id) - market.get(id).repayAmount;

        vm.prank(borrower);
        market.repay(id);

        uint256 borrowerBefore = cash.balanceOf(borrower);
        uint256 lenderBefore = cash.balanceOf(alice);

        vm.prank(alice);
        cash.approve(address(market), type(uint256).max);
        vm.prank(alice);
        market.settleManufacturedPayment(id);

        assertEq(cash.balanceOf(borrower) - borrowerBefore, residual, "the borrower is made whole");
        assertEq(lenderBefore - cash.balanceOf(alice), residual, "out of the lender's pocket");
        assertEq(market.manufacturedOwed(id), 0);
    }

    /// The ordinary case must not change: a coupon smaller than the repayment
    /// still nets to zero and leaves no residue.
    function test_theOrdinaryCaseStillNetsCleanly() public {
        uint256 id = _openBidAward();
        uint256 due = market.get(id).dueAt;
        uint256 couponId = bond.setCouponAt(due - 1 days, 1e15);
        vm.warp(block.timestamp + TERM - 1 days + 1);
        market.recordCoupon(id, couponId);

        uint256 owed = market.manufacturedOwed(id);
        uint256 agreed = market.get(id).repayAmount;
        assertLt(owed, agreed);
        uint256 lenderBefore = cash.balanceOf(alice);

        vm.prank(borrower);
        market.repay(id);

        assertEq(cash.balanceOf(alice) - lenderBefore, agreed - owed, "the lender receives the repayment less the coupon");
        assertEq(market.manufacturedOwed(id), 0, "nothing left over");
    }
}
