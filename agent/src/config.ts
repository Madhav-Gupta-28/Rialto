import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The agent is a workspace inside the repo and the keys live in the repo's own
// .env, one directory up. `dotenv/config` only ever looks at the process's
// working directory, so `cd agent && npm start` — the command the README gives
// — found nothing and died on a missing PRIVATE_KEY. Load the working directory
// first so an explicit local .env still wins, then fall back to the repo root.
loadEnv();
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });
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

/**
 * The agent's own identity, not the deployer's.
 *
 * `.env` holds several keys on purpose — the borrower, the underwriter and the
 * agent are meant to be genuinely different parties — and PRIVATE_KEY is the
 * deployer. Reading that one made the agent bid for *itself*, an account
 * holding no mandate, so every bid it placed would have been rejected; and it
 * paired the deployer's key with an empty HEDERA_ACCOUNT_ID, which silently
 * turned consensus timestamping off. Prefer the agent's own names and fall back
 * to the generic ones for a single-account setup.
 */
function agentSecret(specific: string, generic: string): string {
  return process.env[specific] || required(generic);
}

export const config = {
  rpcUrl: process.env.HEDERA_TESTNET_RPC ?? "https://testnet.hashio.io/api",
  mirrorNode: process.env.MIRROR_NODE ?? "https://testnet.mirrornode.hedera.com/api/v1",

  get privateKey(): `0x${string}` {
    const k = agentSecret("AGENT_KEY", "PRIVATE_KEY");
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
  hederaAccountId: process.env.AGENT_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID || "",
  hcsTopicId: process.env.HCS_TOPIC_ID ?? "",

  /** The agent's brief. Soft, editable, and deliberately not on-chain. */
  /**
   * The standing brief. Soft, editable, and the underwriter's own words —
   * unlike the mandate, which is on-chain and enforced.
   *
   * The last line is here because a model that reads properly refuses without
   * it. The demonstration bond's prospectus says, honestly, that it "describes
   * no real company", and a good underwriter declines to lend against a
   * fictitious issuer — which is the right answer to the wrong question on a
   * testnet. Naming the situation is the truthful fix; editing the disclaimer
   * out of the document would not be.
   */
  strategy:
    process.env.STRATEGY ??
    [
      "Senior secured paper only.",
      "Require the document to state seniority and a maturity date explicitly.",
      "Never bid when the loan term runs past the instrument's maturity.",
      "Add 200bps for an issuer you cannot identify from the document.",
      "When anything material is unclear, do not bid.",
      "This is a Hedera testnet demonstration and the instrument is a demonstration bond:",
      "its own notice that it describes no real company is expected, and is a flag to record",
      "rather than a reason on its own to decline. Assess the terms the document states.",
    ].join(" "),

  pollMs: Number(process.env.POLL_MS ?? 5_000),

  /**
   * The reasoner. With a key the agent reads the prospectus with a model; with
   * no key it falls back to `RuleBasedReasoner` and says so on startup, so the
   * demo never depends on a network call and nobody is left guessing which one
   * produced a bid.
   */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
  googleModel: process.env.GOOGLE_MODEL ?? "gemini-2.5-flash",
  /** Thinking is spent from this, so it has to cover deliberation and the answer. */
  googleMaxTokens: Number(process.env.GOOGLE_MAX_TOKENS ?? 4096),
  /** Bounded by the auction, not by patience. A slow underwriter misses the window. */
  reasonerTimeoutMs: Number(process.env.REASONER_TIMEOUT_MS ?? 30_000),
} as const;
