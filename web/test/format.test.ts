import { describe, expect, it } from "vitest";
import { units } from "../lib/format";

const dUSD = 6;

describe("units", () => {
  it("prints a round amount round", () => {
    expect(units(2_000_000_000n, dUSD)).toBe("2,000");
    expect(units(0n, dUSD)).toBe("0");
  });

  it("keeps ordinary cents at two places", () => {
    expect(units(2_000_500_000n, dUSD)).toBe("2,000.5");
    expect(units(1_234_560_000n, dUSD)).toBe("1,234.56");
  });

  /**
   * The bug this exists for. A 30-minute loan at 600bps on a 2,000 principal
   * earns 0.006850 — entirely below two decimal places. Truncating showed
   * "2,000" for both the principal and the repayment, so the page said the
   * lender earned nothing on the one number they care about.
   */
  it("reveals a fee that lives below the requested precision", () => {
    expect(units(2_000_006_850n, dUSD)).toBe("2,000.00685");
  });

  it("extends only as far as it must", () => {
    expect(units(2_000_100_000n, dUSD)).toBe("2,000.1");
    expect(units(2_000_010_000n, dUSD)).toBe("2,000.01");
    expect(units(2_000_001_000n, dUSD)).toBe("2,000.001");
  });

  it("never runs past the token's own decimals", () => {
    expect(units(1n, dUSD)).toBe("0.000001");
    expect(units(1n, 18)).toBe("0.000000000000000001");
  });

  it("handles negatives and 18dp collateral", () => {
    expect(units(-2_000_006_850n, dUSD)).toBe("-2,000.00685");
    expect(units(2100n * 10n ** 18n, 18, 0)).toBe("2,100");
  });
});
