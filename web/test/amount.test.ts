import { describe, it, expect } from "vitest";
import { amount, days, seconds, basisPoints, term as parseTerm } from "../lib/amount";

describe("amount", () => {
  it("parses exactly, without a float anywhere", () => {
    expect(amount("10000", 6)).toEqual({ ok: true, value: 10_000_000_000n });
    expect(amount("0.000001", 6)).toEqual({ ok: true, value: 1n });
    // 1000.5 * 1e18 is past 2^53; a double would drift here.
    expect(amount("1000.5", 18)).toEqual({ ok: true, value: 1_000_500_000_000_000_000_000n });
  });

  /**
   * The failure that mattered. One decimal place too many used to throw inside
   * a `try` that returned `0n`, so the form stayed enabled and submitted a
   * zero bid — a wasted fee, and a number nobody chose.
   */
  it("refuses more decimals than the token has, rather than quietly zeroing", () => {
    const r = amount("1.1234567", 6);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toContain("6 decimal places");
  });

  it("refuses zero, blanks and anything that is not a positive number", () => {
    for (const bad of ["0", "0.0", "", "  ", "-1", "1e6", "abc", "1.2.3", "1,000"]) {
      expect(amount(bad, 6).ok, bad).toBe(false);
    }
  });

  it("enforces a floor when one is given", () => {
    expect(amount("9", 0, 10n).ok).toBe(false);
    expect(amount("10", 0, 10n).ok).toBe(true);
  });
});

describe("days", () => {
  it("converts to seconds and holds the contract's ceiling", () => {
    expect(days("30", 60)).toEqual({ ok: true, value: 2_592_000n });
    expect(days("60", 60).ok).toBe(true);
    expect(days("61", 60).ok).toBe(false);
  });

  /** `BigInt(Math.floor(Number("abc") * 86400))` threw a RangeError that no
   *  click handler caught, so the page simply stopped responding. */
  it("refuses input that would have produced NaN", () => {
    for (const bad of ["abc", "", "1.5", "-3", "Infinity"]) expect(days(bad, 60).ok, bad).toBe(false);
  });
});

describe("seconds", () => {
  it("holds both ends of the auction window the contract accepts", () => {
    expect(seconds("60", 60, 604_800).ok).toBe(true);
    expect(seconds("604800", 60, 604_800).ok).toBe(true);
    expect(seconds("59", 60, 604_800).ok).toBe(false);
    expect(seconds("604801", 60, 604_800).ok).toBe(false);
  });
});

describe("basisPoints", () => {
  it("stays inside a uint16", () => {
    expect(basisPoints("500")).toEqual({ ok: true, value: 500n });
    expect(basisPoints("65535").ok).toBe(true);
    expect(basisPoints("65536").ok).toBe(false);
    expect(basisPoints("5.5").ok).toBe(false);
  });
});

describe("term", () => {
  const MAX = 60 * 86_400; // RialtoMarket.MAX_TERM

  it("reads a length in either unit", () => {
    expect(parseTerm("30", "days", MAX)).toEqual({ ok: true, value: 2_592_000n });
    expect(parseTerm("1", "days", MAX)).toEqual({ ok: true, value: 86_400n });
    expect(parseTerm("12", "minutes", MAX)).toEqual({ ok: true, value: 720n });
    expect(parseTerm("1", "minutes", MAX)).toEqual({ ok: true, value: 60n });
  });

  it("reaches the short terms the browser could not open before", () => {
    // 720 seconds is the loan that let the network close one unattended while
    // somebody watched. The form used to round everything to whole days, so
    // this was only reachable from a terminal.
    expect(parseTerm("12", "minutes", MAX).ok).toBe(true);
  });

  it("holds the contract's own ceiling, whichever unit you say it in", () => {
    expect(parseTerm("60", "days", MAX)).toEqual({ ok: true, value: 5_184_000n });
    expect(parseTerm("86400", "minutes", MAX)).toEqual({ ok: true, value: 5_184_000n });
    expect(parseTerm("61", "days", MAX).ok).toBe(false);
    expect(parseTerm("86401", "minutes", MAX).ok).toBe(false);
  });

  it("says the limit in the unit that was typed", () => {
    const d = parseTerm("61", "days", MAX);
    expect(d.ok === false && d.why).toBe("at most 60 days");
    const m = parseTerm("999999", "minutes", MAX);
    expect(m.ok === false && m.why).toBe("at most 86,400 minutes");
  });

  it("refuses a term the contract would revert on", () => {
    // `term == 0` is BadTerm(), so it must never reach the wallet.
    expect(parseTerm("0", "minutes", MAX).ok).toBe(false);
    expect(parseTerm("0", "days", MAX).ok).toBe(false);
  });

  it("refuses what is not a whole number of them", () => {
    expect(parseTerm("1.5", "days", MAX).ok).toBe(false);
    expect(parseTerm("-1", "minutes", MAX).ok).toBe(false);
    expect(parseTerm("", "days", MAX).ok).toBe(false);
    expect(parseTerm("abc", "days", MAX).ok).toBe(false);
  });

  it("rejects an enormous number without losing precision on the way", () => {
    // Multiplying first would overflow a double; the comparison happens in the
    // chosen unit for exactly this reason.
    expect(parseTerm("9".repeat(30), "days", MAX).ok).toBe(false);
    expect(parseTerm(String(Number.MAX_SAFE_INTEGER), "minutes", MAX).ok).toBe(false);
  });
});
