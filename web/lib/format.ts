/**
 * Format a raw token amount for display.
 *
 * `dp` is a floor, not a ceiling. Truncating to two places turns a 30-minute
 * loan's entire fee - 0.006850 dUSD on a 2,000 principal - into "2,000", which
 * reads as a zero-interest loan and is the one number on the page a lender
 * cares about. So when `dp` would hide a non-zero fraction completely, the
 * fraction is shown in full instead of being cut down to a first significant
 * digit that would still understate it. A round amount still prints round.
 */
export function units(v: bigint, decimals: number, dp = 2): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = a / base;

  const full = (a % base).toString().padStart(decimals, "0");
  const cut = full.slice(0, Math.min(dp, decimals));
  const fracStr = (/[1-9]/.test(cut) ? cut : full).replace(/0+$/, "");

  const w = whole.toLocaleString("en-US");
  return `${neg ? "-" : ""}${w}${fracStr ? "." + fracStr : ""}`;
}

/** Decimal string -> raw units, without ever routing through a float. */
export function parseUnits(value: string, decimals: number): bigint {
  const t = value.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`not a positive amount: "${value}"`);
  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) throw new Error(`more than ${decimals} decimal places`);
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export function duration(seconds: number | bigint): string {
  const s = Number(seconds);
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400);
  if (d > 0) return `${d}d`;
  const h = Math.floor(s / 3600);
  if (h > 0) return `${h}h`;
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export const bps = (n: number) => `${(n / 100).toFixed(2)}%`;

/**
 * The rate on a loan, which is not always a number the contract can hold.
 *
 * `rateBps` returns a uint16 and deliberately caps rather than panics, so a
 * short loan carrying a coupon comes back saturated: request #12 paid 57.54 on
 * 2,000 over thirty minutes, which annualises to about 50,400% and is stored as
 * 65,535. Printing that as "655.35%" states a measurement the contract never
 * made, and reads as either a broken figure or a usurious one.
 *
 * At the ceiling this says so instead. Everything below it is exact.
 */
export const RATE_CEILING_BPS = 65535;

export const rateLabel = (n: number) => (n >= RATE_CEILING_BPS ? "over 655%" : bps(n));
