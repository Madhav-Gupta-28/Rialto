export function units(v: bigint, decimals: number, dp = 2): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = a / base;
  const frac = a % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, dp).replace(/0+$/, "");
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
