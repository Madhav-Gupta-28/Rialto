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

import { rateLabel, RATE_CEILING_BPS } from "../lib/format";

describe("rateLabel", () => {
  it("prints an ordinary rate exactly", () => {
    expect(rateLabel(600)).toBe("6.00%");
    expect(rateLabel(547)).toBe("5.47%");
    expect(rateLabel(0)).toBe("0.00%");
  });

  /**
   * `RialtoMarket.rateBps` returns a uint16 and caps rather than panics, so a
   * short loan carrying a coupon saturates it. Request #12 paid 57.54 on 2,000
   * over thirty minutes — about 50,400% annualised — and was stored as 65,535.
   * Printing "655.35%" states a measurement the contract never made, and reads
   * as either a broken figure or a usurious one.
   */
  it("says the ceiling is a ceiling", () => {
    expect(rateLabel(RATE_CEILING_BPS)).toBe("over 655%");
    expect(rateLabel(RATE_CEILING_BPS)).not.toContain("655.35%");
  });

  it("treats anything at or past the ceiling the same way", () => {
    expect(rateLabel(65534)).toBe("655.34%");
    expect(rateLabel(65535)).toBe("over 655%");
    expect(rateLabel(999999)).toBe("over 655%");
  });
});
