/**
 * What a revert actually means, in a sentence.
 *
 * A custom error reaches the browser as four bytes. `0x8814cafb` tells a user
 * nothing, and every one of these was decoded by hand at some point during the
 * build — which is exactly the work an interface should be doing for them.
 *
 * Each entry says what happened and, where there is one, what to do about it.
 * Nothing here is guessed: the selectors were taken from the compiled ABI and
 * confirmed against transactions that actually reverted on testnet.
 */

export interface Explained {
  /** The contract's own name for it, kept for anyone reading a receipt. */
  name: string;
  /** What went wrong, in the user's terms. */
  says: string;
  /** What they can do, when there is something. */
  fix?: string;
}

const MARKET: Record<string, Explained> = {
  // ── opening ──
  "0x5419376a": { name: "BadWindow", says: "That auction length is outside what the market accepts.", fix: "Between 60 seconds and 7 days." },
  "0xc8a081c6": { name: "BadTerm", says: "That term is outside what the market accepts.", fix: "Between one day and 60." },
  "0x1f2a2005": { name: "ZeroAmount", says: "A request needs both a principal and some collateral." },
  "0xd92e233d": { name: "ZeroAddress", says: "One of the token addresses was empty." },
  "0xfead2d51": { name: "CashIsCollateral", says: "The collateral and the cash cannot be the same token." },

  // ── the auction ──
  "0xddafad98": { name: "NotOpen", says: "This request is no longer open." },
  "0x36b6b46d": { name: "AuctionClosed", says: "The auction closed before this landed.", fix: "Nothing can be bid now — it can only be awarded or withdrawn." },
  "0x1c2ce4fd": { name: "AuctionLive", says: "The auction is still running.", fix: "Wait for it to close, then award." },
  "0xc3bc4043": { name: "NoBids", says: "Nobody bid on this request.", fix: "It can only be withdrawn, which returns the collateral." },
  "0xee269648": { name: "NotBetter", says: "A bid only wins by being lower than the one standing.", fix: "Bid below the current best repayment." },
  "0x5c272fc5": { name: "BelowPrincipal", says: "A repayment below the principal is a gift, not a loan." },

  // ── the mandate ──
  "0x8814cafb": { name: "NoMandate", says: "You have no active mandate, so the market will not take a bid from you.", fix: "Set one on the Underwrite page — it is where your limits live." },
  "0xa4d95a3d": { name: "OverPerDeal", says: "This principal is larger than the biggest single deal your mandate allows.", fix: "Raise that limit, or bid on a smaller request." },
  "0xb0b697d0": { name: "OverTotal", says: "Winning this would take you past your own total ceiling — standing bids count too.", fix: "Raise the ceiling, or let an existing position settle first." },
  "0x5cf4d029": { name: "RateTooLow", says: "That repayment implies a rate below your mandate's floor.", fix: "Bid a higher repayment, or lower the floor." },
  "0x77d6a7b4": { name: "TermTooLong", says: "This loan runs longer than your mandate permits." },
  "0x48472343": { name: "AssetNotAllowed", says: "Your mandate does not list this security as collateral.", fix: "Allow it on the Underwrite page." },

  // ── settlement ──
  "0xcb1e8f38": { name: "NotBorrower", says: "Only the borrower can do this." },
  "0xecdd1c29": { name: "TooLate", says: "The date has passed, so this is a default rather than a repayment.", fix: "The collateral now goes to the lender." },
  "0x197a7931": { name: "StillCurrent", says: "The loan has not matured yet.", fix: "Nothing can be claimed until the date passes." },
  "0xb4c06c88": { name: "NotAwarded", says: "This request was never funded." },

  // ── the coupon ──
  "0xed223960": { name: "CouponOutsideLoan", says: "That coupon's record date falls outside this loan's term, so it is between the holder and the issuer." },
  "0x103b4afe": { name: "AlreadyRecorded", says: "That coupon has already been counted." },
  "0x797dba54": { name: "NothingOwed", says: "There is no manufactured payment outstanding on this request.", fix: "A coupon has to be recorded before it can be settled." },
  "0x452a5b51": { name: "CouponUnschedulable", says: "The network would not book a call for that coupon." },

  // ── the tokens themselves ──
  "0x90b8ec18": { name: "TransferFailed", says: "The security or the cash token refused the transfer.", fix: "Usually an allowance that is too small, a balance that is short, or a compliance control on the security." },
  "0xb5c74a27": { name: "NothingReceived", says: "The transfer moved nothing." },
  "0xab143c06": { name: "Reentrancy", says: "A re-entrant call was refused." },
};

/** Errors the ATS security raises, which surface through the market unchanged. */
const SECURITY: Record<string, Explained> = {
  "0x5416eb98": { name: "FunctionNotFound", says: "The security does not implement that function." },
  "0x325738a4": { name: "AccountHasNoRole", says: "This account does not hold the role that call requires." },
  "0x796c1f0d": { name: "AccountIsBlocked", says: "The issuer has blocked this account on the security." },
};

const TABLE = { ...MARKET, ...SECURITY };

/**
 * Pull a known selector out of whatever the wallet handed back.
 *
 * viem nests the data differently depending on where the failure happened, and
 * the RPC sometimes only puts it in the message text, so this searches rather
 * than reaching for one field.
 */
export function explainRevert(err: unknown): Explained | null {
  if (!err) return null;

  const seen = new Set<string>();
  const collect = (v: unknown, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      for (const m of v.matchAll(/0x[0-9a-fA-F]{8}/g)) seen.add(m[0].toLowerCase());
      return;
    }
    if (typeof v !== "object") return;
    for (const val of Object.values(v as Record<string, unknown>)) collect(val, depth + 1);
  };
  collect(err);

  for (const sel of seen) {
    const hit = TABLE[sel];
    if (hit) return hit;
  }
  return null;
}

/** Did the person simply decline in their wallet? That is not an error worth dressing up. */
export function isRejection(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: string }).name ?? "";
  const msg = (err as { message?: string }).message ?? "";
  return (
    name === "UserRejectedRequestError" ||
    /user rejected|user denied|rejected the request/i.test(msg)
  );
}
