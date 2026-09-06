import { hexToString, type Hex } from "viem";
import { config } from "./config.js";
import { Status } from "./abi.js";
import {
  connect, readRequest, requestCount, readDocument, readMandate,
  resolveUnderwriter, assetAllowed, committed, submitBid, bestBid, chainNow, standingOf,
  readCoupons, cashDecimals, type Chain,
} from "./chain.js";
import { fetchAndVerify } from "./document.js";
import { manufacturedExposure } from "./coupons.js";
import { decide, rateBps, type RequestView } from "./strategy.js";
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
 * What happened to one request, and whether it is worth looking at again.
 *
 * `settled` means the outcome can no longer change, so the loop stops
 * reconsidering it. Everything else is retried on the next pass, because it
 * might. Driving that decision off a structured field rather than off the
 * wording of a log line means a reworded message cannot quietly change how the
 * agent behaves.
 */
export interface Outcome {
  line: string;
  settled: boolean;
  /** Worth printing. A request that is simply not ours is not news. */
  notable: boolean;
}

const settled = (line: string, notable = true): Outcome => ({ line, settled: true, notable });
const retry = (line: string, notable = true): Outcome => ({ line, settled: false, notable });

/**
 * Consider one request, from end to end.
 *
 * Every exit that is not a bid is a normal underwriting outcome, not an error:
 * declining is the most common correct answer, and an agent that cannot verify
 * a document should be silent rather than confident.
 */
export async function considerRequest(
  c: Chain,
  id: bigint,
  underwriter: Hex,
  pub: Publisher,
): Promise<Outcome> {
  const req = await readRequest(c, id);

  if (req.status !== Status.Open) return settled(`#${id} is ${Status[req.status]}, nothing to do`, false);

  // Consensus time, not the agent's clock. A deadline is chain state, and a
  // skewed local clock would either skip a live auction or spend a fee on one
  // that has already closed.
  if ((await chainNow(c)) >= req.bidDeadline) return settled(`#${id} auction has closed`, false);

  // Already winning. Bidding again would only be an attempt to undercut
  // ourselves, which the market refuses and which would waste the fee.
  const ours = await bestBid(c, id);
  if (ours.underwriter.toLowerCase() === underwriter.toLowerCase()) {
    return settled(`#${id} already holds our bid at ${ours.repayAmount}`);
  }

  const mandate = await readMandate(c, underwriter);
  if (!mandate) return retry(`#${id} skipped — no active mandate for ${underwriter}`);
  if (!(await assetAllowed(c, underwriter, req.collateral))) {
    return retry(`#${id} skipped — ${req.collateral} is not on the mandate's asset list`, false);
  }

  // Could we take the collateral if this defaults? A permissioned security can
  // refuse to deliver to an account that is frozen, off its control list, or
  // without a KYC credential — and a bid made in that state prices a secured
  // loan while owning an unsecured one. Unknown is not the same as clear: with
  // no lens configured the check is skipped and said to be skipped.
  const standing = await standingOf(c, req.collateral, underwriter);
  if (standing && standing !== "Ok") {
    return retry(`#${id} declined — ${underwriter} cannot receive ${req.collateral} on default (${standing})`);
  }

  // The URI comes from the security as it stands now; the hash to verify
  // against is the one the market froze at open(). That ordering is the point:
  // an issuer who swaps the document mid-auction cannot move a bid, because the
  // new bytes will not hash to what the request committed to.
  const doc = await readDocument(c, req.collateral, req.docName);
  if (!doc) return retry(`#${id} declined — no document under ${label(req.docName)}`);

  const outcome = await fetchAndVerify({ ...doc, hash: req.docHash });
  if (!outcome.ok) {
    const line = `#${id} declined — ${outcome.reason}: ${outcome.detail}`;
    // A mismatch is a settled fact: the request froze its hash at open and that
    // can never change, so the bytes behind this URI are not the ones anyone
    // committed to. A refused or unreachable URI might simply be a bad minute.
    return outcome.reason === "hash-mismatch" || outcome.reason === "blocked-uri"
      ? settled(line)
      : retry(line);
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
  if (!opinion) return retry(`#${id} declined — ${why}`);

  const d = decide(opinion, view, mandate, await committed(c, underwriter));
  if (!d.bid) {
    for (const f of opinion.flags) log(`  #${id} flag: ${f}`);
    return settled(`#${id} no bid — ${d.why}`);
  }

  // A coupon paying inside the term is the lender's cost, not the borrower's.
  // The escrow is the holder of record, so the security pays the market and the
  // market nets it off the repayment — the underwriter hands over the principal
  // and gets back less than the figure they bid. Quoting without it is quoting
  // one rate and earning another, so it is added back to the ask.
  //
  // The term the contract will use runs from *award*, and award has not
  // happened yet. `award` is permissionless and the borrower wants their money,
  // so in practice it lands on the deadline and this window is the right one;
  // but it is an assumption and it fails in two directions worth naming. A
  // coupon paying between the deadline and a late award is priced here and will
  // not be recorded — the borrower pays for income the lender never receives. A
  // coupon paying just past this window but inside the real one is recorded and
  // was not priced — the lender eats it.
  //
  // Both are pricing errors and neither is a settlement error: `recordCoupon`
  // decides membership from the request's own dates, so no money moves through
  // the contract on this estimate. The only thing at risk is the number bid.
  const { coupons, instrument } = await readCoupons(c, req.collateral, config.market);
  const assumedAward = req.bidDeadline;
  const exposure = manufacturedExposure(
    coupons,
    instrument,
    assumedAward,
    assumedAward + req.term,
    req.collateralAmount,
    await cashDecimals(c, req.cash),
  );

  let repayAmount = d.repayAmount;
  if (exposure.owed > 0n) {
    repayAmount += exposure.owed;
    const which = [...exposure.settled, ...exposure.projected].join(", ");
    log(
      `  #${id} coupon ${which} pays inside the term if this awards on time — ` +
        `${exposure.owed} added to the ask for the market to net back off`,
    );
  }
  for (const cid of exposure.unpriceable) {
    log(`  #${id} coupon ${cid} falls inside the term and cannot be priced — bidding without it`);
  }

  const rate = rateBps(req.principal, repayAmount, req.term);

  const record: ReasoningRecord = {
    requestId: id.toString(),
    docHash: req.docHash,
    docFromChain: req.docFromChain,
    underwriter,
    agent: c.account.address,
    bid: true,
    repayAmount: repayAmount.toString(),
    rateBps: rate,
    manufacturedOwed: exposure.owed.toString(),
    reasons: opinion.reasons,
    flags: opinion.flags,
    publishedAt: Date.now(),
  };

  // Published before the bid, and therefore before anyone knows who won. That
  // ordering is what makes the reasoning non-retrofittable.
  const published = await pub.publish(record);
  log(`  #${id} reasoning published — ref ${published.ref.slice(0, 18)}… seq ${published.sequenceNumber}`);

  const tx = await submitBid(c, id, repayAmount, published.ref);
  return settled(`#${id} bid ${repayAmount} at ${rate}bps — ${tx}`);
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
        const outcome = await considerRequest(c, i, underwriter, pub);
        if (outcome.notable) log(outcome.line);
        if (outcome.settled) seen.add(i.toString());
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
