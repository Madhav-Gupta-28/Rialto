import { defineChain } from "viem";

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

/** Deployed by script/Deploy.s.sol. See DEPLOYMENTS.md. */
export const MARKET = "0x548cdcCd7386a9E64F74B2c46a5021b77c2d5C15" as const;
export const MANDATES = "0xb4F8cB274387A5190CeF7582004558809f8547a4" as const;

/** The demo instrument: a bond issued through the live ATS factory. */
export const BOND = "0x52Ea050Fe77A303b1A61fe15d8894892aFF02114" as const;
export const CASH = "0x55e9BAF7dCFe0e2A4E51e1BdeBB4e20d6247e365" as const;

export const CASH_DECIMALS = 6;
export const BOND_DECIMALS = 18;

export const HCS_TOPIC = "0.0.10367534" as const;
export const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";

export const hashscan = (addr: string) => `https://hashscan.io/testnet/contract/${addr}`;
