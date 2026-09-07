"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { marketAbi } from "@/lib/abi";
import { MARKET, BOND, hashscan } from "@/lib/chain";
import RequestRow from "@/components/RequestRow";
import Rise from "@/components/figures/Rise";
import PriceGap from "@/components/figures/PriceGap";
import StateMachine from "@/components/figures/StateMachine";
import Ordering from "@/components/figures/Ordering";
import CouponFall from "@/components/figures/CouponFall";

export default function Market() {
  const { data: count, isLoading } = useReadContract({
    address: MARKET,
    abi: marketAbi,
    functionName: "requests",
  });

  const n = Number(count ?? 0n);
  const ids = Array.from({ length: n }, (_, i) => BigInt(n - 1 - i)); // newest first

  return (
    <>
      {/* ── 01 · the thesis ───────────────────────────────────────── */}
      <section className="band void" style={{ paddingTop: 128 }}>
        <div className="wrap">
          <p className="eyebrow">Hedera · Asset Tokenization Studio</p>
          <h1 className="claim">
            An illiquid bond has no price.
            <br />
            <span className="dim">Rialto lends against it anyway.</span>
          </h1>
          <p className="lede" style={{ maxWidth: "58ch" }}>
            Every lending market needs a price to run liquidations. A corporate bond trades by appointment,
            so it has none — which is why the largest asset class on earth cannot be collateral. Rialto uses
            the structure bond desks already use.
          </p>

          <div className="stat-strip">
            <div className="stat">
              <b>{isLoading ? "—" : n}</b>
              <span>loans on chain</span>
            </div>
            <div className="stat">
              <b>0</b>
              <span>oracles read</span>
            </div>
            <div className="stat">
              <b>2</b>
              <span>endings</span>
            </div>
          </div>

          <div style={{ marginTop: 40, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/borrow">Raise cash against a security</Link>
            <Link className="btn ghost" href="/mandate">Underwrite</Link>
          </div>
        </div>
      </section>

      {/* ── 02 · the problem ──────────────────────────────────────── */}
      <section className="band paper">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">The problem</p>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)" }}>
              You cannot oracle a thing that does not trade.
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              A margin call on a liquid asset is a measurement. On a bond that printed three times this
              month it is a guess — and the gap between the last print and now is the whole risk.
            </p>
            <figure className="figure">
              <PriceGap />
              <figcaption>
                Same threshold. One of these can be liquidated safely. The other cannot be priced at all.
              </figcaption>
            </figure>
          </Rise>
        </div>
      </section>

      {/* ── 03 · the mechanism ────────────────────────────────────── */}
      <section className="band void">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">The mechanism</p>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)" }}>
              Two endings. Nothing in between.
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              A borrower pledges the security and asks for cash for a fixed term. Underwriters bid the
              repayment; lowest wins. After that, every branch depends on two things only — whether time
              passed, and whether the money arrived.
            </p>
            <figure className="figure">
              <StateMachine />
              <figcaption>
                No margin call, no partial liquidation, no auction. There is nothing to price, so there is
                nothing to unwind.
              </figcaption>
            </figure>
          </Rise>
        </div>
      </section>

      {/* ── 04 · the agent ────────────────────────────────────────── */}
      <section className="band paper">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">The underwriter</p>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)" }}>
              It publishes the reasoning before it knows the outcome.
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              The agent reads the offering document off the security, checks the bytes against the hash the
              issuer committed to, and writes its opinion to a consensus topic. Only then does it bid.
            </p>
            <figure className="figure">
              <Ordering />
              <figcaption>
                Consensus timestamped the explanation. It cannot have been written to fit what happened next.
              </figcaption>
            </figure>
          </Rise>
        </div>
      </section>

      {/* ── 05 · settlement ───────────────────────────────────────── */}
      <section className="band void">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">Settlement</p>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)" }}>
              The loan matured while nobody was watching.
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              At award the market asks Hedera to call <code>claim</code> on itself at maturity. No keeper,
              no bot, no cron job on somebody&rsquo;s laptop.
            </p>
            <div className="figure">
              <p className="readout" style={{ margin: 0 }}>
                <span className="k">consensus</span> <span className="v">15:03:25 UTC</span>
                {"  "}<span className="k">— dueAt + 60, exactly</span>
                <br />
                <span className="k">scheduled</span> <span className="v">True</span>
                {"  "}<span className="k">— the network ran it, not a caller</span>
                <br />
                <span className="k">payer</span> <span className="v">0.0.10382007</span>
                {"  "}<span className="k">— the contract paid for its own settlement</span>
                <br />
                <span className="k">result</span> <span className="state settled">success</span>
              </p>
            </div>
          </Rise>
        </div>
      </section>

      {/* ── 06 · the coupon ───────────────────────────────────────── */}
      <section className="band paper">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">Income while pledged</p>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)" }}>
              The bond kept paying. The borrower still got it.
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              While the security is pledged the escrow is the holder of record, so the coupon is paid to the
              market rather than to the borrower who still owns the bond. Repo settles that with a
              manufactured payment, netted against the repayment. So does this.
            </p>
            <figure className="figure" style={{ padding: "48px 30px" }}>
              <CouponFall />
            </figure>
          </Rise>
        </div>
      </section>

      {/* ── 07 · compliance ───────────────────────────────────────── */}
      <section className="band void">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">Compliance</p>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)" }}>
              The issuer froze the lender.
              <br />
              <span className="dim">The network tried to settle. It failed.</span>
            </h2>
            <p className="lede" style={{ maxWidth: "56ch" }}>
              These are permissioned securities. An issuer can pause, freeze or delist at any moment — and
              when they do, the position holds. It does not unwind, and nothing is lost.
            </p>
            <div className="figure">
              <p className="eyebrow" style={{ marginBottom: 14 }}>
                Every scheduled call the market has ever made
              </p>
              <p className="readout" style={{ margin: 0 }}>
                <span className="k">20:16:49</span> <span className="v">recordCoupon</span>{" "}
                <span className="state settled">success</span>
                <br />
                <span className="k">20:33:25</span> <span className="v">claim</span>{" "}
                <span className="state settled">success</span>
                <br />
                <span className="k">20:54:13</span> <span className="v">claim</span>{" "}
                <span className="state settled">success</span>
                <br />
                <span className="k">20:54:22</span> <span className="v">claim</span>{" "}
                <span className="state settled">success</span>
                <br />
                <span className="k">21:11:12</span> <span className="v">claim</span>{" "}
                <span className="state blocked">reverted</span>{" "}
                <span className="k">— lender not on the control list</span>
              </p>
              <figcaption style={{ textAlign: "left", marginTop: 22 }}>
                One line differs, and it is the one that matters. A control delays a settlement.
                It never destroys one.
              </figcaption>
            </div>
          </Rise>
        </div>
      </section>

      {/* ── 08 · verify ───────────────────────────────────────────── */}
      <section className="band paper tight">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">Verify</p>
            <h2 className="claim" style={{ fontSize: "clamp(26px,3.4vw,38px)" }}>
              Do not take any of this on trust.
            </h2>
            <div className="grid two" style={{ marginTop: 26 }}>
              <div>
                <p style={{ fontSize: 14, marginBottom: 6, color: "var(--paper-ink)" }}>
                  <strong>The reasoning predates the bid</strong>
                </p>
                <p className="readout" style={{ fontSize: 12 }}>script/verify-reasoning.sh 6</p>
                <p style={{ fontSize: 14, margin: "22px 0 6px", color: "var(--paper-ink)" }}>
                  <strong>The document is the one committed to</strong>
                </p>
                <p className="readout" style={{ fontSize: 12 }}>
                  cast call {BOND.slice(0, 10)}… &apos;getDocument(bytes32)&apos;
                </p>
              </div>
              <div>
                <p style={{ fontSize: 14, marginBottom: 6, color: "var(--paper-ink)" }}>
                  <strong>The network settled it, not a person</strong>
                </p>
                <p className="readout" style={{ fontSize: 12 }}>
                  GET /api/v1/schedules/&#123;id&#125; → executed_timestamp
                </p>
                <p style={{ fontSize: 14, margin: "22px 0 6px", color: "var(--paper-ink)" }}>
                  <strong>Everything else</strong>
                </p>
                <p className="readout" style={{ fontSize: 12 }}>forge test · 243 passing</p>
              </div>
            </div>
          </Rise>
        </div>
      </section>

      {/* ── 09 · the market ───────────────────────────────────────── */}
      <section className="band void" style={{ borderBottom: "none" }}>
        <div className="wrap">
          <p className="eyebrow">The market</p>
          <h2 className="claim" style={{ fontSize: "clamp(26px,3.4vw,38px)" }}>
            {isLoading ? "Reading the chain…" : `${n} loans, live from the contract.`}
          </h2>
          <p className="sub" style={{ maxWidth: "56ch" }}>
            No backend and no indexer — every figure below is a contract call made by your browser.
            Collateral is{" "}
            <a href={hashscan(BOND)} target="_blank" rel="noreferrer">RDN27</a>, a bond issued through the
            live ATS factory.
          </p>

          {isLoading ? (
            <p className="empty">Reading the chain…</p>
          ) : n === 0 ? (
            <p className="empty">No requests yet. Open the first one.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 26 }}>
              <table className="rows">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Status</th>
                    <th>Principal</th>
                    <th>Collateral</th>
                    <th>Term</th>
                    <th>Best bid</th>
                    <th>Rate</th>
                    <th>Bids</th>
                    <th className="wide">Borrower</th>
                  </tr>
                </thead>
                <tbody>
                  {ids.map((id) => (
                    <RequestRow key={id.toString()} id={id} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
