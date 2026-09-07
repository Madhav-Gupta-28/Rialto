"use client";

import Link from "next/link";
import Rise from "@/components/figures/Rise";
import Loan from "@/components/figures/Loan";
import Blind from "@/components/figures/Blind";
import Sequence from "@/components/figures/Sequence";

/**
 * The homepage says one thing: you can borrow against a bond nobody will price,
 * and here is proof it works. Everything mechanical lives on /how, and the
 * loan table lives on /market — this page is the argument, not the instrument.
 */
export default function Home() {
  return (
    <>
      {/* the offer */}
      <section className="band void" style={{ paddingTop: 132, paddingBottom: 96 }}>
        <div className="wrap">
          <h1 className="claim" style={{ maxWidth: "20ch" }}>
            Cash today.
            <br />
            <span className="dim">The bond stays yours.</span>
          </h1>
          <p className="lede" style={{ maxWidth: "46ch", marginTop: 26, fontSize: 19 }}>
            Borrow against a bond that nobody will price. Lenders bid to fund you, you get the bond back
            when you repay, and you keep every coupon it pays in between.
          </p>

          <div style={{ marginTop: 38, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/borrow">Borrow</Link>
            <Link className="btn ghost" href="/mandate">Lend</Link>
          </div>

          <div className="hero-figure" style={{ marginTop: 64 }}>
            <Loan />
          </div>
        </div>
      </section>

      {/* the problem */}
      <section className="band paper">
        <div className="wrap">
          <Rise>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)", maxWidth: "16ch" }}>
              Nobody lends against what they cannot price.
            </h2>
            <p className="lede" style={{ maxWidth: "48ch" }}>
              So the owner of a perfectly good bond sells it instead — at whatever a buyer offers, on the
              day they happen to need the money.
            </p>
            <div style={{ marginTop: 40 }}>
              <Blind />
            </div>
          </Rise>
        </div>
      </section>

      {/* the answer */}
      <section className="band void">
        <div className="wrap">
          <Rise>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)", maxWidth: "17ch" }}>
              So Rialto never asks what it is worth.
            </h2>
            <p className="lede" style={{ maxWidth: "50ch" }}>
              Lenders read the bond&rsquo;s own offering document and bid a number they are willing to be
              held to. That number is fixed the moment the loan is made and never moves again — so there is
              nothing to check, nothing to recalculate, and nothing that can be liquidated out from under
              you.
            </p>
            <p className="lede" style={{ maxWidth: "50ch", marginTop: 22 }}>
              A bond desk has settled loans this way for a century. Rialto is that, with the reading done by
              software and the settlement done by Hedera.
            </p>
            <div style={{ marginTop: 32 }}>
              <Link className="btn ghost" href="/how">See how it works</Link>
            </div>
          </Rise>
        </div>
      </section>

      {/* the proof */}
      <section className="band paper">
        <div className="wrap">
          <Rise>
            <p className="eyebrow">Proof</p>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)", maxWidth: "18ch" }}>
              Three things that already happened, on Hedera.
            </h2>

            <div className="figure" style={{ marginTop: 34 }}>
              <p style={{ fontSize: 17, color: "var(--ink)", margin: "0 0 6px" }}>
                The lender explained itself before it knew if it had won.
              </p>
              <p className="sub" style={{ margin: "0 0 18px", maxWidth: "52ch" }}>
                Its reasoning was written to a public ledger 61 seconds before the loan was awarded, and the
                bid carries that message&rsquo;s hash. It cannot have been written afterwards to fit.
              </p>
              <p className="readout" style={{ margin: 0 }}>
                <span className="k">reasoning</span> <span className="v">20:36:21</span>{" "}
                <span className="k">·</span> <span className="k">awarded</span>{" "}
                <span className="v">20:37:22</span>
              </p>
            </div>

            <div className="figure">
              <p style={{ fontSize: 17, color: "var(--ink)", margin: "0 0 6px" }}>
                A loan settled itself with nobody watching.
              </p>
              <p className="sub" style={{ margin: "0 0 18px", maxWidth: "52ch" }}>
                No keeper, no bot, no cron job. The market asked Hedera to close the loan at maturity, and
                Hedera did — paying its own fee to do it.
              </p>
              <Sequence
                gap={480}
                rows={[
                  <p className="readout" style={{ margin: 0 }} key="a">
                    <span className="k">scheduled</span> <span className="v">true</span>{" "}
                    <span className="k">— the network ran it, not a caller</span>
                  </p>,
                  <p className="readout" style={{ margin: 0 }} key="b">
                    <span className="k">payer</span> <span className="v">0.0.10382007</span>{" "}
                    <span className="k">— the contract itself</span>
                  </p>,
                  <p className="readout" style={{ margin: "8px 0 0" }} key="c">
                    <span className="k">result</span> <span className="state settled">success</span>
                  </p>,
                ]}
              />
            </div>

            <div className="figure">
              <p style={{ fontSize: 17, color: "var(--ink)", margin: "0 0 6px" }}>
                The issuer froze the lender, and the network could not settle.
              </p>
              <p className="sub" style={{ margin: "0 0 18px", maxWidth: "52ch" }}>
                These are regulated securities and an issuer can stop a transfer at any time. When they did,
                the loan simply held — the collateral stayed put and completed once the block was lifted.
              </p>
              <Sequence
                rows={[
                  <p className="readout" style={{ margin: 0 }} key="a">
                    <span className="k">20:33:25</span> <span className="v">settle</span>{" "}
                    <span className="state settled">success</span>
                  </p>,
                  <p className="readout" style={{ margin: 0 }} key="b">
                    <span className="k">20:54:13</span> <span className="v">settle</span>{" "}
                    <span className="state settled">success</span>
                  </p>,
                  <p className="readout" style={{ margin: 0 }} key="c">
                    <span className="k">20:54:22</span> <span className="v">settle</span>{" "}
                    <span className="state settled">success</span>
                  </p>,
                  <p className="readout" style={{ margin: "8px 0 0" }} key="d">
                    <span className="k">21:11:12</span> <span className="v">settle</span>{" "}
                    <span className="state blocked">blocked</span>{" "}
                    <span className="k">— the lender was frozen</span>
                  </p>,
                ]}
              />
            </div>
          </Rise>
        </div>
      </section>

      {/* the close */}
      <section className="band void" style={{ borderBottom: "none", paddingBottom: 120 }}>
        <div className="wrap">
          <Rise>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)", maxWidth: "15ch" }}>
              Keep the bond. Take the cash.
            </h2>
            <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link className="btn" href="/borrow">Borrow</Link>
              <Link className="btn ghost" href="/market">See the market</Link>
            </div>
          </Rise>
        </div>
      </section>
    </>
  );
}
