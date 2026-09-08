/**
 * Turning what someone typed into a number the chain will accept.
 *
 * Every function here returns a result rather than throwing or falling back to
 * zero. Swallowing a parse failure is the dangerous shape: a field with one too
 * many decimal places silently becomes `0n`, the button stays enabled, and the
 * user pays for a transaction that was never going to work. Worse, a zero bid
 * looks like a deliberate one.
 */

export type Parsed = { ok: true; value: bigint } | { ok: false; why: string };

/**
 * Decimal string to raw units. Never routes through a float, because at 18
 * decimals a double stops representing integers exactly well before the values
 * involved here.
 */
export function amount(input: string, decimals: number, min = 0n): Parsed {
  const t = input.trim();
  if (t === "") return { ok: false, why: "required" };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, why: "must be a positive number" };

  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) {
    return { ok: false, why: `at most ${decimals} decimal place${decimals === 1 ? "" : "s"}` };
  }

  const value = BigInt(whole + frac.padEnd(decimals, "0"));
  if (value < min) return { ok: false, why: "too small" };
  if (value === 0n) return { ok: false, why: "must be more than zero" };
  return { ok: true, value };
}

/**
 * How long a loan runs, in whichever unit the borrower is thinking in.
 *
 * The contract takes any term from one second to sixty days. This form used to
 * take whole days only, which quietly put the market's most interesting ending
 * out of reach of anyone using it: a loan opened in the browser could not mature
 * before tomorrow, so nobody could sit and watch Hedera close one by itself.
 * That branch had to be opened from a terminal to be seen at all.
 *
 * The maximum is given in seconds, because it is the contract's, and converted
 * for the message — telling somebody who typed minutes that the limit is
 * 5,184,000 is telling them nothing.
 */
export type TermUnit = "days" | "minutes";

const PER: Record<TermUnit, number> = { minutes: 60, days: 86_400 };
const ONE: Record<TermUnit, string> = { minutes: "minute", days: "day" };

export function term(input: string, unit: TermUnit, maxSeconds: number): Parsed {
  const t = input.trim();
  if (t === "") return { ok: false, why: "required" };
  if (!/^\d+$/.test(t)) return { ok: false, why: `whole ${unit} only` };

  const n = Number(t);
  if (!Number.isSafeInteger(n) || n <= 0) return { ok: false, why: `at least one ${ONE[unit]}` };

  // Compared in the chosen unit rather than in seconds, so a number far past
  // the limit cannot lose precision on the way to being rejected.
  const per = PER[unit];
  const most = Math.floor(maxSeconds / per);
  if (n > most) return { ok: false, why: `at most ${most.toLocaleString("en-US")} ${unit}` };

  return { ok: true, value: BigInt(n) * BigInt(per) };
}

/** A whole number of days, as seconds. */
export function days(input: string, maxDays: number): Parsed {
  const t = input.trim();
  if (t === "") return { ok: false, why: "required" };
  if (!/^\d+$/.test(t)) return { ok: false, why: "whole days only" };

  const n = Number(t);
  if (!Number.isSafeInteger(n) || n <= 0) return { ok: false, why: "must be at least one day" };
  if (n > maxDays) return { ok: false, why: `at most ${maxDays} days` };
  return { ok: true, value: BigInt(n) * 86_400n };
}

/** A whole number of seconds, bounded at both ends the way the contract is. */
export function seconds(input: string, min: number, max: number): Parsed {
  const t = input.trim();
  if (t === "") return { ok: false, why: "required" };
  if (!/^\d+$/.test(t)) return { ok: false, why: "whole seconds only" };

  const n = Number(t);
  if (!Number.isSafeInteger(n)) return { ok: false, why: "not a number" };
  if (n < min) return { ok: false, why: `at least ${min} seconds` };
  if (n > max) return { ok: false, why: `at most ${max} seconds` };
  return { ok: true, value: BigInt(n) };
}

/** Basis points, as the contract stores them: a uint16. */
export function basisPoints(input: string): Parsed {
  const t = input.trim();
  if (t === "") return { ok: false, why: "required" };
  if (!/^\d+$/.test(t)) return { ok: false, why: "whole basis points only" };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n > 65535) return { ok: false, why: "at most 65535" };
  return { ok: true, value: BigInt(n) };
}
