/**
 * What the market says when it turns a bid down, and what the agent should do
 * about it.
 *
 * This exists because a refused bid used to escape `considerRequest` as an
 * exception. It was caught by the loop's outer handler, which knows nothing
 * about which request it belonged to and so could not mark it settled — and the
 * next poll therefore repeated the whole thing from the top: fetch the
 * document, call the model, publish a fresh opinion to HCS, bid again, be
 * refused again.
 *
 * That was not theoretical. Requests #21 and #22 each carry two opinions on
 * topic 0.0.10367534, five seconds apart, and in both cases the second bid was
 * higher than the first and so was refused as `NotBetter`. The winning bids
 * reference the first opinion; the second is an orphan that cost a model call,
 * a consensus message and a reverted transaction to produce.
 *
 * A refusal is not a failure. It is the market applying a rule, and the right
 * response to most of them is to stop thinking about that request.
 */

export type Refusal = {
  /** Said to the operator, in place of a stack trace. */
  says: string;
  /**
   * Whether the answer can still change. `false` stops the agent reconsidering
   * this request at all; `true` means try again later, after a pause.
   */
  reconsider: boolean;
};

export const REFUSALS: Record<string, Refusal> = {
  // Ours or someone else's bid already stands and this one does not beat it.
  // On this agent it is nearly always ours, arriving one poll after the bid
  // that won.
  "0xee269648": { says: "a standing bid already beats this one", reconsider: false },

  // The deadline passed while the model was thinking. Nothing to do.
  "0x36b6b46d": { says: "the auction closed while the opinion was being formed", reconsider: false },
  "0xddafad98": { says: "the request is no longer open", reconsider: false },

  // Our own arithmetic produced something the market will not take. Worth
  // saying loudly, because it means `decide` and the contract disagree.
  "0x5c272fc5": { says: "the bid was below the principal — the agent's own maths is wrong", reconsider: false },

  // The mandate refused it. These can change, but only when the owner changes
  // them, so there is no point asking again on the next poll.
  "0x8814cafb": { says: "the underwriter has no active mandate", reconsider: true },
  "0xa4d95a3d": { says: "the loan is larger than the mandate's per-deal limit", reconsider: false },
  "0xb0b697d0": { says: "the mandate's total exposure is already committed", reconsider: true },
  "0x5cf4d029": { says: "the rate is below the mandate's floor", reconsider: false },
  "0x77d6a7b4": { says: "the term is longer than the mandate allows", reconsider: false },
  "0x48472343": { says: "the mandate does not accept this collateral", reconsider: false },
};

/**
 * Find a known refusal inside whatever the wallet threw.
 *
 * A custom error reaches us as four bytes, and viem reports it inside a message
 * rather than as a field — so this looks for the selector in the text, having
 * first checked the places viem does expose it. Anything unrecognised returns
 * undefined and is handled as the error it is.
 */
export function refusalIn(e: unknown): (Refusal & { selector: string }) | undefined {
  const text = [
    (e as { shortMessage?: string })?.shortMessage,
    (e as { details?: string })?.details,
    e instanceof Error ? e.message : String(e),
  ]
    .filter(Boolean)
    .join(" ");

  const found = text.match(/0x[0-9a-fA-F]{8}\b/g) ?? [];
  for (const raw of found) {
    const hit = REFUSALS[raw.toLowerCase()];
    if (hit) return { ...hit, selector: raw.toLowerCase() };
  }
  return undefined;
}

/**
 * Whether the chain refused this, as opposed to failing to answer.
 *
 * `submitBid` marks a reverted receipt; viem names the error type when the node
 * reports the revert at send time instead. Either way the answer is settled and
 * asking again in five seconds will produce it again.
 */
export function isRevert(e: unknown): boolean {
  if ((e as { reverted?: boolean })?.reverted === true) return true;
  let cause: unknown = e;
  for (let depth = 0; cause && depth < 8; depth++) {
    const name = (cause as { name?: unknown }).name;
    if (name === "ContractFunctionRevertedError" || name === "ContractFunctionExecutionError") return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}
