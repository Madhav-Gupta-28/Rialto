"use client";

import { useSteps } from "@/lib/reveal";

/**
 * How a price gets set without anyone reading one.
 *
 * Three lenders read the same document and each names a figure they will be
 * held to. The lowest wins, and that figure never moves again — which is the
 * whole reason nothing here needs an oracle, a margin call, or a liquidator.
 */

const BIDS = [
  { who: "Lender A", amount: "2,061" },
  { who: "Lender B", amount: "2,057" },
  { who: "Lender C", amount: "2,084" },
];
const WINNER = 1;

export default function Bids() {
  // Bids land, the lowest is marked, the rest stand down.
  const [ref, step] = useSteps<HTMLDivElement>(3, 700);

  return (
    <div ref={ref}>
      <p className="eyebrow" style={{ marginBottom: 16 }}>They read the document, then bid</p>

      <div style={{ display: "grid", gap: 8 }}>
        {BIDS.map((b, i) => {
          const shown = step >= 1;
          const won = step >= 2 && i === WINNER;
          const lost = step >= 2 && i !== WINNER;
          return (
            <div
              key={b.who}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px", borderRadius: 3,
                border: `1px solid var(--ink)`,
                background: won ? "var(--ink)" : "transparent",
                color: won ? "var(--paper)" : "var(--ink)",
                opacity: shown ? (lost ? 0.32 : 1) : 0,
                transform: shown ? "none" : "translateY(6px)",
                transition: "opacity .45s ease, background .5s ease, color .5s ease, transform .45s ease",
                transitionDelay: `${i * 110}ms`,
              }}
            >
              <span style={{ fontSize: 14 }}>{b.who}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{b.amount}</span>
            </div>
          );
        })}
      </div>

      <p
        style={{
          marginTop: 20, fontSize: 15, color: "var(--ink)",
          opacity: step >= 3 ? 1 : 0, transition: "opacity .6s ease",
        }}
      >
        <strong>2,057 is what you repay.</strong> It was agreed once and cannot change — not by a
        market, not by us, not by them.
      </p>
    </div>
  );
}
