"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { maxUint256, type Hex } from "viem";
import { marketAbi, securityAbi } from "@/lib/abi";
import { MARKET, CASH, CASH_DECIMALS, BOND_DECIMALS, HCS_TOPIC, MIRROR, hashscan } from "@/lib/chain";
import { units, parseUnits, duration, bps, short } from "@/lib/format";
import StatusPill from "@/components/Status";
import DocumentCheck from "@/components/DocumentCheck";
import Tx from "@/components/Tx";

const ZERO = "0x0000000000000000000000000000000000000000";

export default function RequestPage() {
  const { id: raw } = useParams<{ id: string }>();
  const id = BigInt(raw);
  const { address } = useAccount();

  const { data: r, refetch } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "get", args: [id] });
  const { data: best, refetch: refetchBid } = useReadContract({
    address: MARKET, abi: marketAbi, functionName: "bestBid", args: [id],
  });
  const { data: schedule } = useReadContract({
    address: MARKET, abi: marketAbi, functionName: "settlementSchedule", args: [id],
  });

  // Keep the page's shape while the chain answers, so the layout does not jump
  // once it does.
  if (!r) {
    return (
      <section className="first">
        <div className="wrap">
          <h1 className="display" style={{ fontSize: 38 }}>Request #{raw}</h1>
          <p className="sub">Reading Hedera testnet…</p>
          <div className="grid two" style={{ marginTop: 26 }}>
            <div className="card" style={{ minHeight: 220 }} />
            <div className="card" style={{ minHeight: 220 }} />
          </div>
        </div>
      </section>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const open = r.status === 0;
  const funded = r.status === 1;
  const biddingOpen = open && now < Number(r.bidDeadline);
  const awardable = open && now >= Number(r.bidDeadline);
  const matured = funded && now > Number(r.dueAt);
  const isBorrower = !!address && address.toLowerCase() === r.borrower.toLowerCase();
  const hasBid = (best?.[0] ?? ZERO) !== ZERO;
  const reasoningRef = best?.[3];

  return (
    <>
      <section className="first">
        <div className="wrap">
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6 }}>
            <h1 className="display" style={{ margin: 0, fontSize: 38 }}>Request #{raw}</h1>
            <StatusPill status={r.status} />
          </div>
          <p className="sub">
            {units(r.principal, CASH_DECIMALS)} dUSD for {duration(r.term)} against{" "}
            {units(r.collateralAmount, BOND_DECIMALS, 0)} RDN27
          </p>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="grid two">
            <div>
              <div className="card">
                <p className="eyebrow">Terms</p>
                <Row k="Principal sought" v={`${units(r.principal, CASH_DECIMALS)} dUSD`} />
                <Row k="Collateral pledged" v={`${units(r.collateralAmount, BOND_DECIMALS, 0)} RDN27`} />
                <Row k="Term" v={`${duration(r.term)} from award`} />
                <Row k="Borrower" v={short(r.borrower)} />
                {open && (
                  <Row
                    k="Auction"
                    v={biddingOpen ? `closes in ${duration(Number(r.bidDeadline) - now)}` : "closed"}
                  />
                )}
                {funded && (
                  <>
                    <Row k="Lender" v={short(r.lender)} />
                    <Row k="Repayment due" v={`${units(r.repayAmount, CASH_DECIMALS)} dUSD`} />
                    <Row k="Due" v={matured ? "matured" : `in ${duration(Number(r.dueAt) - now)}`} />
                  </>
                )}
              </div>

              <div className="card">
                <p className="eyebrow">The bid</p>
                {hasBid ? (
                  <>
                    <Row k="Underwriter" v={short(best![0])} />
                    <Row
                      k="Submitted by"
                      v={
                        best![1].toLowerCase() === best![0].toLowerCase()
                          ? `${short(best![1])} (in person)`
                          : `${short(best![1])} (agent key)`
                      }
                    />
                    <Row k="Repayment" v={`${units(best![2], CASH_DECIMALS)} dUSD`} />
                    <Row k="Rate" v={bps(rateOf(r.principal, best![2], r.term))} />
                    {reasoningRef && reasoningRef !== `0x${"00".repeat(32)}` && (
                      <>
                        <Row k="Reasoning" v={`${reasoningRef.slice(0, 18)}…`} />
                        <p className="note" style={{ marginTop: 12 }}>
                          The bid carries the hash of an explanation published to{" "}
                          <a href={`${MIRROR}/topics/${HCS_TOPIC}/messages`} target="_blank" rel="noreferrer">
                            HCS topic {HCS_TOPIC}
                          </a>{" "}
                          before the outcome was known. Hash the message and it matches this value.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <p className="sub">No bids yet.</p>
                )}
              </div>

              {funded && schedule && schedule !== ZERO && (
                <div className="card">
                  <p className="eyebrow">Settlement</p>
                  <p className="lede" style={{ fontSize: 14 }}>
                    Hedera will call <code>claim()</code> on this request at maturity. Nobody has to be
                    watching.
                  </p>
                  <Row k="Scheduled transaction" v={String(schedule)} />
                </div>
              )}
            </div>

            <div>
              <DocumentCheck
                collateral={r.collateral as Hex}
                docName={r.docName as Hex}
                frozenHash={r.docHash as Hex}
                docFromChain={r.docFromChain}
              />

              <Actions
                id={id}
                principal={r.principal}
                term={r.term}
                biddingOpen={biddingOpen}
                awardable={awardable}
                funded={funded}
                matured={matured}
                isBorrower={isBorrower}
                hasBid={hasBid}
                onDone={() => {
                  refetch();
                  refetchBid();
                }}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function rateOf(principal: bigint, repay: bigint, term: bigint): number {
  if (repay <= principal || principal === 0n || term === 0n) return 0;
  const v = ((repay - principal) * 10_000n * 31_536_000n) / (principal * term);
  return v > 65535n ? 65535 : Number(v);
}

/**
 * Everything a person can do to this request from a browser.
 *
 * The bidding form is the point. An underwriting agent and a human produce the
 * identical on-chain bid — the market cannot tell them apart and does not care —
 * so the interface has to let a person do it, or the claim is only a claim.
 */
function Actions(props: {
  id: bigint;
  principal: bigint;
  term: bigint;
  biddingOpen: boolean;
  awardable: boolean;
  funded: boolean;
  matured: boolean;
  isBorrower: boolean;
  hasBid: boolean;
  onDone: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, error, isPending } = useWriteContract();
  const [repay, setRepay] = useState("");

  const { data: allowance } = useReadContract({
    address: CASH,
    abi: securityAbi,
    functionName: "allowance",
    args: address ? [address, MARKET] : undefined,
    query: { enabled: !!address },
  });

  const needsApproval = (allowance ?? 0n) < props.principal;
  const send = (fn: "award" | "repay" | "claim" | "cancel" | "releaseBid") =>
    writeContract({ address: MARKET, abi: marketAbi, functionName: fn, args: [props.id] }, { onSuccess: props.onDone });

  if (!isConnected) {
    return (
      <div className="card">
        <p className="eyebrow">Act on this request</p>
        <p className="sub">Connect a wallet to bid, award or settle.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="eyebrow">Act on this request</p>

      {props.biddingOpen && (
        <>
          <p className="lede" style={{ fontSize: 14, marginBottom: 14 }}>
            Bid the repayment you want. Lowest wins. An agent bidding for you would submit exactly this.
          </p>
          <label className="field">
            <span className="name">Repayment, in dUSD</span>
            <input
              className="text"
              inputMode="decimal"
              placeholder={units(props.principal, CASH_DECIMALS)}
              value={repay}
              onChange={(e) => setRepay(e.target.value)}
            />
            <span className="hint">
              {repay && isAmount(repay)
                ? `${bps(rateOf(props.principal, safeParse(repay), props.term))} annualised`
                : `must be at least the principal, ${units(props.principal, CASH_DECIMALS)}`}
            </span>
          </label>

          {needsApproval && (
            <>
              <p className="note" style={{ marginBottom: 12 }}>
                The market moves cash straight from lender to borrower at award, so it needs an allowance
                first. Bidding without one wins an auction you cannot fund.
              </p>
              <button
                className="btn ghost"
                style={{ marginBottom: 12 }}
                disabled={isPending}
                onClick={() =>
                  writeContract({
                    address: CASH,
                    abi: securityAbi,
                    functionName: "approve",
                    args: [MARKET, maxUint256],
                  })
                }
              >
                Approve dUSD
              </button>
            </>
          )}

          <button
            className="btn"
            disabled={isPending || !isAmount(repay)}
            onClick={() =>
              writeContract(
                {
                  address: MARKET,
                  abi: marketAbi,
                  functionName: "bid",
                  args: [props.id, safeParse(repay), `0x${"00".repeat(32)}` as Hex],
                },
                { onSuccess: props.onDone },
              )
            }
          >
            {isPending ? "Submitting…" : "Place bid"}
          </button>
          <p className="hint">
            A manual bid carries no reasoning reference. An agent publishes its reasoning to HCS first and
            puts that hash here.
          </p>
        </>
      )}

      {props.awardable && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {props.hasBid && (
            <button className="btn" disabled={isPending} onClick={() => send("award")}>
              Award
            </button>
          )}
          {props.isBorrower && (
            <button className="btn ghost" disabled={isPending} onClick={() => send("cancel")}>
              Withdraw request
            </button>
          )}
          {props.hasBid && (
            <button className="btn ghost" disabled={isPending} onClick={() => send("releaseBid")}>
              Release stale bid
            </button>
          )}
        </div>
      )}

      {props.awardable && (
        <p className="hint">
          Award is permissionless — the outcome is already determined by state, so there is nothing for a
          caller to influence.
        </p>
      )}

      {props.funded && !props.matured && props.isBorrower && (
        <button className="btn" disabled={isPending} onClick={() => send("repay")}>
          Repay and take the collateral back
        </button>
      )}

      {props.funded && !props.matured && !props.isBorrower && (
        <p className="sub">Running. Only the borrower can repay.</p>
      )}

      {props.matured && (
        <>
          <button className="btn" disabled={isPending} onClick={() => send("claim")}>
            Claim the collateral for the lender
          </button>
          <p className="hint">
            Pays the lender recorded in storage, never the caller — which is why it is safe to hand to the
            network as a scheduled call.
          </p>
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <Tx hash={hash} error={error} />
      </div>
    </div>
  );
}

const isAmount = (s: string) => /^\d+(\.\d+)?$/.test(s.trim());
function safeParse(s: string): bigint {
  try {
    return parseUnits(s, CASH_DECIMALS);
  } catch {
    return 0n;
  }
}
