import { createPublicClient, createWalletClient, http, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet, config } from "./config.js";
import { marketAbi, mandatesAbi, documentationAbi, lensAbi, STANDING, Status } from "./abi.js";
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

/**
 * Whether an account could actually receive this security.
 *
 * An underwriter bids on collateral it expects to take if the loan defaults. If
 * the security would refuse that transfer — the account frozen, off the control
 * list, or without a KYC credential — then the recovery leg of the trade does
 * not exist, and the bid is for an unsecured loan wearing a secured one's
 * price. The check is cheap and it is the difference between collateral and the
 * appearance of collateral.
 *
 * Returns `undefined` when there is no lens configured or it will not answer,
 * which the caller must treat as "unknown" rather than "fine".
 */
export async function standingOf(c: Chain, security: Hex, account: Hex): Promise<string | undefined> {
  if (!config.lens) return undefined;
  try {
    const s = (await c.pub.readContract({
      address: config.lens,
      abi: lensAbi,
      functionName: "standingOf",
      args: [security, account],
    })) as number;
    return STANDING[s] ?? `unknown(${s})`;
  } catch {
    return undefined;
  }
}

/** Everything already committed: funded positions plus standing best bids. */
export async function committed(c: Chain, owner: Hex): Promise<bigint> {
  const [live, reserved] = (await Promise.all([
    c.pub.readContract({ address: config.market, abi: marketAbi, functionName: "liveExposure", args: [owner] }),
    c.pub.readContract({ address: config.market, abi: marketAbi, functionName: "reservedExposure", args: [owner] }),
  ])) as [bigint, bigint];
  return live + reserved;
}

/** The standing best bid, so an agent does not try to outbid itself. */
export async function bestBid(c: Chain, id: bigint): Promise<{underwriter: Hex; repayAmount: bigint}> {
  const r = (await c.pub.readContract({
    address: config.market,
    abi: marketAbi,
    functionName: "bestBid",
    args: [id],
  })) as readonly [Hex, Hex, bigint, Hex];
  return { underwriter: r[0], repayAmount: r[2] };
}

/**
 * Submit the bid and confirm it actually landed.
 *
 * Waiting for a receipt is not the same as checking it. A reverted transaction
 * still produces one, so without the status check the agent would report a bid
 * it never placed — and it would have already published reasoning for it.
 */
export async function submitBid(c: Chain, id: bigint, repayAmount: bigint, reasoningRef: Hex): Promise<Hex> {
  const hash = await c.wallet.writeContract({
    address: config.market,
    abi: marketAbi,
    functionName: "bid",
    args: [id, repayAmount, reasoningRef],
    account: c.account,
    chain: hederaTestnet,
  });

  const receipt = await c.pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`bid reverted on chain: ${hash}`);
  return hash;
}

/** Chain time, not the agent's clock. A deadline is consensus state. */
export async function chainNow(c: Chain): Promise<bigint> {
  const block = await c.pub.getBlock({ blockTag: "latest" });
  return block.timestamp;
}
