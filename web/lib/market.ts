/**
 * The shapes the market returns, and the one calculation the interface repeats.
 */

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_HASH = `0x${"00".repeat(32)}` as const;

/** What `RialtoMarket.get` answers with. */
export type Loan = {
  borrower: `0x${string}`;
  term: bigint;
  status: number;
  collateral: `0x${string}`;
  bidDeadline: bigint;
  docFromChain: boolean;
  cash: `0x${string}`;
  dueAt: bigint;
  lender: `0x${string}`;
  collateralAmount: bigint;
  principal: bigint;
  repayAmount: bigint;
  docName: `0x${string}`;
  docHash: `0x${string}`;
};

/** `bestBid`: who is on the hook, who submitted it, at what, and why. */
export type BestBid = readonly [`0x${string}`, `0x${string}`, bigint, `0x${string}`];

/**
 * Mirrors `RialtoMarket.rateBps` so a row does not need a chain call to show a
 * rate — and saturates where the contract does, because `rateBps` returns a
 * uint16 and caps rather than reverting. Anything at the ceiling is printed as
 * a ceiling by `rateLabel`, never as 655.35%.
 */
export function rateOf(principal: bigint, repay: bigint, term: bigint): number {
  if (repay <= principal || principal === 0n || term === 0n) return 0;
  const v = ((repay - principal) * 10_000n * 31_536_000n) / (principal * term);
  return v > 65535n ? 65535 : Number(v);
}

/**
 * A request id out of the address bar.
 *
 * `BigInt("abc")` throws, and thrown from a route component during render that
 * is a 500 rather than a page — typing a wrong character into the URL took the
 * whole route down. `BigInt` is also more permissive than a path segment should
 * be: it accepts "0x0c", " 12" and "1_2" as twelve, so an id has three spellings
 * and only one of them is real. Decimal digits, nothing else.
 */
export function parseRequestId(raw: string | undefined): bigint | null {
  if (typeof raw !== "string" || !/^\d{1,20}$/.test(raw)) return null;
  return BigInt(raw);
}
