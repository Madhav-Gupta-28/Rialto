"use client";

import { useEffect, useState } from "react";

/**
 * The whole product, running in the hero.
 *
 * Collateral goes into escrow, cash goes the other way, the term runs, and then
 * one of two things happens. It loops through the repay ending, then the
 * default ending, because "two endings and nothing in between" is the claim the
 * rest of the page spends nine screens defending.
 *
 * Positions are driven by phase and animated by CSS transition rather than by a
 * timeline library — every frame is a legible diagram, and it costs nothing.
 */

const B = 116;   // borrower
const M = 430;   // the market
const L = 744;   // underwriter
const Y = 128;

type Phase = {
  cash: number;
  collateral: number;
  /** 0–1 along the term. */
  term: number;
  says: string;
  tone?: "settled" | "pending";
};

const PHASES: Phase[] = [
  { cash: L, collateral: B, term: 0, says: "A borrower holds a bond. An underwriter holds cash." },
  { cash: L, collateral: M, term: 0, says: "The collateral is escrowed and the auction opens." },
  { cash: B, collateral: M, term: 0, says: "Lowest bid wins. The cash moves lender to borrower — it never rests in the contract." },
  { cash: B, collateral: M, term: 1, says: "The term runs. No margin call, no oracle, nothing to watch." },
  { cash: L, collateral: B, term: 1, says: "Repaid before the date. The collateral goes home.", tone: "settled" },

  { cash: L, collateral: B, term: 0, says: "A borrower holds a bond. An underwriter holds cash." },
  { cash: L, collateral: M, term: 0, says: "The collateral is escrowed and the auction opens." },
  { cash: B, collateral: M, term: 0, says: "Lowest bid wins. The cash moves lender to borrower." },
  { cash: B, collateral: M, term: 1, says: "The term runs out, and nobody repays." },
  { cash: B, collateral: L, term: 1, says: "Hedera settles it unattended. The collateral goes to the lender.", tone: "pending" },
];

export default function Exchange() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setI(4); // the repaid ending, held
      return;
    }
    const id = setInterval(() => setI((n) => (n + 1) % PHASES.length), 2100);
    return () => clearInterval(id);
  }, []);

  const p = PHASES[i]!;
  const toneColour =
    p.tone === "settled" ? "var(--settled)" : p.tone === "pending" ? "var(--pending)" : "var(--ink-2)";

  const pillar = (x: number, label: string, sub: string) => (
    <g>
      <line x1={x} y1={Y - 46} x2={x} y2={Y + 46} stroke="var(--line)" strokeWidth={1} />
      <text x={x} y={Y + 72} textAnchor="middle" fontFamily="var(--mono)" fontSize="10.5"
            letterSpacing="1.6" fill="var(--ink-2)">{label}</text>
      <text x={x} y={Y + 89} textAnchor="middle" fontFamily="var(--mono)" fontSize="9"
            letterSpacing=".6" fill="var(--muted)">{sub}</text>
    </g>
  );

  return (
    <div>
      <svg viewBox="0 0 860 240" width="100%" role="img" aria-label={p.says}>
        {/* the rail everything moves along */}
        <line x1={B} y1={Y} x2={L} y2={Y} stroke="var(--line)" strokeWidth={1} />

        {pillar(B, "BORROWER", "holds the bond")}
        {pillar(M, "THE MARKET", "holds only collateral")}
        {pillar(L, "UNDERWRITER", "holds the cash")}

        {/* the term, drawn under the rail once the loan is live */}
        <g opacity={p.term > 0 ? 1 : 0} style={{ transition: "opacity .45s ease" }}>
          <line x1={M} y1={Y + 30} x2={L - 40} y2={Y + 30} stroke="var(--line)" strokeWidth={2} />
          <line
            x1={M} y1={Y + 30} x2={M + (L - 40 - M) * p.term} y2={Y + 30}
            stroke={toneColour} strokeWidth={2}
            style={{ transition: "all 1.4s cubic-bezier(.3,.7,.4,1)" }}
          />
          <text x={(M + L - 40) / 2} y={Y + 48} textAnchor="middle" fontFamily="var(--mono)"
                fontSize="9" letterSpacing=".8" fill="var(--muted)">TERM</text>
        </g>

        {/* the collateral — a square, because it is the thing that is held */}
        <g style={{ transform: `translateX(${p.collateral}px)`, transition: "transform 1.15s cubic-bezier(.4,0,.2,1)" }}>
          <rect x={-15} y={Y - 44} width={30} height={30} rx={2}
                fill="none" stroke="var(--ink)" strokeWidth={1.4} />
          <text x={0} y={Y - 24} textAnchor="middle" fontFamily="var(--mono)" fontSize="9"
                fill="var(--ink)">2,100</text>
          <text x={0} y={Y - 52} textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5"
                letterSpacing="1" fill="var(--muted)">RDN27</text>
        </g>

        {/* the cash — a circle, because it moves and never settles anywhere for long */}
        <g style={{ transform: `translateX(${p.cash}px)`, transition: "transform 1.15s cubic-bezier(.4,0,.2,1)" }}>
          <circle cx={0} cy={Y + 6} r={15} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
          <text x={0} y={Y + 10} textAnchor="middle" fontFamily="var(--mono)" fontSize="9"
                fill="var(--ink)">2,000</text>
          <text x={0} y={Y + 34} textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5"
                letterSpacing="1" fill="var(--muted)">dUSD</text>
        </g>
      </svg>

      <p
        key={i}
        style={{
          fontSize: 14.5, color: toneColour, textAlign: "center", margin: "6px 0 0",
          minHeight: 42, transition: "color .4s ease", animation: "phase-in .45s ease",
        }}
      >
        {p.says}
      </p>
    </div>
  );
}
