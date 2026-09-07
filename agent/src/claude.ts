import { clip, evidenceBlock, MAX_EVIDENCE_CHARS, type Reasoner } from "./reason.js";

/**
 * The reasoner that actually reads.
 *
 * `RuleBasedReasoner` exists so the pipeline can be demonstrated with no API key
 * and no network, and it is honest about what it is: a regular expression
 * looking for the word "senior". It cannot weigh a covenant, notice that a
 * maturity falls inside the loan term, or tell a guarantee from a comfort
 * letter. Reading a prospectus is the whole argument for putting a model here,
 * so this is the path that carries it, and the rule-based one is the fallback
 * for when there is no key.
 *
 * The transport is a plain fetch against the Messages API rather than the SDK.
 * One dependency less, and the request shape is visible in the file — which
 * matters when the point being demonstrated is *how* the document is handled.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  /**
   * An auction has a deadline, so a slow underwriter simply misses it. Bounding
   * the call is what turns "the model is having a bad minute" into a missed bid
   * rather than a stalled agent that stops looking at every other request.
   */
  timeoutMs?: number;
  maxTokens?: number;
  maxEvidenceChars?: number;
  /** Injectable so the request shape can be tested without a network or a key. */
  fetchImpl?: typeof fetch;
}

export class ClaudeReasoner implements Reasoner {
  private readonly apiKey: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly maxEvidenceChars: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClaudeOptions) {
    if (!opts.apiKey) throw new Error("ClaudeReasoner needs an API key");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "claude-sonnet-5";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxTokens = opts.maxTokens ?? 1024;
    this.maxEvidenceChars = opts.maxEvidenceChars ?? MAX_EVIDENCE_CHARS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async think(system: string, instruction: string, evidence: string): Promise<string> {
    // The instruction and the document are separate content blocks, never one
    // concatenated string. That is the same separation `buildPrompt` makes, and
    // undoing it here would quietly discard the defence it exists for.
    const content = [
      { type: "text" as const, text: instruction },
      { type: "text" as const, text: evidenceBlock(evidence, this.maxEvidenceChars) },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system,
          messages: [{ role: "user", content }],
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
      // The body carries the actual reason — a bad key, a rate limit, an
      // unknown model. Losing it would leave "400" as the whole explanation.
      const detail = await res.text().catch(() => "");
      throw new Error(`the model returned ${res.status}${detail ? `: ${clip(detail, 300).text}` : ""}`);
    }

    const body = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = (body.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");

    // An empty reply is not a refusal to bid — it is no answer at all, and
    // `parseOpinion` would report it as "reply was not JSON", which reads like
    // the model said something malformed rather than nothing.
    if (!text.trim()) throw new Error("the model returned no text");
    return text;
  }
}

