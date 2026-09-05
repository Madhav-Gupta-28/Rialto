import "dotenv/config";
import { defineChain } from "viem";

/**
 * Hedera testnet as viem sees it.
 *
 * The relay is EVM-compatible but not Ethereum: gas is metered differently and
 * estimates come back low, so nothing here should be treated as a stand-in for
 * measuring on the network itself.
 */
export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [process.env.HEDERA_TESTNET_RPC ?? "https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — copy .env.example to .env and fill it in`);
  return v;
}

export const config = {
  rpcUrl: process.env.HEDERA_TESTNET_RPC ?? "https://testnet.hashio.io/api",
  mirrorNode: process.env.MIRROR_NODE ?? "https://testnet.mirrornode.hedera.com/api/v1",

  get privateKey(): `0x${string}` {
    const k = required("PRIVATE_KEY");
    return (k.startsWith("0x") ? k : `0x${k}`) as `0x${string}`;
  },
  get market(): `0x${string}` {
    return required("MARKET_ADDRESS") as `0x${string}`;
  },
  get mandates(): `0x${string}` {
    return required("MANDATES_ADDRESS") as `0x${string}`;
  },
  /** Optional. Without it the recovery check below is skipped, not faked. */
  get lens(): `0x${string}` | undefined {
    const a = process.env.LENS_ADDRESS;
    return a ? (a as `0x${string}`) : undefined;
  },

  /** Hedera account for HCS. Message submission needs the native SDK, not the EVM. */
  hederaAccountId: process.env.HEDERA_ACCOUNT_ID ?? "",
  hcsTopicId: process.env.HCS_TOPIC_ID ?? "",

  /** The agent's brief. Soft, editable, and deliberately not on-chain. */
  strategy:
    process.env.STRATEGY ??
    [
      "Senior secured paper only.",
      "Require the document to state seniority and a maturity date explicitly.",
      "Never bid when the loan term runs past the instrument's maturity.",
      "Add 200bps for an issuer you cannot identify from the document.",
      "When anything material is unclear, do not bid.",
    ].join(" "),

  pollMs: Number(process.env.POLL_MS ?? 5_000),
} as const;
