import { describe, expect, it } from "vitest";
import { isRevert, refusalIn, REFUSALS } from "../src/refusals.js";

/**
 * The shape viem actually throws. Taken from the 8 September run, where a bid
 * on request #21 was refused as NotBetter and the message below is what reached
 * the agent.
 */
const viemRevert = (selector: string) =>
  Object.assign(new Error(`The contract function "bid" reverted with the following signature:\n${selector}\n\nUnable to decode signature "${selector}" as it was not found on the provided ABI.`), {
    shortMessage: `The contract function "bid" reverted with the following signature:\n${selector}`,
    name: "ContractFunctionExecutionError",
  });

describe("refusalIn", () => {
  it("recognises the refusal that cost us two orphan opinions", () => {
    const r = refusalIn(viemRevert("0xee269648"));
    expect(r?.selector).toBe("0xee269648");
    expect(r?.says).toContain("standing bid");
    // Nothing about a standing better bid changes on its own, so the agent must
    // stop reconsidering — that is the whole point of the fix.
    expect(r?.reconsider).toBe(false);
  });

  it("stops reconsidering a request whose auction has closed", () => {
    expect(refusalIn(viemRevert("0x36b6b46d"))?.reconsider).toBe(false);
    expect(refusalIn(viemRevert("0xddafad98"))?.reconsider).toBe(false);
  });

  it("comes back later for the two refusals an owner can lift", () => {
    // A mandate can be set, and exposure frees up as loans settle. Everything
    // else in the mandate family is a fixed limit this deal will never satisfy.
    expect(refusalIn(viemRevert("0x8814cafb"))?.reconsider).toBe(true);
    expect(refusalIn(viemRevert("0xb0b697d0"))?.reconsider).toBe(true);
    expect(refusalIn(viemRevert("0x5cf4d029"))?.reconsider).toBe(false);
    expect(refusalIn(viemRevert("0xa4d95a3d"))?.reconsider).toBe(false);
  });

  it("is case-insensitive about the selector", () => {
    expect(refusalIn(viemRevert("0xEE269648"))?.selector).toBe("0xee269648");
  });

  it("does not claim a refusal it cannot name", () => {
    // An unknown revert has to keep throwing. Swallowing it would turn a real
    // fault into a request the agent silently ignores for the rest of the run.
    expect(refusalIn(viemRevert("0xdeadbeef"))).toBeUndefined();
    expect(refusalIn(new Error("socket hang up"))).toBeUndefined();
    expect(refusalIn(undefined)).toBeUndefined();
    expect(refusalIn(null)).toBeUndefined();
  });

  it("does not mistake a transaction hash for a selector", () => {
    // A 66-character hash contains no standalone 8-hex-digit word, so the
    // word boundary in the pattern is load-bearing.
    const hash = "0x39900ffde03fff58ad895d3fd91ebc560846ac0309e1948dfa14f4be48b36b45";
    expect(refusalIn(new Error(`bid reverted on chain: ${hash}`))).toBeUndefined();
  });

  it("names every selector it lists", () => {
    for (const [selector, r] of Object.entries(REFUSALS)) {
      expect(selector).toMatch(/^0x[0-9a-f]{8}$/);
      expect(r.says.length).toBeGreaterThan(10);
    }
  });
});

describe("isRevert", () => {
  it("recognises the mark submitBid puts on a reverted receipt", () => {
    const e = Object.assign(new Error("bid reverted on chain: 0xabc"), { reverted: true });
    expect(isRevert(e)).toBe(true);
  });

  it("recognises the error viem throws when the node reports it at send time", () => {
    expect(isRevert(viemRevert("0xee269648"))).toBe(true);
    expect(isRevert({ name: "X", cause: { name: "ContractFunctionRevertedError" } })).toBe(true);
  });

  it("does not call a dropped connection a refusal", () => {
    // This one has to keep throwing so the loop retries it on the next poll.
    expect(isRevert(new Error("socket hang up"))).toBe(false);
    expect(isRevert({ name: "HttpRequestError", cause: { name: "TimeoutError" } })).toBe(false);
    expect(isRevert(undefined)).toBe(false);
  });

  it("gives up on a cause chain that points at itself", () => {
    const e: Record<string, unknown> = { name: "A" };
    e.cause = e;
    expect(isRevert(e)).toBe(false);
  });
});
