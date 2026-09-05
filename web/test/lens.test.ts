import { describe, expect, it } from "vitest";
import { BLOCKER, explain } from "../lib/lens";

const BENEFICIARY = "0x932a77598c75A5a4a5AC9821E09cc45d7551515A" as const;
const SOMEONE_ELSE = "0x31f66ee3A1933b42e9d1904373f97ca6f900A89C" as const;

const at = (name: (typeof BLOCKER)[number]) => BLOCKER.indexOf(name);

describe("explain", () => {
  it("says nothing when nothing is in the way", () => {
    expect(explain({ blocker: at("None"), beneficiary: BENEFICIARY, matured: false })).toBeNull();
  });

  it("says nothing when there is no live position", () => {
    expect(explain({ blocker: at("NotFunded"), beneficiary: BENEFICIARY, matured: false })).toBeNull();
  });

  it("addresses the party who is blocked, when that is the reader", () => {
    const o = explain({
      blocker: at("BeneficiaryNoKyc"),
      beneficiary: BENEFICIARY,
      viewer: BENEFICIARY,
      matured: false,
    });
    expect(o?.title).toBe("You are without a KYC credential");
  });

  /// The comparison has to survive checksum casing, or a connected wallet reads
  /// as a third party on its own position.
  it("recognises the reader whatever the address casing", () => {
    const o = explain({
      blocker: at("BeneficiaryNotListed"),
      beneficiary: BENEFICIARY,
      viewer: BENEFICIARY.toLowerCase() as `0x${string}`,
      matured: false,
    });
    expect(o?.title).toBe("You are not on the control list");
  });

  it("names the borrower before maturity and the lender after it", () => {
    const before = explain({
      blocker: at("BeneficiaryNotListed"),
      beneficiary: BENEFICIARY,
      viewer: SOMEONE_ELSE,
      matured: false,
    });
    const after = explain({
      blocker: at("BeneficiaryNotListed"),
      beneficiary: BENEFICIARY,
      viewer: SOMEONE_ELSE,
      matured: true,
    });
    expect(before?.title).toBe("The borrower is not on the control list");
    expect(after?.title).toBe("The lender is not on the control list");
  });

  it("does not blame the beneficiary when the market is the problem", () => {
    for (const name of ["EscrowFrozen", "EscrowNotListed", "EscrowNoKyc"] as const) {
      const o = explain({ blocker: at(name), beneficiary: BENEFICIARY, viewer: BENEFICIARY, matured: true });
      expect(o?.blocking).toBe(true);
      expect(o?.title).toBe("The market itself is not admitted to this security");
      expect(o?.detail).not.toContain("You are");
    }
  });

  /// An unanswered query is not a clean bill of health and not a blocker
  /// either. Disabling the button on it would strand a settlement that works.
  it("reports an unreadable security without blocking on it", () => {
    const o = explain({ blocker: at("Unreadable"), beneficiary: BENEFICIARY, matured: false });
    expect(o).not.toBeNull();
    expect(o?.blocking).toBe(false);
  });

  it("blocks on every obstacle the lens can actually name", () => {
    const named = BLOCKER.filter((b) => b !== "None" && b !== "NotFunded" && b !== "Unreadable");
    for (const name of named) {
      const o = explain({ blocker: at(name), beneficiary: BENEFICIARY, matured: false });
      expect(o?.blocking, name).toBe(true);
      expect(o?.detail.length, name).toBeGreaterThan(40);
    }
  });

  /// A lens taught a new obstacle must not read here as silence. It is surfaced
  /// and left unblocking: the lens is advisory, and refusing on a code this
  /// build cannot read would strand a settlement that works.
  it("surfaces a value from a newer lens instead of reading it as fine", () => {
    const o = explain({ blocker: 99, beneficiary: BENEFICIARY, matured: false });
    expect(o).not.toBeNull();
    expect(o?.blocking).toBe(false);
    expect(o?.detail).toContain("99");
  });
});
