"use client";

import Link from "next/link";
import Rise from "@/components/figures/Rise";
import Lifecycle from "@/components/how/Lifecycle";
import Underwriting from "@/components/how/Underwriting";
import Controls from "@/components/how/Controls";
import { link } from "@/lib/links";

/**
 * Three questions a sceptic asks, answered with a picture each.
 *
 * How does the loan work · why trust the lender · what if the issuer objects.
 * Everything else is a caption, and every caption ends somewhere checkable —
 * a Hedera service, a line of source, a transaction.
 */
export default function How() {
  return (
    <>
      <section className="band" style={{ paddingTop: 100, paddingBottom: 52, borderBottom: "none" }}>
        <div className="wrap">
          <h1 className="claim" style={{ textAlign: "center", maxWidth: "17ch", margin: "0 auto",
                                         fontSize: "clamp(30px,4.2vw,48px)" }}>
            Three pictures. That is the whole thing.
          </h1>
          <p className="lede" style={{ textAlign: "center", maxWidth: "48ch", margin: "20px auto 0" }}>
            Built on Hedera — a bond issued through Asset Tokenization Studio, reasoning written to a
            consensus topic, and loans the network closes by itself.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
            <a className="service" href={link.ats} target="_blank" rel="noreferrer">
              <span className="n">token</span> ATS · ERC-3643
            </a>
            <a className="service" href={link.hcsDocs} target="_blank" rel="noreferrer">
              <span className="n">record</span> Consensus Service
            </a>
            <a className="service" href={link.hip1215} target="_blank" rel="noreferrer">
              <span className="n">settle</span> Schedule Service · HIP-1215
            </a>
          </div>
        </div>
      </section>

      {/* ── one ── */}
      <section className="chapter">
        <div className="wrap">
          <Rise>
            <p className="num">One</p>
            <h2>The loan closes itself.</h2>
            <p className="sub">
              You lock the bond. Lenders bid. The cheapest one funds you — and in that same moment the
              ending is booked with Hedera.
            </p>

            <div className="plate">
              <Lifecycle />
              <p className="cap">
                <strong>Nobody has to come back.</strong> At the due date the network runs the closing call
                and pays its own fee for doing it.
              </p>
            </div>

            <div className="checks">
              <a href={link.hip1215} target="_blank" rel="noreferrer">
                <span className="k">The Hedera service</span>
                <span className="v">Schedule Service · HIP-1215</span>
              </a>
              <a href={link.award} target="_blank" rel="noreferrer">
                <span className="k">Where we book it</span>
                <span className="v">award() line 455</span>
              </a>
              <a href={link.scheduled} target="_blank" rel="noreferrer">
                <span className="k">It really happened</span>
                <span className="v">scheduled=true</span>
              </a>
            </div>
          </Rise>
        </div>
      </section>

      {/* ── two ── */}
      <section className="chapter">
        <div className="wrap">
          <Rise>
            <p className="num">Two</p>
            <h2>The lender writes down why, first.</h2>
            <p className="sub">
              There is no price to look up, so it reads the bond&rsquo;s paperwork — and publishes its
              thinking before it knows whether it won.
            </p>

            <div className="plate">
              <Underwriting />
              <p className="cap">
                It cannot rewrite that later, and it cannot spend more than its owner allowed.
              </p>
            </div>

            <div className="checks">
              <a href={link.hcsDocs} target="_blank" rel="noreferrer">
                <span className="k">The Hedera service</span>
                <span className="v">Consensus Service</span>
              </a>
              <a href={link.topic} target="_blank" rel="noreferrer">
                <span className="k">Read what it wrote</span>
                <span className="v">Topic 0.0.10367534</span>
              </a>
              <a href={link.verify} target="_blank" rel="noreferrer">
                <span className="k">Check the hash</span>
                <span className="v">verify-reasoning.sh</span>
              </a>
            </div>
          </Rise>
        </div>
      </section>

      {/* ── three ── */}
      <section className="chapter">
        <div className="wrap">
          <Rise>
            <p className="num">Three</p>
            <h2>The issuer can pause it. Nothing is lost.</h2>
            <p className="sub">
              A real bond has rules. Four switches can stop a settlement dead — and none of them touch your
              collateral.
            </p>

            <div className="plate">
              <Controls />
            </div>

            <div className="checks">
              <a href={link.erc3643} target="_blank" rel="noreferrer">
                <span className="k">The standard</span>
                <span className="v">ERC-3643 permissioned token</span>
              </a>
              <a href={link.lens} target="_blank" rel="noreferrer">
                <span className="k">Which rule blocked it</span>
                <span className="v">ComplianceLens line 74</span>
              </a>
              <a href={link.bond} target="_blank" rel="noreferrer">
                <span className="k">The bond</span>
                <span className="v">RDN27 on HashScan</span>
              </a>
            </div>
          </Rise>
        </div>
      </section>

      {/* what is not in it */}
      <section className="band" style={{ borderBottom: "none", paddingTop: 76, paddingBottom: 96 }}>
        <div className="wrap">
          <Rise>
            <h2 className="claim" style={{ fontSize: "clamp(24px,3.2vw,36px)", textAlign: "center",
                                           maxWidth: "20ch", margin: "0 auto" }}>
              Five things it does not have.
            </h2>

            <div className="checks" style={{ marginTop: 30, gridTemplateColumns: "repeat(auto-fit,minmax(168px,1fr))" }}>
              {[
                ["No price feed", "no oracle to be wrong"],
                ["No liquidator", "nothing seized early"],
                ["No margin call", "terms never change"],
                ["No governance", "no vote over your loan"],
                ["No custody", "we hold no cash"],
              ].map(([k, v]) => (
                <a key={k} href={link.market} target="_blank" rel="noreferrer">
                  <span className="k">{k}</span>
                  <span className="v">{v}</span>
                </a>
              ))}
            </div>

            <div style={{ marginTop: 40, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link className="btn" href="/borrow">Borrow</Link>
              <Link className="btn ghost" href="/market">See the market</Link>
            </div>
          </Rise>
        </div>
      </section>
    </>
  );
}
