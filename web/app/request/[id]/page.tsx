"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useWrite } from "@/lib/useWrite";
import { amount } from "@/lib/amount";
import { maxUint256, type Hex } from "viem";
import { marketAbi, securityAbi, couponMarketAbi, mandatesAbi } from "@/lib/abi";
import { lensAbi, explain, type Obstacle } from "@/lib/lens";
import { MARKET, MANDATES, LENS, CASH, CASH_DECIMALS, BOND_DECIMALS, HCS_TOPIC, MIRROR, hashscan } from "@/lib/chain";
import { units, duration, bps, short } from "@/lib/format";
import StatusPill from "@/components/Status";
import DocumentCheck from "@/components/DocumentCheck";
import ManufacturedPayment from "@/components/ManufacturedPayment";
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

  // Asked before anyone presses anything. A permissioned security can be paused
  // or an account delisted between one block and the next, and the alternative
  // to asking is letting the user discover it as a bare revert.
  // What the borrower actually hands over: the agreed repayment less any income
  // the collateral earned while it was pledged. Showing `repayAmount` here would
  // be the wrong number the moment a coupon is recorded.
  const { data: due } = useReadContract({
    address: MARKET, abi: couponMarketAbi, functionName: "repaymentDue", args: [id],
    query: { refetchInterval: 15_000 },
  });

  const { data: lens } = useReadContract({
    address: LENS, abi: lensAbi, functionName: "check", args: [id],
    query: { refetchInterval: 15_000 },
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

  const obstacle = lens
    ? explain({ blocker: Number(lens[0]), beneficiary: lens[1], viewer: address, matured })
    : null;

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
                    <Row k="Agreed repayment" v={`${units(r.repayAmount, CASH_DECIMALS)} dUSD`} />
                    <Row
                      k="Repayment due"
                      v={`${units(due ?? r.repayAmount, CASH_DECIMALS)} dUSD`}
                    />
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

              {(funded || r.status === 2 || r.status === 3) && (
                <ManufacturedPayment
                  id={id}
                  collateral={r.collateral as Hex}
                  status={r.status}
                  awardedAt={Number(r.dueAt) - Number(r.term)}
                  dueAt={Number(r.dueAt)}
                  agreed={r.repayAmount}
                  lender={r.lender as Hex}
                  onDone={() => {
                    refetch();
                    refetchBid();
                  }}
                />
              )}

              <Actions
                id={id}
                obstacle={obstacle}
                principal={r.principal}
                borrower={r.borrower}
                due={due ?? r.repayAmount}
                term={r.term}
                biddingOpen={biddingOpen}
                awardable={awardable}
                lender={(best?.[0] ?? ZERO) as Hex}
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
  obstacle: Obstacle | null;
  principal: bigint;
  borrower: `0x${string}`;
  due: bigint;
  term: bigint;
  biddingOpen: boolean;
  awardable: boolean;
  lender: `0x${string}`;
  funded: boolean;
  matured: boolean;
  isBorrower: boolean;
  hasBid: boolean;
  onDone: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { write, data: hash, error, isPending } = useWrite();
  const [repay, setRepay] = useState("");

  // Validated once, used everywhere: the hint, the disabled state and the
  // argument all read the same result, so they cannot disagree.
  const parsed = amount(repay, CASH_DECIMALS, props.principal);

  const { data: allowance } = useReadContract({
    address: CASH,
    abi: securityAbi,
    functionName: "allowance",
    args: address ? [address, MARKET] : undefined,
    query: { enabled: !!address },
  });

  const needsApproval = (allowance ?? 0n) < props.principal;

  // Bidding is gated by a mandate. The market resolves a bidder to the
  // underwriter whose capital is at risk — the caller itself, or the owner that
  // bound this key as its agent — and refuses anyone whose mandate is not
  // active. The form was offered to every connected account regardless, so
  // bidding from an account that had never set one up spent a fee to be told
  // `NoMandate()` with nothing on screen explaining what a mandate is.
  const { data: mandateOwner } = useReadContract({
    address: MANDATES,
    abi: mandatesAbi,
    functionName: "ownerOfAgent",
    args: address ? [address] : undefined,
    query: { enabled: !!address && props.biddingOpen },
  });
  const bidsFor = mandateOwner && mandateOwner !== ZERO ? mandateOwner : address;
  const { data: mandate } = useReadContract({
    address: MANDATES,
    abi: mandatesAbi,
    functionName: "mandateOf",
    args: bidsFor ? [bidsFor] : undefined,
    query: { enabled: !!bidsFor && props.biddingOpen },
  });
  const noMandate = mandate !== undefined && !mandate.active;

  // Award moves the principal from the lender to the borrower, so it fails
  // unless the *lender* has approved the market and holds the cash. Neither is
  // visible to whoever presses the button — award is permissionless, so that is
  // usually not the lender — and the failure arrives as a bare TransferFailed
  // from inside the token. Read both and say which one is short.
  const { data: lenderAllowance } = useReadContract({
    address: CASH, abi: securityAbi, functionName: "allowance",
    args: [props.lender, MARKET],
    query: { enabled: props.awardable && props.lender !== ZERO },
  });
  const { data: lenderBalance } = useReadContract({
    address: CASH, abi: securityAbi, functionName: "balanceOf",
    args: [props.lender],
    query: { enabled: props.awardable && props.lender !== ZERO },
  });

  const shortAllowance = lenderAllowance !== undefined && lenderAllowance < props.principal;
  const shortBalance = lenderBalance !== undefined && lenderBalance < props.principal;
  const awardBlocked = shortAllowance || shortBalance;

  // A blocked settlement is refused by the security, not by the market, so the
  // button is disabled rather than hidden: the action is still the right one,
  // it just cannot land yet.
  const blocked = props.obstacle?.blocking === true;

  // Repay pulls `repaymentDue` from the borrower, which is the agreed repayment
  // less any income the collateral earned — more than the principal on any loan
  // that charges a fee. So approving exactly what you borrowed is not enough to
  // get back out of the loan, and the gap only shows up as a bare TransferFailed
  // after the network has charged for the attempt. Worse, the approve control
  // lived in the bidding panel, which a borrower at repayment time no longer
  // sees: they could read why it failed and still have no way to fix it.
  const { data: borrowerCash } = useReadContract({
    address: CASH,
    abi: securityAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && props.isBorrower && props.funded && !props.matured },
  });

  const repayShortAllowance = allowance !== undefined && allowance < props.due;
  const repayShortCash = borrowerCash !== undefined && borrowerCash < props.due;
  const repayShort = repayShortAllowance || repayShortCash;
  const send = (fn: "award" | "repay" | "claim" | "cancel" | "releaseBid") =>
    write({ address: MARKET, abi: marketAbi, functionName: fn, args: [props.id] }, { onSuccess: props.onDone });

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
              {parsed.ok
                ? `${bps(rateOf(props.principal, parsed.value, props.term))} annualised`
                : repay.trim() === ""
                  ? `at least the principal, ${units(props.principal, CASH_DECIMALS)}`
                  : parsed.why === "too small"
                    ? `below the principal of ${units(props.principal, CASH_DECIMALS)} — that is a gift, not a loan`
                    : parsed.why}
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
                  write({ address: CASH, abi: securityAbi, functionName: "approve", args: [MARKET, maxUint256] })
                }
              >
                Approve dUSD
              </button>
            </>
          )}

          {noMandate && (
            <div className="blocked" style={{ marginBottom: 12 }}>
              <p className="blocked-title">You have no mandate</p>
              <p className="blocked-detail">
                A bid commits capital, so the market will only take one from an account that has set its
                own limits first &mdash; the largest deal, the total exposure, the lowest rate it will
                accept, and which collateral it will lend against. Set one on the{" "}
                <a href="/mandate">Underwrite</a> page, then bid. This is the same check an agent bidding
                on your behalf has to pass.
              </p>
            </div>
          )}

          <button
            className="btn"
            disabled={isPending || !parsed.ok || noMandate}
            onClick={() =>
              parsed.ok &&
              write(
                {
                  address: MARKET,
                  abi: marketAbi,
                  functionName: "bid",
                  args: [props.id, parsed.value, `0x${"00".repeat(32)}` as Hex],
                },
                { onSuccess: props.onDone },
              )
            }
          >
            {isPending ? "Submitting…" : noMandate ? "Set a mandate first" : "Place bid"}
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
            <button className="btn" disabled={isPending || awardBlocked} onClick={() => send("award")}>
              {awardBlocked ? "The lender cannot fund this" : "Award"}
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

      {/* Withdrawing is the borrower's alone, and hiding the control from
          everyone else left a request with no bids looking like a dead end with
          no explanation — the reader cannot tell whether nothing can be done or
          whether they are simply the wrong account. Name both. */}
      {props.awardable && !props.hasBid && !props.isBorrower && (
        <p className="sub" style={{ marginTop: 10 }}>
          The auction closed without a bid. Only the borrower, {short(props.borrower)}, can withdraw this
          request and take the collateral back &mdash; you are connected as {short(address)}.
        </p>
      )}

      {props.awardable && awardBlocked && (
        <div className="blocked" style={{ marginTop: 12 }}>
          <p className="blocked-title">
            {shortBalance ? "The lender is short of cash" : "The lender has not approved enough"}
          </p>
          <p className="blocked-detail">
            Award moves {units(props.principal, CASH_DECIMALS)} dUSD from {short(props.lender)} to the
            borrower.{" "}
            {shortBalance
              ? `That account holds ${units(lenderBalance ?? 0n, CASH_DECIMALS)}.`
              : `It has approved the market for ${units(lenderAllowance ?? 0n, CASH_DECIMALS)}.`}{" "}
            Until the lender fixes that, this cannot settle — the collateral stays escrowed and the
            request stays open. Past the award window anyone may release the bid or withdraw the request.
          </p>
        </div>
      )}

      {props.awardable && !awardBlocked && (
        <p className="hint">
          Award is permissionless — the outcome is already determined by state, so there is nothing for a
          caller to influence.
        </p>
      )}

      {props.obstacle && (props.funded || props.matured) && (
        <div className={props.obstacle.blocking ? "blocked" : "note"} style={{ marginBottom: 14 }}>
          <p className="blocked-title">{props.obstacle.title}</p>
          <p className="blocked-detail">{props.obstacle.detail}</p>
        </div>
      )}

      {props.funded && !props.matured && props.isBorrower && (
        <>
          <button
            className="btn"
            disabled={isPending || blocked || repayShort}
            onClick={() => send("repay")}
          >
            {blocked
              ? "Repayment is blocked"
              : repayShortCash
                ? "You are short of dUSD"
                : repayShortAllowance
                  ? "Approve dUSD first"
                  : "Repay and take the collateral back"}
          </button>

          {!blocked && repayShort && (
            <div className="blocked" style={{ marginTop: 14 }}>
              <p className="blocked-title">
                {repayShortCash ? "Not enough dUSD to repay" : "The market cannot take the repayment"}
              </p>
              <p className="blocked-detail">
                Repaying hands over {units(props.due, CASH_DECIMALS)} dUSD &mdash; the agreed repayment
                less any income the collateral earned, which is more than the{" "}
                {units(props.principal, CASH_DECIMALS)} you borrowed.{" "}
                {repayShortCash
                  ? `You hold ${units(borrowerCash ?? 0n, CASH_DECIMALS)}.`
                  : `You have approved the market for ${units(allowance ?? 0n, CASH_DECIMALS)}.`}{" "}
                Until that is fixed the collateral stays escrowed and the loan keeps running.
              </p>
              {repayShortAllowance && !repayShortCash && (
                <button
                  className="btn ghost sm"
                  style={{ marginTop: 12 }}
                  disabled={isPending}
                  onClick={() =>
                    write(
                      {
                        address: CASH,
                        abi: securityAbi,
                        functionName: "approve",
                        args: [MARKET, maxUint256],
                      },
                      { onSuccess: props.onDone },
                    )
                  }
                >
                  Approve dUSD
                </button>
              )}
            </div>
          )}
        </>
      )}

      {props.funded && !props.matured && !props.isBorrower && (
        <p className="sub">Running. Only the borrower can repay.</p>
      )}

      {props.matured && (
        <>
          <button className="btn" disabled={isPending || blocked} onClick={() => send("claim")}>
            {blocked ? "Claim is blocked" : "Claim the collateral for the lender"}
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

