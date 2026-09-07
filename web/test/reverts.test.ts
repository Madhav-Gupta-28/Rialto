import { describe, expect, it } from "vitest";
import { explainRevert, isRejection } from "../lib/reverts";

describe("explainRevert", () => {
  /** Every one of these was decoded by hand from a real testnet revert. */
  it("names the mandate refusals we actually hit", () => {
    expect(explainRevert({ message: 'data: "0x8814cafb"' })?.name).toBe("NoMandate");
    expect(explainRevert({ message: 'data: "0xa4d95a3d"' })?.name).toBe("OverPerDeal");
    expect(explainRevert({ message: 'data: "0x5cf4d029"' })?.name).toBe("RateTooLow");
    expect(explainRevert({ message: 'data: "0x48472343"' })?.name).toBe("AssetNotAllowed");
  });

  it("names the settlement refusals", () => {
    expect(explainRevert({ message: "0x90b8ec18" })?.name).toBe("TransferFailed");
    expect(explainRevert({ message: "0x197a7931" })?.name).toBe("StillCurrent");
    expect(explainRevert({ message: "0x797dba54" })?.name).toBe("NothingOwed");
    expect(explainRevert({ message: "0x36b6b46d" })?.name).toBe("AuctionClosed");
  });

  /** viem nests the data differently depending on where the call failed. */
  it("finds the selector however deeply it is buried", () => {
    const nested = { cause: { cause: { data: "0x1c2ce4fd", other: 1 } } };
    expect(explainRevert(nested)?.name).toBe("AuctionLive");
  });

  it("says what to do, not just what happened", () => {
    expect(explainRevert({ message: "0x8814cafb" })?.fix).toMatch(/Underwrite page/);
    expect(explainRevert({ message: "0x797dba54" })?.fix).toMatch(/recorded before/);
  });

  it("returns nothing for a selector it does not know, rather than guessing", () => {
    expect(explainRevert({ message: "0xdeadbeef" })).toBeNull();
    expect(explainRevert(null)).toBeNull();
  });
});

describe("isRejection", () => {
  /** Declining in a wallet is a decision, not a failure, and gets no dialog. */
  it("recognises a wallet decline", () => {
    expect(isRejection({ name: "UserRejectedRequestError" })).toBe(true);
    expect(isRejection({ message: "User rejected the request." })).toBe(true);
    expect(isRejection({ message: "MetaMask Tx Signature: User denied transaction signature." })).toBe(true);
  });

  it("does not mistake a revert for a decline", () => {
    expect(isRejection({ message: 'reverted, data: "0x8814cafb"' })).toBe(false);
  });
});
