import { describe, expect, it } from "vitest";
import { couponsInTerm, settlementLedger, type RawCoupon } from "../lib/coupons";

const coupon = (recordDate: number, reached: boolean, balance = 1000n): RawCoupon => ({
  tokenBalance: balance,
  recordDateReached: reached,
  coupon: { recordDate: BigInt(recordDate) },
});

const AWARD = 1_000_000;
const DUE = 1_000_900;

describe("couponsInTerm", () => {
  it("keeps a coupon whose record date falls inside the term", () => {
    const rows = couponsInTerm([coupon(1_000_500, true)], [false], AWARD, DUE);
    expect(rows).toHaveLength(1);
    expect(rows[0].couponId).toBe(1);
  });

  /// The security numbers coupons from one; the array is indexed from zero. An
  /// off-by-one here books the wrong coupon.
  it("numbers coupons the way the security does", () => {
    const rows = couponsInTerm(
      [coupon(1, false), coupon(1_000_500, true), coupon(1_000_600, true)],
      [false, false, false],
      AWARD,
      DUE,
    );
    expect(rows.map((r) => r.couponId)).toEqual([2, 3]);
  });

  it("drops one that pays before the loan was awarded", () => {
    expect(couponsInTerm([coupon(AWARD - 1, true)], [false], AWARD, DUE)).toHaveLength(0);
  });

  it("drops one that pays after maturity", () => {
    expect(couponsInTerm([coupon(DUE + 1, false)], [false], AWARD, DUE)).toHaveLength(0);
  });

  /// The contract's window is inclusive at both ends, and offering a button the
  /// contract would reject is worse than offering none.
  it("keeps the coupons exactly on each boundary", () => {
    const rows = couponsInTerm([coupon(AWARD, true), coupon(DUE, false)], [false, false], AWARD, DUE);
    expect(rows).toHaveLength(2);
  });

  it("offers scheduling before the record date and recording after it", () => {
    const rows = couponsInTerm([coupon(1_000_500, false), coupon(1_000_600, true)], [false, false], AWARD, DUE);
    expect(rows[0].action).toBe("schedule");
    expect(rows[1].action).toBe("record");
  });

  it("offers nothing once the market has counted it", () => {
    const rows = couponsInTerm([coupon(1_000_500, true)], [true], AWARD, DUE);
    expect(rows[0].counted).toBe(true);
    expect(rows[0].action).toBe("none");
  });

  /// A failed read is not a coupon that does not exist. Skipping it is right;
  /// treating it as zero and offering to record it would not be.
  it("skips a read that did not come back", () => {
    const rows = couponsInTerm([undefined, coupon(1_000_500, true)], [undefined, false], AWARD, DUE);
    expect(rows).toHaveLength(1);
    expect(rows[0].couponId).toBe(2);
  });

  it("handles a security with no coupons at all", () => {
    expect(couponsInTerm([], [], AWARD, DUE)).toEqual([]);
  });
});

describe("settlementLedger", () => {
  it("nets the coupon off the repayment", () => {
    const l = settlementLedger(4_010_000_000n, 57_534_246n);
    expect(l.borrowerPays).toBe(3_952_465_754n);
    expect(l.residual).toBe(0n);
  });

  /// The bug that was shipped once: a coupon larger than the repayment used to
  /// zero the whole obligation, handing the lender the difference.
  it("caps netting at the repayment and keeps the excess as a debt", () => {
    const l = settlementLedger(100_800n, 105_000n);
    expect(l.netted).toBe(100_800n);
    expect(l.borrowerPays).toBe(0n);
    expect(l.residual).toBe(4_200n);
  });

  it("is a no-op when no coupon was recorded", () => {
    const l = settlementLedger(4_010_000_000n, 0n);
    expect(l.borrowerPays).toBe(4_010_000_000n);
    expect(l.residual).toBe(0n);
  });

  it("handles a coupon exactly equal to the repayment", () => {
    const l = settlementLedger(1_000n, 1_000n);
    expect(l.borrowerPays).toBe(0n);
    expect(l.residual).toBe(0n);
  });
});
