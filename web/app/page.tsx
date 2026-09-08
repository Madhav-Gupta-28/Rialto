"use client";

import Link from "next/link";
import Rise from "@/components/figures/Rise";
import Loan from "@/components/figures/Loan";
import Receipt from "@/components/figures/Receipt";
import Ask from "@/components/figures/Ask";
import Bids from "@/components/figures/Bids";
import Proofs from "@/components/figures/Proofs";

/**
 * Four beats: what you can do, why you cannot do it today, how we get around
 * it, and three things that have already happened. Every section leads with a
 * figure or a figure sits beside it — nobody reads a wall of text on a landing
 * page, so the text is only ever a caption on the picture.
 */
export default function Home() {
  return (
    <>
      {/* what it is */}
      <section className="band" style={{ paddingTop: 116, paddingBottom: 104, borderBottom: "none" }}>
        <div className="wrap">
          <div className="hero">
            <div>
              <h1 className="claim" style={{ maxWidth: "15ch" }}>
                Borrow against bonds nobody can price.
              </h1>
              <p className="lede" style={{ maxWidth: "40ch", marginTop: 24, fontSize: 18 }}>
                Lenders read the bond&rsquo;s own paperwork and bid to fund you. You get it back when you
                repay, and it keeps paying you the whole time.
              </p>
              <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link className="btn" href="/borrow">Borrow</Link>
                <Link className="btn ghost" href="/mandate">Lend</Link>
              </div>
            </div>
            <Receipt />
          </div>
        </div>
      </section>

      {/* the shape of it */}
      <section className="band" style={{ paddingTop: 0, paddingBottom: 104 }}>
        <div className="wrap">
          <div className="hero-figure" style={{ marginTop: 0 }}>
            <Loan />
          </div>
        </div>
      </section>

      {/* why you cannot today */}
      <section className="band">
        <div className="wrap">
          <Rise>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,44px)", maxWidth: "15ch" }}>
              Nobody lends against what they cannot price.
            </h2>
            <div className="figure" style={{ marginTop: 36 }}>
              <Ask />
            </div>
            <p className="lede" style={{ maxWidth: "46ch", marginTop: 32 }}>
              So the owner sells a perfectly good bond instead — at whatever a buyer offers, on the day they
              happen to need the money.
            </p>
          </Rise>
        </div>
      </section>

      {/* how we get around it */}
      <section className="band">
        <div className="wrap">
          <Rise>
            <div className="beside">
              <div>
                <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,44px)" }}>
                  So we never ask.
                </h2>
                <p className="lede" style={{ marginTop: 20 }}>
                  A price nobody can find is replaced by a number three lenders will stand behind.
                </p>
                <p className="lede" style={{ marginTop: 16 }}>
                  Fixed once. Never recalculated. Nothing to liquidate.
                </p>
                <div style={{ marginTop: 28 }}>
                  <Link className="btn ghost" href="/how">See how it works</Link>
                </div>
              </div>
              <div className="figure" style={{ margin: 0 }}>
                <Bids />
              </div>
            </div>
          </Rise>
        </div>
      </section>

      {/* what already happened */}
      <section className="band" style={{ borderBottom: "none", paddingBottom: 128 }}>
        <div className="wrap">
          <Rise>
            <p className="eyebrow">Already on Hedera</p>
            <h2 className="claim" style={{ fontSize: "clamp(28px,4vw,44px)", maxWidth: "16ch" }}>
              Three things that have happened.
            </h2>

            <Proofs />
          </Rise>
        </div>
      </section>
    </>
  );
}
