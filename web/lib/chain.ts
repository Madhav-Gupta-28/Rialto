import { defineChain } from "viem";

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

/** Deployed by script/Deploy.s.sol. See DEPLOYMENTS.md. */
export const MARKET = "0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4" as const;

/** Read-only. Names why a settlement is blocked instead of reverting at one. */
export const LENS = "0xd65580d345aE3c13Ce58586C0891b67198f23246" as const;
export const MANDATES = "0xb4F8cB274387A5190CeF7582004558809f8547a4" as const;

/** The demo instrument: a bond issued through the live ATS factory. */
export const BOND = "0x52Ea050Fe77A303b1A61fe15d8894892aFF02114" as const;
export const CASH = "0x55e9BAF7dCFe0e2A4E51e1BdeBB4e20d6247e365" as const;

export const CASH_DECIMALS = 6;
export const BOND_DECIMALS = 18;

export const HCS_TOPIC = "0.0.10367534" as const;
export const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";

const SCAN = "https://hashscan.io/testnet";

/**
 * HashScan keeps a separate route per entity kind, and sending an address to
 * the wrong one produces a confident "not found" rather than a redirect. A
 * borrower is an account, the market is a contract, and a booked settlement is
 * a schedule — three different pages.
 */
export const hashscan = (addr: string) => `${SCAN}/contract/${addr}`;
export const hashscanAccount = (addr: string) => `${SCAN}/account/${addr}`;

/**
 * A Hedera entity reached through the EVM wears a long-zero address whose low
 * bits are its entity number, so a schedule at 0x…9eD0e1 is 0.0.10408161.
 */
export const hashscanSchedule = (addr: string) => `${SCAN}/schedule/0.0.${BigInt(addr).toString()}`;
