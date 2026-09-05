// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IATSCoupon, CouponFor} from "./interfaces/IATS.sol";

/**
 * @title  CouponPassThrough
 * @notice The manufactured payment: working out what a pledged bond earned
 *         while it was pledged, and to whom.
 *
 * ## The problem this exists for
 *
 * A coupon belongs to whoever holds the security on the record date. Asset
 * Tokenization Studio decides that from a snapshot, and it is right to. But
 * while a Rialto loan is live the *escrow* holds the bond, so the escrow is the
 * holder of record — and the borrower, who still owns the thing economically
 * and gets it back on repayment, is credited with nothing.
 *
 * Demonstrated on testnet before any of this was written. With 10,500 RDN27
 * pledged and 4,200 unpledged, the security reported:
 *
 *     escrow    tokenBalance 10,500   payable 143.785674
 *     borrower  tokenBalance  4,200   payable  57.514269
 *
 * The coupon on the borrower's own bond accrued to a contract that has no way
 * to spend it.
 *
 * ## What repo actually does about it
 *
 * This is not a novel problem, it is a solved one. Under the GMRA the collateral
 * taker owes the collateral giver a *manufactured payment* equal to the income
 * the collateral threw off during the term. In practice it is netted against
 * what the borrower owes at repayment rather than wired separately, which is
 * what this library exists to compute.
 */
library CouponPassThrough {
    error CouponUnreadable();
    error RecordDateNotReached();
    error RecordDateOutsideLoan();

    /**
     * @notice The cash a borrower is owed for one coupon on one pledge.
     *
     * @param security The ATS security held in escrow.
     * @param escrow The address holding the collateral — this market.
     * @param couponId The coupon on the security.
     * @param pledged How much of the escrow's balance belongs to this request.
     * @param cashDecimals Decimals of the token the payment settles in.
     *
     * @dev Apportioned, not assumed. The escrow's balance at the record date
     *      covers every live request against that security at once, so a single
     *      request is owed the escrow's payable scaled by its own share of that
     *      balance. Taking the escrow's whole payable would pay one borrower
     *      with another borrower's coupon.
     *
     *      The payable arrives from ATS as an exact fraction rather than a
     *      rounded number, and it is kept that way until the last step so the
     *      apportioning does not compound a rounding error.
     */
    function owed(address security, address escrow, uint256 couponId, uint256 pledged, uint8 cashDecimals)
        internal
        view
        returns (uint256 cash, uint256 recordDate)
    {
        CouponFor memory c = _read(security, escrow, couponId);

        recordDate = c.coupon.recordDate;
        if (!c.couponAmount.recordDateReached) revert RecordDateNotReached();

        // Nothing was pledged into this snapshot, or the coupon pays nothing.
        if (c.tokenBalance == 0 || c.couponAmount.denominator == 0 || pledged == 0) return (0, recordDate);

        // owed = payable * (pledged / escrowBalance), carried to cash decimals.
        //
        // Bounds, so the multiply is provably safe: the numerator ATS returns is
        // itself scaled by the balance, so it stays proportional; with realistic
        // supplies every factor here is far below the point where 256 bits runs
        // out, and an unrealistic one reverts rather than wrapping.
        uint256 scale = 10 ** uint256(cashDecimals);
        cash = (c.couponAmount.numerator * pledged * scale) / (c.couponAmount.denominator * c.tokenBalance);
    }

    /**
     * @notice The record date of a coupon, or a flag saying it could not be read.
     * @dev Returns rather than reverts, because it is used while awarding a loan
     *      and a security that answers oddly must not stop one being funded.
     */
    function tryRecordDate(address security, address escrow, uint256 couponId)
        internal
        view
        returns (bool ok, uint256 recordDate)
    {
        (bool answered, bytes memory data) =
            security.staticcall(abi.encodeWithSelector(IATSCoupon.getCouponFor.selector, couponId, escrow));
        if (!answered || data.length < 17 * 32) return (false, 0);
        return (true, abi.decode(data, (CouponFor)).coupon.recordDate);
    }

    /// @notice How many coupons a security carries, or zero if it carries none.
    function tryCouponCount(address security) internal view returns (uint256) {
        (bool ok, bytes memory data) = security.staticcall(abi.encodeWithSelector(IATSCoupon.getCouponCount.selector));
        if (!ok || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }

    /**
     * @dev Raw, like every other outward call in this project. A high-level call
     *      carries an extcodesize check that reverts in the caller's frame for
     *      anything codeless, and on Hedera that includes native tokens. The
     *      struct is entirely static, so it decodes at fixed offsets.
     */
    function _read(address security, address account, uint256 couponId) private view returns (CouponFor memory) {
        (bool ok, bytes memory data) =
            security.staticcall(abi.encodeWithSelector(IATSCoupon.getCouponFor.selector, couponId, account));
        if (!ok || data.length < 17 * 32) revert CouponUnreadable();
        return abi.decode(data, (CouponFor));
    }

    /// @notice Decimals of the settlement token, read without a high-level call.
    function decimalsOf(address token) internal view returns (uint8) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || data.length < 32) revert CouponUnreadable();
        return uint8(abi.decode(data, (uint256)));
    }
}
