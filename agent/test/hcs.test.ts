import { describe, it, expect } from "vitest";
import { canonical, reasoningRef, LocalPublisher, type ReasoningRecord } from "../src/hcs.js";

const base: ReasoningRecord = {
  requestId: "1",
  docHash: "0x09540aec3448e751a6173ccfd75fd8b9eaf023807261233e48cfff5ff0e55aa4",
  docFromChain: true,
  underwriter: "0x00000000000000000000000000000000000000a1",
  agent: "0x00000000000000000000000000000000000000a2",
  bid: true,
  repayAmount: "100800000000",
  rateBps: 973,
  reasons: ["senior, with a stated maturity"],
  flags: [],
  publishedAt: 1_788_000_000_000,
};

describe("canonical", () => {
  /**
   * JSON.stringify follows insertion order, which would make the reference
   * depend on how the object happened to be built rather than on what it says.
   */
  it("is independent of the order the object was built in", () => {
    const shuffled: ReasoningRecord = {
      publishedAt: base.publishedAt,
      flags: base.flags,
      reasons: base.reasons,
      rateBps: base.rateBps,
      repayAmount: base.repayAmount,
      bid: base.bid,
      agent: base.agent,
      underwriter: base.underwriter,
      docFromChain: base.docFromChain,
      docHash: base.docHash,
      requestId: base.requestId,
    };
    expect(canonical(shuffled)).toBe(canonical(base));
    expect(reasoningRef(shuffled)).toBe(reasoningRef(base));
  });
});

describe("reasoningRef", () => {
  it("is a bytes32 the contract can store", () => {
    expect(reasoningRef(base)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  /**
   * The reference binds the bid to *what* was reasoned, not to where the record
   * sits. Change any part of the reasoning and the reference changes, so a bid
   * cannot later be pointed at a different explanation.
   */
  it("changes when any part of the reasoning changes", () => {
    const ref = reasoningRef(base);
    const variants: ReasoningRecord[] = [
      { ...base, repayAmount: "100800000001" },
      { ...base, rateBps: 974 },
      { ...base, reasons: ["something else entirely"] },
      { ...base, flags: ["a flag that was not there"] },
      { ...base, docHash: `0x${"11".repeat(32)}` },
      { ...base, bid: false },
    ];
    for (const v of variants) expect(reasoningRef(v)).not.toBe(ref);
  });

  it("is stable across runs for identical content", () => {
    expect(reasoningRef({ ...base })).toBe(reasoningRef({ ...base }));
  });
});

describe("LocalPublisher", () => {
  it("still computes an honest reference when no topic is configured", async () => {
    const p = new LocalPublisher();
    const out = await p.publish(base);

    expect(out.ref).toBe(reasoningRef(base));
    expect(out.payload).toBe(canonical(base));
    // and it does not pretend consensus happened
    expect(out.topicId).toBe("(none)");
    expect(p.published).toHaveLength(1);
  });
});
