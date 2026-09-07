import { describe, expect, it, vi } from "vitest";
import { ClaudeReasoner } from "../src/claude.js";
import { MAX_EVIDENCE_CHARS } from "../src/reason.js";

/** A fetch that records what it was handed and answers with a fixed reply. */
function stub(reply: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply,
      text: async () => (typeof reply === "string" ? reply : JSON.stringify(reply)),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const answer = { content: [{ type: "text", text: '{"bid":false,"reasons":[],"flags":[]}' }] };

function body(calls: Array<{ init: RequestInit }>) {
  return JSON.parse(String(calls[0]?.init.body));
}

describe("ClaudeReasoner", () => {
  it("refuses to exist without a key", () => {
    expect(() => new ClaudeReasoner({ apiKey: "" })).toThrow(/API key/);
  });

  /**
   * The property the whole prompt design exists for. `buildPrompt` keeps the
   * document out of the instruction text; concatenating them here would undo
   * that silently, and the agent would be reading a counterparty's document as
   * though it were its own brief.
   */
  it("keeps the document in its own content block, never joined to the instruction", async () => {
    const { impl, calls } = stub(answer);
    const r = new ClaudeReasoner({ apiKey: "k", fetchImpl: impl });
    await r.think("SYSTEM", "INSTRUCTION", "DOCUMENT");

    const sent = body(calls);
    expect(sent.system).toBe("SYSTEM");
    expect(sent.messages[0].content).toHaveLength(2);
    expect(sent.messages[0].content[0].text).toBe("INSTRUCTION");
    expect(sent.messages[0].content[1].text).toBe("DOCUMENT");
    // No block may contain both halves.
    for (const block of sent.messages[0].content) {
      expect(block.text.includes("INSTRUCTION") && block.text.includes("DOCUMENT")).toBe(false);
    }
  });

  it("authenticates the way the Messages API expects", async () => {
    const { impl, calls } = stub(answer);
    await new ClaudeReasoner({ apiKey: "secret", fetchImpl: impl }).think("s", "i", "e");
    const h = calls[0]?.init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("secret");
    expect(h["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("returns the model's text so parseOpinion can judge it", async () => {
    const { impl } = stub({ content: [{ type: "text", text: "part one " }, { type: "text", text: "part two" }] });
    const out = await new ClaudeReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e");
    expect(out).toBe("part one part two");
  });

  /**
   * A document may be fetched up to 8 MB. Sending a prefix silently would let
   * the model conclude "no maturity stated" about a document whose maturity is
   * simply further down than this agent chose to read.
   */
  it("cuts an oversized document and says that it did", async () => {
    const { impl, calls } = stub(answer);
    const huge = "x".repeat(MAX_EVIDENCE_CHARS + 5_000);
    await new ClaudeReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", huge);

    const doc = body(calls).messages[0].content[1].text as string;
    expect(doc).toContain("cut off here");
    expect(doc).toContain("incomplete");
    expect(doc.length).toBeLessThan(huge.length);
  });

  it("leaves a document that fits completely alone", async () => {
    const { impl, calls } = stub(answer);
    await new ClaudeReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "a short prospectus");
    expect(body(calls).messages[0].content[1].text).toBe("a short prospectus");
  });

  it("carries the reason a request was refused, not just the status", async () => {
    const { impl } = stub("authentication_error: invalid x-api-key", 401);
    await expect(new ClaudeReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e")).rejects.toThrow(
      /401.*invalid x-api-key/,
    );
  });

  /** Empty is not a refusal to bid — it is no answer, and should read as one. */
  it("treats an empty reply as a failure rather than a malformed opinion", async () => {
    const { impl } = stub({ content: [{ type: "text", text: "   " }] });
    await expect(new ClaudeReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e")).rejects.toThrow(
      /no text/,
    );
  });

  it("gives up on a model that does not answer inside the auction", async () => {
    const impl = ((_u: unknown, init: unknown) =>
      new Promise((_resolve, reject) => {
        const signal = (init as { signal: AbortSignal }).signal;
        signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      })) as unknown as typeof fetch;

    vi.useFakeTimers();
    const r = new ClaudeReasoner({ apiKey: "k", timeoutMs: 50, fetchImpl: impl });
    const p = r.think("s", "i", "e");
    const assertion = expect(p).rejects.toThrow(/did not answer within 50ms/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    vi.useRealTimers();
  });
});
