"use client";

import Link from "next/link";
import Rise from "@/components/figures/Rise";
import Lifecycle from "@/components/how/Lifecycle";
import Underwriting from "@/components/how/Underwriting";
import Controls from "@/components/how/Controls";
import { link } from "@/lib/links";

/**
 * Three diagrams, and everything else is a caption.
 *
 * A reader who looks at nothing but the pictures should leave knowing what the
 * loan is, who decides, and what an issuer can do to it. Every label is a link
 * to the function that does the thing, so a sceptic can go from a claim to the
 * line of code in one click.
 */
export default function How() {
  return (
    <>
      <section className="band" style={{ paddingTop: 120, paddingBottom: 76, borderBottom: "none" }}>
        <div className="wrap">
          <h1 className="claim" style={{ textAlign: "center", maxWidth: "20ch", margin: "0 auto" }}>
            A loan against a bond, in three pictures.
          </h1>
          <p className="lede" style={{ textAlign: "center", maxWidth: "50ch", margin: "24px auto 0" }}>
            Nothing here is new finance. What is new is that every part of it — including the judgement —
            happens where anyone can check it.
          </p>
        </div>
      </section>

      {/* ── one ── */}
      <section className="chapter">
        <div className="wrap">
          <Rise>
            <p className="num">One</p>
            <h2>Six calls. Two of them are not yours.</h2>
            <p className="sub">
              A borrower locks the bond and names a term. Lenders bid. Whoever awards it sets the clock
              running — and hands the ending to Hedera.
            </p>

            <div className="plate">
              <Lifecycle />
              <p className="cap">
                <strong>Nobody has to come back.</strong> At award the market asks the network to close the
                loan at maturity, and the network does it — paying its own fee, whether or not anyone is
                watching.
              </p>
            </div>

            <div className="checks">
              <a href={link.award} target="_blank" rel="noreferrer">
                <span className="k">The call that books it</span>
                <span className="v">award() → scheduleCall</span>
              </a>
              <a href={link.claim} target="_blank" rel="noreferrer">
                <span className="k">Why it is safe to hand over</span>
                <span className="v">claim() pays storage, not the caller</span>
              </a>
              <a href={link.scheduled} target="_blank" rel="noreferrer">
                <span className="k">It actually happened</span>
                <span className="v">scheduled=true, payer 0.0.10382007</span>
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
            <h2>It shows its working before it knows if it won.</h2>
            <p className="sub">
              There is no price to read, so a lender reads the bond&rsquo;s own paperwork instead. Then it
              writes down why — in public, in order, before the outcome exists.
            </p>

            <div className="plate">
              <Underwriting />
              <p className="cap">
                A model can be wrong. It cannot be wrong <strong>and then pretend it was not</strong>, and
                it cannot spend more than its owner allowed.
              </p>
            </div>

            <div className="checks">
              <a href={link.topic} target="_blank" rel="noreferrer">
                <span className="k">The reasoning, in public</span>
                <span className="v">HCS topic 0.0.10367534</span>
              </a>
              <a href={link.verify} target="_blank" rel="noreferrer">
                <span className="k">Check a hash yourself</span>
                <span className="v">verify-reasoning.sh</span>
              </a>
              <a href={link.mandate} target="_blank" rel="noreferrer">
                <span className="k">The limits it cannot exceed</span>
                <span className="v">Mandates.sol</span>
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
            <h2>An issuer can stop it. Nobody can destroy it.</h2>
            <p className="sub">
              These are regulated securities. Four controls can halt a settlement at any moment — and all
              four do the same thing to the loan, which is nothing.
            </p>

            <div className="plate">
              <Controls />
            </div>

            <div className="checks">
              <a href={link.lens} target="_blank" rel="noreferrer">
                <span className="k">Which permission is missing</span>
                <span className="v">ComplianceLens.check()</span>
              </a>
              <a href={link.bond} target="_blank" rel="noreferrer">
                <span className="k">The security itself</span>
                <span className="v">RDN27, via ATS</span>
              </a>
              <a href={link.market} target="_blank" rel="noreferrer">
                <span className="k">The market</span>
                <span className="v">0x9040986D…3121a4</span>
              </a>
            </div>
          </Rise>
        </div>
      </section>

      {/* what is not in it */}
      <section className="band" style={{ borderBottom: "none", paddingTop: 104, paddingBottom: 124 }}>
        <div className="wrap">
          <Rise>
            <h2 className="claim" style={{ fontSize: "clamp(26px,3.6vw,40px)", textAlign: "center", maxWidth: "22ch", margin: "0 auto" }}>
              And five things it does not contain.
            </h2>
            <p className="sub" style={{ textAlign: "center", maxWidth: "48ch", margin: "18px auto 0" }}>
              Easier to verify than anything it does — search the contract and none of these appear.
            </p>

            <div className="checks" style={{ marginTop: 44 }}>
              {[
                ["No price feed", "not one oracle read"],
                ["No liquidator", "nothing can be seized early"],
                ["No margin call", "the terms cannot change mid-loan"],
                ["No governance token", "no vote can rewrite a deal"],
                ["No custody", "the contract's cash balance is zero"],
              ].map(([k, v]) => (
                <a key={k} href={link.market} target="_blank" rel="noreferrer">
                  <span className="k">{k}</span>
                  <span className="v">{v}</span>
                </a>
              ))}
            </div>

            <div style={{ marginTop: 48, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link className="btn" href="/borrow">Borrow</Link>
              <Link className="btn ghost" href="/market">See the market</Link>
            </div>
          </Rise>
        </div>
      </section>
    </>
  );
}
