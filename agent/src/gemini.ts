import { clip, evidenceBlock, MAX_EVIDENCE_CHARS, type Reasoner } from "./reason.js";

/**
 * The same job as `ClaudeReasoner`, against Google's Generative Language API.
 *
 * It exists because that API has a free tier, and an underwriting agent nobody
 * can afford to run is not much of a demonstration. Everything that matters is
 * identical: the instruction and the document are separate parts, an oversized
 * prospectus is cut and said to be cut, and the call is bounded by the auction
 * rather than by patience.
 */

const HOST = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
  /**
   * Thinking is charged against `maxTokens`, so it is bounded rather than left
   * dynamic — otherwise a long document can spend the whole budget deliberating
   * and return nothing at all.
   */
  thinkingBudget?: number;
  maxEvidenceChars?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiReasoner implements Reasoner {
  private readonly apiKey: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly thinkingBudget: number;
  private readonly maxEvidenceChars: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GeminiOptions) {
    if (!opts.apiKey) throw new Error("GeminiReasoner needs an API key");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gemini-2.5-flash";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    // 2.5-class models think before they answer, and those thinking tokens are
    // spent out of `maxOutputTokens`. A budget sized for the answer alone is
    // consumed entirely by the reasoning and the reply never arrives — which is
    // what 1024 did on the first live call against a 1,347-character prospectus.
    this.maxTokens = opts.maxTokens ?? 4096;
    this.thinkingBudget = opts.thinkingBudget ?? 1024;
    this.maxEvidenceChars = opts.maxEvidenceChars ?? MAX_EVIDENCE_CHARS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async think(system: string, instruction: string, evidence: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(`${HOST}/${this.model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // In the header rather than the query string, so the key does not end
          // up in a proxy log or an error message that quotes the URL.
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            {
              role: "user",
              // Two parts, never one joined string — the same separation
              // `buildPrompt` makes between a brief and a counterparty's document.
              parts: [{ text: instruction }, { text: evidenceBlock(evidence, this.maxEvidenceChars) }],
            },
          ],
          generationConfig: {
            maxOutputTokens: this.maxTokens,
            thinkingConfig: { thinkingBudget: this.thinkingBudget },
            // The schema is strict and `parseOpinion` discards anything that
            // misses it, so ask for JSON rather than hoping for it.
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`the model did not answer within ${this.timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`the model returned ${res.status}${detail ? `: ${clip(detail, 300).text}` : ""}`);
    }

    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };

    // A safety filter returns 200 with no candidate at all. Left unhandled that
    // reads as "the model returned no text", which suggests a broken request
    // rather than a refusal to look at the document.
    const blocked = body.promptFeedback?.blockReason;
    if (blocked) throw new Error(`the model refused the prompt: ${blocked}`);

    const candidate = body.candidates?.[0];
    if (!candidate) throw new Error("the model returned no candidate");

    // Truncated output is invalid JSON, and `parseOpinion` would report it as
    // "reply was not JSON" — which points at the wrong problem entirely.
    if (candidate.finishReason === "MAX_TOKENS") {
      throw new Error(
        `the model was cut off at ${this.maxTokens} tokens before finishing its answer` +
          ` (thinking budget ${this.thinkingBudget}); raise GOOGLE_MAX_TOKENS`,
      );
    }

    const text = (candidate.content?.parts ?? [])
      .map((p) => p.text)
      .filter((t): t is string => typeof t === "string")
      .join("");

    if (!text.trim()) throw new Error("the model returned no text");
    return text;
  }
}
