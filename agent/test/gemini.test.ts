import { describe, expect, it, vi } from "vitest";
import { GeminiReasoner } from "../src/gemini.js";
import { MAX_EVIDENCE_CHARS } from "../src/reason.js";

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

const answer = {
  candidates: [{ content: { parts: [{ text: '{"bid":false,"reasons":[],"flags":[]}' }] }, finishReason: "STOP" }],
};

const body = (calls: Array<{ init: RequestInit }>) => JSON.parse(String(calls[0]?.init.body));

describe("GeminiReasoner", () => {
  it("refuses to exist without a key", () => {
    expect(() => new GeminiReasoner({ apiKey: "" })).toThrow(/API key/);
  });

  /** The property every reasoner has to preserve: a brief is not a document. */
  it("keeps the document in its own part, never joined to the instruction", async () => {
    const { impl, calls } = stub(answer);
    await new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("SYSTEM", "INSTRUCTION", "DOCUMENT");

    const sent = body(calls);
    expect(sent.systemInstruction.parts[0].text).toBe("SYSTEM");
    expect(sent.contents[0].parts).toHaveLength(2);
    expect(sent.contents[0].parts[0].text).toBe("INSTRUCTION");
    expect(sent.contents[0].parts[1].text).toBe("DOCUMENT");
    for (const part of sent.contents[0].parts) {
      expect(part.text.includes("INSTRUCTION") && part.text.includes("DOCUMENT")).toBe(false);
    }
  });

  it("puts the key in a header, not the URL", async () => {
    const { impl, calls } = stub(answer);
    await new GeminiReasoner({ apiKey: "secret", fetchImpl: impl }).think("s", "i", "e");
    expect((calls[0]?.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
    expect(calls[0]?.url).not.toContain("secret");
    expect(calls[0]?.url).toContain("gemini-2.5-flash:generateContent");
  });

  it("asks for JSON, because the schema is strict", async () => {
    const { impl, calls } = stub(answer);
    await new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e");
    expect(body(calls).generationConfig.responseMimeType).toBe("application/json");
  });

  it("cuts an oversized document and says that it did", async () => {
    const { impl, calls } = stub(answer);
    await new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "x".repeat(MAX_EVIDENCE_CHARS + 1_000));
    const doc = body(calls).contents[0].parts[1].text as string;
    expect(doc).toContain("cut off here");
  });

  it("joins the parts of a reply", async () => {
    const { impl } = stub({ candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] });
    expect(await new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e")).toBe("ab");
  });

  /**
   * A safety filter answers 200 with no candidate. Reported as "no text" that
   * reads like a broken request rather than a refusal to look at the document.
   */
  it("names a safety block as a refusal", async () => {
    const { impl } = stub({ promptFeedback: { blockReason: "SAFETY" } });
    await expect(new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e")).rejects.toThrow(
      /refused the prompt: SAFETY/,
    );
  });

  /**
   * Truncated output is invalid JSON, and blaming the parser points at the
   * wrong thing. This fired on the very first live call: a 2.5-class model
   * spends thinking tokens out of the same budget, so a limit sized for the
   * answer alone returns nothing at all.
   */
  it("says when the answer was cut off, and what to raise", async () => {
    const { impl } = stub({ candidates: [{ content: { parts: [{ text: '{"bid":tr' }] }, finishReason: "MAX_TOKENS" }] });
    await expect(new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e")).rejects.toThrow(
      /cut off at 4096 tokens.*thinking budget 1024.*GOOGLE_MAX_TOKENS/,
    );
  });

  /** Thinking is charged against maxOutputTokens, so it cannot be left unbounded. */
  it("bounds the thinking budget so it cannot eat the whole answer", async () => {
    const { impl, calls } = stub(answer);
    await new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e");
    const cfg = body(calls).generationConfig;
    expect(cfg.maxOutputTokens).toBe(4096);
    expect(cfg.thinkingConfig.thinkingBudget).toBe(1024);
    expect(cfg.thinkingConfig.thinkingBudget).toBeLessThan(cfg.maxOutputTokens);
  });

  it("carries the reason a request was refused", async () => {
    const { impl } = stub("API key not valid", 400);
    await expect(new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e")).rejects.toThrow(
      /400.*API key not valid/,
    );
  });

  it("gives up on a model that does not answer inside the auction", async () => {
    const impl = ((_u: unknown, init: unknown) =>
      new Promise((_res, rej) => {
        (init as { signal: AbortSignal }).signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
      })) as unknown as typeof fetch;

    vi.useFakeTimers();
    const p = new GeminiReasoner({ apiKey: "k", timeoutMs: 50, fetchImpl: impl }).think("s", "i", "e");
    const assertion = expect(p).rejects.toThrow(/did not answer within 50ms/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    vi.useRealTimers();
  });
});

describe("error reporting", () => {
  /**
   * An API error body is pretty-printed JSON. Left alone it reaches the log as
   * a dozen lines and buries the document verification and the bid above it —
   * the same failure the viem errors had in the poll loop.
   */
  it("reports the message out of an error body, not the envelope", async () => {
    const pretty = '{\n  "error": {\n    "code": 400,\n    "message": "API key not valid.",\n    "details": [{"@type":"type.googleapis.com/google.rpc.ErrorInfo","domain":"googleapis.com"}]\n  }\n}';
    const impl = (async () => ({ ok: false, status: 400, text: async () => pretty })) as unknown as typeof fetch;
    try {
      await new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e");
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("\n");
      expect(msg).toContain("400");
      expect(msg).toContain("API key not valid.");
      // The envelope is noise around six useful words.
      expect(msg).not.toContain("googleapis.com");
      expect(msg).not.toContain("@type");
    }
  });
  it("keeps an unfamiliar body whole rather than reporting nothing", async () => {
    const impl = (async () => ({ ok: false, status: 503, text: async () => "upstream unavailable" })) as unknown as typeof fetch;
    await expect(new GeminiReasoner({ apiKey: "k", fetchImpl: impl }).think("s", "i", "e")).rejects.toThrow(
      /503: upstream unavailable/,
    );
  });
});
