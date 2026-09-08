import { describe, expect, it } from "vitest";
import { parseRequestId, rateOf } from "../lib/market";
import { isRevert } from "../lib/retry";

describe("parseRequestId", () => {
  it("reads the ids that exist", () => {
    expect(parseRequestId("0")).toBe(0n);
    expect(parseRequestId("12")).toBe(12n);
    expect(parseRequestId("99999999999999999999")).toBe(99999999999999999999n);
  });

  it("refuses what BigInt would have thrown on", () => {
    // This was a 500: thrown during the render of a route component.
    expect(parseRequestId("abc")).toBeNull();
    expect(parseRequestId("")).toBeNull();
    expect(parseRequestId("1.5")).toBeNull();
    expect(parseRequestId(undefined)).toBeNull();
  });

  it("refuses the spellings BigInt would have quietly accepted", () => {
    // Every one of these is twelve to `BigInt`, which would give one loan four
    // addresses and four cache entries.
    expect(parseRequestId("0x0c")).toBeNull();
    expect(parseRequestId(" 12")).toBeNull();
    expect(parseRequestId("12 ")).toBeNull();
    expect(parseRequestId("1_2")).toBeNull();
    expect(parseRequestId("0o14")).toBeNull();
  });

  it("refuses a negative and an unbounded run of digits", () => {
    expect(parseRequestId("-1")).toBeNull();
    expect(parseRequestId("1".repeat(400))).toBeNull();
  });
});

describe("rateOf", () => {
  it("matches the contract on a loan that charges nothing", () => {
    expect(rateOf(2_000_000_000n, 2_000_000_000n, 1800n)).toBe(0);
    expect(rateOf(2_000_000_000n, 1_999_999_999n, 1800n)).toBe(0);
  });

  it("saturates where the uint16 does rather than wrapping", () => {
    // Request #12: 2,000 dUSD over thirty minutes, repaid 2,028.77.
    expect(rateOf(2_000_000_000n, 2_028_774_951n, 1800n)).toBe(65535);
  });

  it("is exact below the ceiling", () => {
    // 10% of the principal over exactly a year is 1,000 bps.
    expect(rateOf(1_000_000n, 1_100_000n, 31_536_000n)).toBe(1000);
  });

  it("does not divide by zero", () => {
    expect(rateOf(0n, 100n, 1800n)).toBe(0);
    expect(rateOf(100n, 200n, 0n)).toBe(0);
  });
});

describe("isRevert", () => {
  it("finds the revert however deep viem nests it", () => {
    const err = { name: "ContractFunctionExecutionError", cause: { name: "ContractFunctionRevertedError" } };
    expect(isRevert(err)).toBe(true);
  });

  it("does not call a transport failure an answer", () => {
    // Retrying this one can genuinely succeed, so it must not be mistaken for
    // the contract saying no.
    const err = { name: "HttpRequestError", cause: { name: "TimeoutError" } };
    expect(isRevert(err)).toBe(false);
    expect(isRevert(new Error("socket hang up"))).toBe(false);
    expect(isRevert(undefined)).toBe(false);
    expect(isRevert(null)).toBe(false);
  });

  it("gives up on a cause chain that points at itself", () => {
    const err: Record<string, unknown> = { name: "A" };
    err.cause = err;
    expect(isRevert(err)).toBe(false);
  });
});
