/**
 * What a coupon inside the term costs the lender.
 *
 * The escrow is the holder of record while a loan is live, so the security pays
 * the coupon to the market and the market nets it off the repayment. That means
 * the *lender* bears it: they hand over the principal and receive back less than
 * the number they bid. An underwriter who ignores that is quoting one rate and
 * earning another.
 *
 * The awkward part is timing. An agent bids *before* the loan is awarded, so
 * every coupon that will fall inside the term is still in the future, and a
 * coupon with no record date behind it has no snapshot — the security cannot
 * yet say what it will pay anyone. Pricing off the snapshot therefore only ever
 * works in hindsight, which is no use to a bidder.
 *
 * So a future coupon is projected from its own terms instead: nominal value,
 * annual rate, and the accrual window it covers. That is the same calculation
 * the security will perform later, run early against the amount this request
 * has pledged.
 */

const SECONDS_PER_YEAR = 31_536_000n;

export type CouponView = {
  /** Ids as the security numbers them, from one. */
  couponId: number;
  recordDate: bigint;
  /** The escrow's balance in the snapshot, once the record date has passed. */
  tokenBalance: bigint;
  numerator: bigint;
  denominator: bigint;
  recordDateReached: boolean;
  /** The coupon's own terms, which are known before the record date. */
  rate: bigint;
  rateDecimals: number;
  startDate: bigint;
  endDate: bigint;
};

export type Instrument = {
  /** Decimals of the security itself. */
  decimals: number;
  nominalValue: bigint;
  nominalValueDecimals: number;
};

/**
 * The snapshot calculation, once the record date has passed.
 *
 * Deliberately identical to `CouponPassThrough.owed`. If the two ever disagree
 * the agent is pricing something the contract will not charge, so the test for
 * it checks against a figure the chain actually produced.
 */
export function owedForPledge(c: CouponView, pledged: bigint, cashDecimals: number): bigint {
  if (c.tokenBalance === 0n || c.denominator === 0n || pledged === 0n) return 0n;
  const scale = 10n ** BigInt(cashDecimals);
  return (c.numerator * pledged * scale) / (c.denominator * c.tokenBalance);
}

/**
 * What a coupon will pay on a pledge, worked out before it pays.
 *
 * `notional x rate x window / year`, carried to the cash token's decimals, with
 * every multiplication done before any division so a short window does not
 * truncate to nothing.
 */
export function projectForPledge(
  c: CouponView,
  inst: Instrument,
  pledged: bigint,
  cashDecimals: number,
): bigint {
  if (pledged === 0n || c.rate === 0n || inst.nominalValue === 0n) return 0n;
  const window = c.endDate > c.startDate ? c.endDate - c.startDate : 0n;
  if (window === 0n) return 0n;

  const numerator = pledged * inst.nominalValue * c.rate * window * 10n ** BigInt(cashDecimals);
  const denominator =
    10n ** BigInt(inst.decimals) *
    10n ** BigInt(inst.nominalValueDecimals) *
    10n ** BigInt(c.rateDecimals) *
    SECONDS_PER_YEAR;

  return numerator / denominator;
}

export type Exposure = {
  /** Total the lender should expect the market to net back off the repayment. */
  owed: bigint;
  /** Coupons priced from a snapshot the security has already taken. */
  settled: number[];
  /** Coupons still ahead, priced from their own terms. */
  projected: number[];
  /** Coupons inside the term that could not be priced at all. */
  unpriceable: number[];
};

/**
 * Everything the lender would owe back on a loan running `from` to `to`.
 *
 * A coupon whose record date has passed is priced off the snapshot, because
 * that is what the contract will use. One still ahead is projected from its
 * terms. One that is neither — no rate, no window — is reported rather than
 * assumed to be free, because understating a cost silently is the failure that
 * matters here.
 */
export function manufacturedExposure(
  coupons: CouponView[],
  inst: Instrument,
  from: bigint,
  to: bigint,
  pledged: bigint,
  cashDecimals: number,
): Exposure {
  let owed = 0n;
  const settled: number[] = [];
  const projected: number[] = [];
  const unpriceable: number[] = [];

  for (const c of coupons) {
    if (c.recordDate < from || c.recordDate > to) continue;

    if (c.recordDateReached && c.tokenBalance > 0n) {
      const amount = owedForPledge(c, pledged, cashDecimals);
      owed += amount;
      settled.push(c.couponId);
      continue;
    }

    const amount = projectForPledge(c, inst, pledged, cashDecimals);
    if (amount > 0n) {
      owed += amount;
      projected.push(c.couponId);
    } else {
      unpriceable.push(c.couponId);
    }
  }

  return { owed, settled, projected, unpriceable };
}
