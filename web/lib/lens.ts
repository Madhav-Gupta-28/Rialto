export const lensAbi = [
  {
    type: "function",
    name: "check",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "blocker", type: "uint8" },
      { name: "beneficiary", type: "address" },
    ],
  },
] as const;

/**
 * The obstacles ComplianceLens can name, in its own order. The numbers are the
 * contract's enum and are load-bearing — appending is safe, reordering is not.
 */
export const BLOCKER = [
  "None",
  "NotFunded",
  "SecurityPaused",
  "BeneficiaryFrozen",
  "BeneficiaryNotListed",
  "BeneficiaryNoKyc",
  "Unreadable",
  "EscrowFrozen",
  "EscrowNotListed",
  "EscrowNoKyc",
] as const;

export type BlockerName = (typeof BLOCKER)[number];

export type Obstacle = {
  /** Whether settlement is expected to fail right now. */
  blocking: boolean;
  title: string;
  detail: string;
};

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Turn the lens's answer into something worth reading.
 *
 * Two things decide the wording. Which side is blocked — the escrow stops every
 * position on the market, the beneficiary stops only this one — and whether the
 * person reading is the party in question, because "you are not on the control
 * list" and "the lender is not on the control list" call for very different
 * next steps.
 *
 * Every message says what the settlement would do to the collateral, because
 * that is the thing anyone blocked actually wants to know: nothing is seized,
 * nothing is lost, the position waits.
 */
export function explain(args: {
  blocker: number;
  beneficiary: `0x${string}`;
  viewer?: `0x${string}`;
  matured: boolean;
}): Obstacle | null {
  const { blocker, beneficiary, viewer, matured } = args;
  const name = BLOCKER[blocker];

  // Nothing to say: either it can settle, or there is no live position to settle.
  if (name === "None" || name === "NotFunded") return null;

  // A lens taught a new obstacle would otherwise read here as silence, which is
  // the one answer this build must not invent. Report it and stay out of the
  // way: the lens is advisory, and blocking on a code we cannot read would
  // strand a settlement that works.
  if (name === undefined) {
    return {
      blocking: false,
      title: "The compliance check returned something this page does not recognise",
      detail: `The lens answered with obstacle ${blocker}, which is newer than this build. Read it on the contract before settling, and treat the transfer itself as the authority.`,
    };
  }

  const role = matured ? "lender" : "borrower";
  const you = same(viewer, beneficiary);
  const party = you ? "You are" : `The ${role} is`;
  const holds = matured
    ? "The collateral is still escrowed and still goes to the lender once this clears."
    : "The collateral is still escrowed and still comes back to the borrower once this clears.";

  switch (name) {
    case "SecurityPaused":
      return {
        blocking: true,
        title: "The issuer has paused the security",
        detail: `Every transfer of the token is halted, so no position on it can settle. Nothing is lost by waiting — ${holds.toLowerCase()}`,
      };

    case "BeneficiaryFrozen":
      return {
        blocking: true,
        title: `${party} frozen on this security`,
        detail: `Part of the balance is frozen, which blocks the transfer this settlement would make. ${holds} ${you ? "The issuer has to lift the freeze." : ""}`.trim(),
      };

    case "BeneficiaryNotListed":
      return {
        blocking: true,
        title: `${party} not on the control list`,
        detail: `An address freeze on this security shows up as removal from the control list rather than as a frozen flag, so this is either a freeze or an account that was never admitted. ${holds}`,
      };

    case "BeneficiaryNoKyc":
      return {
        blocking: true,
        title: `${party} without a KYC credential`,
        detail: `The security runs internal KYC and has no valid credential for this account — never issued, or revoked. The issuer grants one, and then this settles. ${holds}`,
      };

    case "EscrowFrozen":
    case "EscrowNotListed":
    case "EscrowNoKyc":
      return {
        blocking: true,
        title: "The market itself is not admitted to this security",
        detail:
          "A permissioned security screens both sides of a transfer, and the market is the sender of every settlement. Until the issuer readmits it, no position on this security can settle — not just this one. Every escrowed balance is untouched in the meantime.",
      };

    case "Unreadable":
      return {
        blocking: false,
        title: "The security did not answer",
        detail:
          "A compliance query returned nothing, so this check is inconclusive rather than clear. Settlement may still work; the transfer itself is the authority.",
      };
  }

  return null;
}
