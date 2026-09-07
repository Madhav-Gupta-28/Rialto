/**
 * Every claim on the How it works page points at something checkable — a line
 * of source, a contract, a consensus topic. Collected here so a moved function
 * is one edit rather than a hunt through prose.
 */
const REPO = "https://github.com/Madhav-Gupta-28/Rialto/blob/main";
const SCAN = "https://hashscan.io/testnet";

export const src = (file: string, line: number) => `${REPO}/${file}#L${line}`;

export const link = {
  open: src("src/RialtoMarket.sol", 275),
  bid: src("src/RialtoMarket.sol", 397),
  award: src("src/RialtoMarket.sol", 455),
  repay: src("src/RialtoMarket.sol", 482),
  claim: src("src/RialtoMarket.sol", 530),
  recordCoupon: src("src/RialtoMarket.sol", 565),
  scheduleCoupon: src("src/RialtoMarket.sol", 659),
  schedule: src("src/RialtoMarket.sol", 91),
  lens: src("src/ComplianceLens.sol", 74),
  mandate: src("src/Mandates.sol", 60),
  agent: `${REPO}/agent/src/index.ts`,
  hcs: `${REPO}/agent/src/hcs.ts`,
  verify: `${REPO}/script/verify-reasoning.sh`,

  market: `${SCAN}/contract/0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4`,
  bond: `${SCAN}/contract/0x52Ea050Fe77A303b1A61fe15d8894892aFF02114`,
  lensContract: `${SCAN}/contract/0xd65580d345aE3c13Ce58586C0891b67198f23246`,
  topic: `${SCAN}/topic/0.0.10367534`,
  scheduled: `${SCAN}/account/0.0.10382007`,
} as const;
