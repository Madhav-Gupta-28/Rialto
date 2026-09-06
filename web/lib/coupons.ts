/**
 * Which coupons a loan is actually on the hook for, and what that does to the
 * repayment.
 *
 * Kept out of the component because this is the part that can be wrong in a way
 * nobody notices: a coupon counted that fell outside the term is money moved
 * between two parties who never agreed to it.
 */

export type RawCoupon = {
  tokenBalance: bigint;
  recordDateReached: boolean;
  coupon: { recordDate: bigint };
};

export type CouponRow = {
  couponId: number;
  recordDate: number;
  /** The record date has passed, so the security has fixed an entitlement. */
  reached: boolean;
  /** What the escrow held in that snapshot. */
  snapshot: bigint;
  /** The market has already added this one to what the lender owes. */
  counted: boolean;
  /** What a viewer can do about it now. */
  action: "schedule" | "record" | "none";
};

/**
 * Only income earned *while pledged* passes through the market. A coupon whose
 * record date falls outside the term is between the holder and the issuer, and
 * the contract refuses it — so offering it here would be offering a button that
 * reverts.
 *
 * The window is inclusive at both ends, matching `recordCoupon`.
 */
export function couponsInTerm(
  coupons: (RawCoupon | undefined)[],
  recorded: (boolean | undefined)[],
  awardedAt: number,
  dueAt: number,
): CouponRow[] {
  const rows: CouponRow[] = [];

  for (let i = 0; i < coupons.length; i++) {
    const c = coupons[i];
    if (!c) continue;

    const recordDate = Number(c.coupon.recordDate);
    if (recordDate < awardedAt || recordDate > dueAt) continue;

    const counted = recorded[i] === true;
    rows.push({
      couponId: i + 1, // the security numbers coupons from one
      recordDate,
      reached: c.recordDateReached,
      snapshot: c.tokenBalance,
      counted,
      action: counted ? "none" : c.recordDateReached ? "record" : "schedule",
    });
  }

  return rows;
}

/**
 * What the borrower hands over, and what survives if the coupon is larger.
 *
 * Mirrors the contract exactly: netting is capped by the repayment, and the
 * excess stays a debt rather than evaporating. Duplicating the rule is the
 * point — if the two ever disagree, the screen is lying about money.
 */
export function settlementLedger(agreed: bigint, owed: bigint) {
  const netted = owed > agreed ? agreed : owed;
  return {
    agreed,
    owed,
    netted,
    borrowerPays: agreed - netted,
    residual: owed - netted,
  };
}
