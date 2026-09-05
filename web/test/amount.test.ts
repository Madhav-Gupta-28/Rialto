import { describe, it, expect } from "vitest";
import { amount, days, seconds, basisPoints } from "../lib/amount";

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
