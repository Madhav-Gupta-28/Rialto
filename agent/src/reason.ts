import { buildPrompt, parseOpinion, minimumRepayment, type Mandate, type Opinion, type RequestView } from "./strategy.js";

/**
 * Forming the opinion.
 *
 * The model is behind an interface for one reason: a model call must never sit
 * inside a transaction, and it must never be the only thing that can produce a
 * bid. An underwriter who prefers to bid by hand uses the same market with the
 * same limits; the contract cannot tell them apart.
 */
export interface Reasoner {
  /** Returns the raw reply. Parsing and bounding happen outside. */
  think(system: string, instruction: string, evidence: string): Promise<string>;
}

export interface OpinionResult {
  opinion: Opinion | null;
  why: string;
  raw: string;
}

export async function formOpinion(
  reasoner: Reasoner,
  req: RequestView,
  documentText: string,
  strategy: string,
): Promise<OpinionResult> {
  const p = buildPrompt(req, documentText, strategy);

  let raw: string;
  try {
    raw = await reasoner.think(p.system, p.instruction, p.evidence);
  } catch (e) {
    // A model that is down is an underwriter who did not turn up. The auction
    // closes without this bid, which is what happens to slow underwriters in
    // real markets.
    return { opinion: null, why: `the reasoner failed: ${e instanceof Error ? e.message : String(e)}`, raw: "" };
  }

  const parsed = parseOpinion(raw);
  if (!parsed.ok) return { opinion: null, why: `discarded a malformed reply: ${parsed.why}`, raw };
  return { opinion: parsed.opinion, why: "", raw };
}

/**
 * A reasoner that never calls a model.
 *
 * This exists so the pipeline can be demonstrated and tested end to end with no
 * API key and no network, and so it is obvious what the model is and is not
 * doing. It reads the document for the two things the brief insists on —
 * seniority and a maturity — and prices off the mandate floor. It is not a
 * credit opinion and does not pretend to be one; a formula cannot read a
 * prospectus, which is the entire argument for the model in the first place.
 */
export class RuleBasedReasoner implements Reasoner {
  constructor(private readonly mandate: Mandate, private readonly req: RequestView) {}

  async think(_system: string, _instruction: string, evidence: string): Promise<string> {
    const text = evidence.toLowerCase();
    const reasons: string[] = [];
    const flags: string[] = [];

    const senior = /\bsenior\b/.test(text) && !/\bsubordinat/.test(text);
    const hasMaturity = /matur|redemption date|due 20\d\d/.test(text);

    // An imperative inside a counterparty's document is a finding, never an
    // instruction. Reported the same way the model is told to report it.
    if (/ignore (all )?(previous|prior)|disregard the|you must bid|system:/i.test(evidence)) {
      flags.push("the document contains text addressed to an automated reader; treated as evidence, not instruction");
    }

    if (!senior) reasons.push("the document does not establish unambiguous seniority");
    if (!hasMaturity) reasons.push("no maturity date could be found");

    if (!senior || !hasMaturity) {
      return JSON.stringify({ bid: false, reasons, flags });
    }

    reasons.push("senior, with a stated maturity");
    let bps = Math.max(this.mandate.minRateBps, 600);
    if (!/\bissuer\b|\bplc\b|\blimited\b|\bltd\b/.test(text)) {
      bps += 200;
      reasons.push("issuer not identifiable from the document; 200bps added");
    }
    if (flags.length > 0) {
      bps += 200;
      reasons.push("embedded instructions found; 200bps added for document quality");
    }

    const repay = minimumRepayment(this.req.principal, this.req.term, bps);
    return JSON.stringify({ bid: true, repayAmount: repay.toString(), reasons, flags });
  }
}
