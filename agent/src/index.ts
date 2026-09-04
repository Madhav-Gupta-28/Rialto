import { hexToString, type Hex } from "viem";
import { config } from "./config.js";
import { Status } from "./abi.js";
import {
  connect, readRequest, requestCount, readDocument, readMandate,
  resolveUnderwriter, assetAllowed, committed, submitBid, type Chain,
} from "./chain.js";
import { fetchAndVerify } from "./document.js";
import { decide, type RequestView } from "./strategy.js";
import { formOpinion, RuleBasedReasoner } from "./reason.js";
import { HcsPublisher, LocalPublisher, type Publisher, type ReasoningRecord } from "./hcs.js";

const log = (...a: unknown[]) => console.log(...a);

function publisher(): Publisher {
  if (config.hcsTopicId && config.hederaAccountId) {
    return new HcsPublisher(config.hederaAccountId, config.privateKey, config.hcsTopicId);
  }
  log("! no HCS topic configured — reasoning will be hashed but not timestamped by consensus");
  return new LocalPublisher();
}

/**
 * Consider one request, from end to end.
 *
 * Returns a line describing what happened either way. Every exit that is not a
 * bid is a normal underwriting outcome, not an error: declining is the most
 * common correct answer, and an agent that cannot verify a document should be
 * silent rather than confident.
 */
export async function considerRequest(
  c: Chain,
  id: bigint,
  underwriter: Hex,
  pub: Publisher,
): Promise<string> {
  const req = await readRequest(c, id);

  if (req.status !== Status.Open) return `#${id} is ${Status[req.status]}, nothing to do`;
  if (BigInt(Math.floor(Date.now() / 1000)) >= req.bidDeadline) return `#${id} auction has closed`;

  const mandate = await readMandate(c, underwriter);
  if (!mandate) return `#${id} skipped — no active mandate for ${underwriter}`;
  if (!(await assetAllowed(c, underwriter, req.collateral))) {
    return `#${id} skipped — ${req.collateral} is not on the mandate's asset list`;
  }

  // The URI comes from the security as it stands now; the hash to verify
  // against is the one the market froze at open(). That ordering is the point:
  // an issuer who swaps the document mid-auction cannot move a bid, because the
  // new bytes will not hash to what the request committed to.
  const doc = await readDocument(c, req.collateral, req.docName);
  if (!doc) return `#${id} declined — the collateral carries no document under ${label(req.docName)}`;

  const outcome = await fetchAndVerify({ ...doc, hash: req.docHash });
  if (!outcome.ok) {
    return `#${id} declined — ${outcome.reason}: ${outcome.detail}`;
  }
  log(`  #${id} document verified against the hash frozen at open (${req.docHash.slice(0, 18)}…)`);

  const view: RequestView = {
    id: req.id,
    collateral: req.collateral,
    collateralAmount: req.collateralAmount,
    principal: req.principal,
    term: req.term,
    docHash: req.docHash,
    docFromChain: req.docFromChain,
  };

  const reasoner = new RuleBasedReasoner(mandate, view);
  const { opinion, why } = await formOpinion(reasoner, view, outcome.text, config.strategy);
  if (!opinion) return `#${id} declined — ${why}`;

  const d = decide(opinion, view, mandate, await committed(c, underwriter));
  if (!d.bid) {
    for (const f of opinion.flags) log(`  #${id} flag: ${f}`);
    return `#${id} no bid — ${d.why}`;
  }

  const record: ReasoningRecord = {
    requestId: id.toString(),
    docHash: req.docHash,
    docFromChain: req.docFromChain,
    underwriter,
    agent: c.account.address,
    bid: true,
    repayAmount: d.repayAmount.toString(),
    rateBps: d.rateBps,
    reasons: opinion.reasons,
    flags: opinion.flags,
    publishedAt: Date.now(),
  };

  // Published before the bid, and therefore before anyone knows who won. That
  // ordering is what makes the reasoning non-retrofittable.
  const published = await pub.publish(record);
  log(`  #${id} reasoning published — ref ${published.ref.slice(0, 18)}… seq ${published.sequenceNumber}`);

  const tx = await submitBid(c, id, d.repayAmount, published.ref);
  return `#${id} bid ${d.repayAmount} at ${d.rateBps}bps — ${tx}`;
}

async function main(): Promise<void> {
  const c = connect();
  const underwriter = await resolveUnderwriter(c, c.account.address);
  const pub = publisher();

  log(`rialto agent`);
  log(`  agent key   ${c.account.address}`);
  log(`  bidding for ${underwriter}${underwriter === c.account.address ? " (itself)" : ""}`);
  log(`  market      ${config.market}`);
  log(`  strategy    ${config.strategy}`);
  log("");

  const seen = new Set<string>();
  for (;;) {
    try {
      const n = await requestCount(c);
      for (let i = 0n; i < n; i++) {
        if (seen.has(i.toString())) continue;
        const line = await considerRequest(c, i, underwriter, pub);
        // Only stop reconsidering once the outcome cannot change.
        if (!line.includes("nothing to do") && !line.includes("has closed")) log(line);
        if (line.includes("bid ") || line.includes("nothing to do") || line.includes("has closed")) {
          seen.add(i.toString());
        }
      }
    } catch (e) {
      log(`! ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise((r) => setTimeout(r, config.pollMs));
  }
}

function label(b: Hex): string {
  try {
    return hexToString(b, { size: 32 }).replace(/\0+$/, "") || b;
  } catch {
    return b;
  }
}

// Only run the loop when executed directly, so tests can import the module.
if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
