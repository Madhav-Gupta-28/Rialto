import { describe, expect, it } from "vitest";
import {
  manufacturedExposure,
  owedForPledge,
  projectForPledge,
  type CouponView,
  type Instrument,
} from "../src/coupons.js";

/**
 * Coupon 6 on the live RDN27 bond, read from Hedera testnet. The market
 * recorded 57.534246 dUSD against a 4,200 RDN27 pledge, and the repayment came
 * out at 4,010.000000 - 57.534246 = 3,952.465754.
 *
 * The point of pinning it to real values is that this arithmetic is duplicated
 * from Solidity. Checking it against itself would prove nothing.
 */
const REAL: CouponView = {
  couponId: 6,
  recordDate: 1788634517n,
  tokenBalance: 4200n * 10n ** 18n,
  numerator: 18144000000000000000000000000000n,
  denominator: 315360000000000000000000000000n,
  recordDateReached: true,
  // The same coupon's own terms: 5% annual over a one-day accrual window.
  rate: 500n,
  rateDecimals: 4,
  startDate: 1788634367n,
  endDate: 1788720767n,
};

/** RDN27, as the live security reports itself. */
const RDN27: Instrument = { decimals: 18, nominalValue: 100n, nominalValueDecimals: 0 };

describe("owedForPledge", () => {
  it("reproduces what the contract recorded on-chain", () => {
    expect(owedForPledge(REAL, 4200n * 10n ** 18n, 6)).toBe(57_534_246n);
  });

  /// Half the pledge, half the coupon: the escrow's snapshot covers every live
  /// request against the security at once.
  it("apportions by the request's share of the snapshot", () => {
    expect(owedForPledge(REAL, 2100n * 10n ** 18n, 6)).toBe(28_767_123n);
  });

  it("is zero when nothing was pledged", () => {
    expect(owedForPledge(REAL, 0n, 6)).toBe(0n);
  });

  it("is zero when the snapshot held nothing", () => {
    expect(owedForPledge({ ...REAL, tokenBalance: 0n }, 100n, 6)).toBe(0n);
  });

  it("does not divide by a zero denominator", () => {
    expect(owedForPledge({ ...REAL, denominator: 0n }, 100n, 6)).toBe(0n);
  });

  /**
   * Scaling and truncation have to commute, or the same coupon is worth
   * different money depending on which cash token the loan settles in.
   * Multiplying the 6-decimal answer up is *not* the property — that would
   * assert the truncated digits were zero, which they are not.
   */
  it("gives the same answer at 6 and 18 decimals, once truncated alike", () => {
    const six = owedForPledge(REAL, 4200n * 10n ** 18n, 6);
    const eighteen = owedForPledge(REAL, 4200n * 10n ** 18n, 18);
    expect(eighteen / 10n ** 12n).toBe(six);
    expect(eighteen).toBeGreaterThan(six * 10n ** 12n);
  });
});

describe("manufacturedExposure", () => {
  const pledged = 4200n * 10n ** 18n;

  it("prices a coupon that falls inside the term", () => {
    const e = manufacturedExposure([REAL], RDN27, 1788634000n, 1788635260n, pledged, 6);
    expect(e.owed).toBe(57_534_246n);
    expect(e.settled).toEqual([6]);
    expect(e.unpriceable).toEqual([]);
  });

  it("ignores one that pays before the loan starts", () => {
    const e = manufacturedExposure([REAL], RDN27, 1788634518n, 1788635260n, pledged, 6);
    expect(e.owed).toBe(0n);
    expect(e.settled).toEqual([]);
  });

  it("ignores one that pays after maturity", () => {
    const e = manufacturedExposure([REAL], RDN27, 1788634000n, 1788634516n, pledged, 6);
    expect(e.owed).toBe(0n);
  });

  it("includes the coupons exactly on each boundary", () => {
    const e = manufacturedExposure([REAL], RDN27, REAL.recordDate, REAL.recordDate, pledged, 6);
    expect(e.settled).toEqual([6]);
  });

  /**
   * A coupon still to come has no snapshot, so the security cannot say what it
   * will pay. Reporting it separately understates the cost visibly rather than
   * pretending the exposure is zero.
   */
  /**
   * The case that actually happens. An agent bids before the loan is awarded,
   * so every coupon inside the term is still ahead and has no snapshot. Pricing
   * it off the snapshot would return zero and quietly understate the cost.
   */
  it("projects a coupon that has not paid yet, rather than pricing it at zero", () => {
    const future = { ...REAL, couponId: 7, recordDateReached: false, tokenBalance: 0n };
    const e = manufacturedExposure([future], RDN27, 1788634000n, 1788635260n, pledged, 6);
    expect(e.projected).toEqual([7]);
    expect(e.settled).toEqual([]);
    expect(e.owed).toBe(57_534_246n);
  });

  /// A coupon with no terms to project from is reported, not assumed free.
  it("reports a coupon it cannot price at all", () => {
    const opaque = { ...REAL, couponId: 8, recordDateReached: false, tokenBalance: 0n, rate: 0n };
    const e = manufacturedExposure([opaque], RDN27, 1788634000n, 1788635260n, pledged, 6);
    expect(e.owed).toBe(0n);
    expect(e.unpriceable).toEqual([8]);
  });

  it("sums several coupons in the same term", () => {
    const second = { ...REAL, couponId: 7, recordDate: REAL.recordDate + 10n };
    const e = manufacturedExposure([REAL, second], RDN27, 1788634000n, 1788635260n, pledged, 6);
    expect(e.owed).toBe(57_534_246n * 2n);
    expect(e.settled).toEqual([6, 7]);
  });

  it("is zero for a security with no coupons", () => {
    expect(manufacturedExposure([], RDN27, 0n, 1n << 40n, pledged, 6).owed).toBe(0n);
  });
});

describe("projectForPledge", () => {
  /**
   * The projection and the snapshot are two different routes to the same
   * number, and this is the check that they arrive together: 57.534246 dUSD is
   * what Hedera actually recorded against the 4,200 RDN27 pledge.
   */
  it("agrees with what the security paid, before the security has paid it", () => {
    expect(projectForPledge(REAL, RDN27, 4200n * 10n ** 18n, 6)).toBe(57_534_246n);
    expect(projectForPledge(REAL, RDN27, 4200n * 10n ** 18n, 6)).toBe(
      owedForPledge(REAL, 4200n * 10n ** 18n, 6),
    );
  });

  it("halves with the pledge", () => {
    expect(projectForPledge(REAL, RDN27, 2100n * 10n ** 18n, 6)).toBe(28_767_123n);
  });

  it("is zero for a coupon with no accrual window", () => {
    expect(projectForPledge({ ...REAL, endDate: REAL.startDate }, RDN27, 4200n * 10n ** 18n, 6)).toBe(0n);
  });

  it("is zero for a zero rate, a zero pledge, or a zero nominal", () => {
    expect(projectForPledge({ ...REAL, rate: 0n }, RDN27, 4200n * 10n ** 18n, 6)).toBe(0n);
    expect(projectForPledge(REAL, RDN27, 0n, 6)).toBe(0n);
    expect(projectForPledge(REAL, { ...RDN27, nominalValue: 0n }, 4200n * 10n ** 18n, 6)).toBe(0n);
  });

  /// A short window must not truncate away before it is scaled.
  it("survives an accrual window of a single second", () => {
    const oneSecond = { ...REAL, endDate: REAL.startDate + 1n };
    expect(projectForPledge(oneSecond, RDN27, 4200n * 10n ** 18n, 6)).toBeGreaterThan(0n);
  });
});

/**
 * The window is a belief about when the loan will start, not a fact — award has
 * not happened when a bid is placed. These pin what that belief does at its
 * edges, because both failures are silent: one overcharges the borrower for
 * income the lender never receives, the other has the lender eat a cost it did
 * not quote.
 */
describe("the term window is an estimate, and its edges matter", () => {
  const pledged = 4200n * 10n ** 18n;
  const deadline = 1_000_000n;
  const term = 1_000n;

  it("prices a coupon inside the window it was given", () => {
    const c = { ...REAL, recordDate: deadline + 500n };
    expect(manufacturedExposure([c], RDN27, deadline, deadline + term, pledged, 6).owed).toBeGreaterThan(0n);
  });

  /**
   * A late award shifts the real term forward. This coupon is inside the
   * assumed window and outside the real one, so the agent prices it and
   * `recordCoupon` refuses it — the borrower pays for income nobody passes on.
   */
  it("a coupon before a late award is priced here and would not be recorded", () => {
    const c = { ...REAL, recordDate: deadline + 10n };
    const assumed = manufacturedExposure([c], RDN27, deadline, deadline + term, pledged, 6);
    const actualLateAward = manufacturedExposure([c], RDN27, deadline + 100n, deadline + 100n + term, pledged, 6);

    expect(assumed.owed).toBeGreaterThan(0n);
    expect(actualLateAward.owed).toBe(0n);
  });

  /// The mirror image: inside the real term, outside the assumed one.
  it("a coupon past the assumed window can still fall inside the real one", () => {
    const c = { ...REAL, recordDate: deadline + term + 50n };
    const assumed = manufacturedExposure([c], RDN27, deadline, deadline + term, pledged, 6);
    const actualLateAward = manufacturedExposure([c], RDN27, deadline + 100n, deadline + 100n + term, pledged, 6);

    expect(assumed.owed).toBe(0n);
    expect(actualLateAward.owed).toBeGreaterThan(0n);
  });

  /// When award is prompt, the estimate is exact. That is the ordinary case.
  it("is exact when award lands on the deadline", () => {
    const c = { ...REAL, recordDate: deadline + 500n };
    const assumed = manufacturedExposure([c], RDN27, deadline, deadline + term, pledged, 6);
    const actual = manufacturedExposure([c], RDN27, deadline, deadline + term, pledged, 6);
    expect(assumed.owed).toBe(actual.owed);
  });
});
