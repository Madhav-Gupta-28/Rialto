import { createPublicClient, createWalletClient, http, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet, config } from "./config.js";
import { marketAbi, mandatesAbi, documentationAbi, Status } from "./abi.js";
import type { Mandate, RequestView } from "./strategy.js";
import type { OnChainDocument } from "./document.js";

export interface Chain {
  pub: PublicClient;
  wallet: WalletClient;
  account: ReturnType<typeof privateKeyToAccount>;
}

export function connect(): Chain {
  const account = privateKeyToAccount(config.privateKey);
  return {
    pub: createPublicClient({ chain: hederaTestnet, transport: http(config.rpcUrl) }) as PublicClient,
    wallet: createWalletClient({ account, chain: hederaTestnet, transport: http(config.rpcUrl) }),
    account,
  };
}

export interface FullRequest extends RequestView {
  status: Status;
  borrower: Hex;
  cash: Hex;
  bidDeadline: bigint;
  docName: Hex;
}

export async function readRequest(c: Chain, id: bigint): Promise<FullRequest> {
  const r = (await c.pub.readContract({
    address: config.market,
    abi: marketAbi,
    functionName: "get",
    args: [id],
  })) as {
    borrower: Hex; term: bigint; status: number; collateral: Hex; bidDeadline: bigint;
    docFromChain: boolean; cash: Hex; dueAt: bigint; lender: Hex; collateralAmount: bigint;
    principal: bigint; repayAmount: bigint; docName: Hex; docHash: Hex;
  };

  return {
    id,
    status: r.status as Status,
    borrower: r.borrower,
    collateral: r.collateral,
    collateralAmount: r.collateralAmount,
    cash: r.cash,
    principal: r.principal,
    term: r.term,
    bidDeadline: r.bidDeadline,
    docName: r.docName,
    docHash: r.docHash,
    docFromChain: r.docFromChain,
  };
}

export async function requestCount(c: Chain): Promise<bigint> {
  return (await c.pub.readContract({ address: config.market, abi: marketAbi, functionName: "requests" })) as bigint;
}

/**
 * Read the document straight off the security.
 *
 * The market already froze this hash at `open`, and the agent verifies against
 * that frozen value rather than this one — an issuer who replaced the document
 * mid-auction must not be able to move a bid. Reading here only supplies the
 * URI, which is why a failure is survivable.
 */
export async function readDocument(c: Chain, security: Hex, name: Hex): Promise<OnChainDocument | null> {
  try {
    const [uri, hash, timestamp] = (await c.pub.readContract({
      address: security,
      abi: documentationAbi,
      functionName: "getDocument",
      args: [name],
    })) as [string, Hex, bigint];
    return { uri, hash, timestamp };
  } catch {
    return null; // no documentation facet, or nothing under that name
  }
}

export async function readMandate(c: Chain, owner: Hex): Promise<(Mandate & { agent: Hex; active: boolean }) | null> {
  const m = (await c.pub.readContract({
    address: config.mandates,
    abi: mandatesAbi,
    functionName: "mandateOf",
    args: [owner],
  })) as { agent: Hex; maxPerDeal: bigint; maxTotal: bigint; minRateBps: number; maxTerm: bigint; active: boolean };

  if (!m.active) return null;
  return {
    agent: m.agent,
    active: m.active,
    maxPerDeal: m.maxPerDeal,
    maxTotal: m.maxTotal,
    minRateBps: Number(m.minRateBps),
    maxTerm: m.maxTerm,
  };
}

/** Who this key bids for: the owner that bound it, or itself. */
export async function resolveUnderwriter(c: Chain, agent: Hex): Promise<Hex> {
  const owner = (await c.pub.readContract({
    address: config.mandates,
    abi: mandatesAbi,
    functionName: "ownerOfAgent",
    args: [agent],
  })) as Hex;
  return owner === "0x0000000000000000000000000000000000000000" ? agent : owner;
}

export async function assetAllowed(c: Chain, owner: Hex, asset: Hex): Promise<boolean> {
  return (await c.pub.readContract({
    address: config.mandates,
    abi: mandatesAbi,
    functionName: "assetAllowed",
    args: [owner, asset],
  })) as boolean;
}

/** Everything already committed: funded positions plus standing best bids. */
export async function committed(c: Chain, owner: Hex): Promise<bigint> {
  const [live, reserved] = (await Promise.all([
    c.pub.readContract({ address: config.market, abi: marketAbi, functionName: "liveExposure", args: [owner] }),
    c.pub.readContract({ address: config.market, abi: marketAbi, functionName: "reservedExposure", args: [owner] }),
  ])) as [bigint, bigint];
  return live + reserved;
}

export async function submitBid(c: Chain, id: bigint, repayAmount: bigint, reasoningRef: Hex): Promise<Hex> {
  const hash = await c.wallet.writeContract({
    address: config.market,
    abi: marketAbi,
    functionName: "bid",
    args: [id, repayAmount, reasoningRef],
    account: c.account,
    chain: hederaTestnet,
  });
  await c.pub.waitForTransactionReceipt({ hash });
  return hash;
}
