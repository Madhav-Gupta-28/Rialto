"use client";

import { useEffect, useState } from "react";

/**
 * The one diagram. Everything else on the landing page supports it.
 *
 * Plain words only — no escrow, no collateral, no underwriter. Someone who has
 * never heard of a repo should watch this once and know what the product does.
 * Four steps, then the other ending, then it loops.
 */

const YOU = 150;
const MID = 450;
const LENDER = 750;

type Step = { bond: number; cash: number | null; says: string; tone?: "settled" | "pending" };

const STEPS: Step[] = [
  { bond: YOU, cash: LENDER, says: "You own a bond. Someone else has cash." },
  { bond: MID, cash: LENDER, says: "You lock the bond and say how long for." },
  { bond: MID, cash: YOU, says: "Lenders compete. The cheapest one funds you." },
  { bond: YOU, cash: LENDER, says: "You repay. The bond comes back.", tone: "settled" },
  { bond: LENDER, cash: YOU, says: "Or you don't — and the lender keeps the bond.", tone: "pending" },
];

export default function Loan() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setI(3);
      return;
    }
    const id = setInterval(() => setI((n) => (n + 1) % STEPS.length), 2400);
    return () => clearInterval(id);
  }, []);

  const s = STEPS[i]!;
  const tone = s.tone === "settled" ? "var(--settled)" : s.tone === "pending" ? "var(--pending)" : "var(--ink)";

  const post = (x: number, label: string) => (
    <g>
      <rect x={x - 84} y={92} width={168} height={62} rx={3} fill="none" stroke="var(--line)" strokeWidth={1} />
      <text x={x} y={129} textAnchor="middle" fontFamily="var(--sans)" fontSize="15" fill="var(--ink-2)">
        {label}
      </text>
    </g>
  );

  return (
    <div>
      <svg viewBox="0 0 900 250" width="100%" role="img" aria-label={s.says}>
        {post(YOU, "You")}
        {post(MID, "Rialto")}
        {post(LENDER, "A lender")}

        {/* your bond */}
        <g style={{ transform: `translateX(${s.bond}px)`, transition: "transform 1.25s cubic-bezier(.4,0,.2,1)" }}>
          <rect x={-52} y={34} width={104} height={34} rx={3} fill="var(--ground)" stroke="var(--ink)" strokeWidth={1.4} />
          <text x={0} y={56} textAnchor="middle" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">
            your bond
          </text>
        </g>

        {/* the cash */}
        {s.cash !== null && (
          <g style={{ transform: `translateX(${s.cash}px)`, transition: "transform 1.25s cubic-bezier(.4,0,.2,1)" }}>
            <rect x={-52} y={178} width={104} height={34} rx={17} fill="var(--ground)" stroke="var(--ink)" strokeWidth={1.4} />
            <text x={0} y={200} textAnchor="middle" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">
              cash
            </text>
          </g>
        )}
      </svg>

      <p
        key={i}
        style={{
          fontSize: 17, color: tone, textAlign: "center", margin: "18px 0 0",
          minHeight: 26, transition: "color .4s ease", animation: "phase-in .45s ease",
        }}
      >
        {s.says}
      </p>
    </div>
  );
}
