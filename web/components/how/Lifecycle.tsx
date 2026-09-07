"use client";

import { useEffect, useRef, useState } from "react";
import { link } from "@/lib/links";

/**
 * One loan, end to end, in a single picture.
 *
 * The two calls Hedera makes on its own are drawn on their own row beneath the
 * rail, because that is the part nobody expects: the market asks the network at
 * award to close the loan later, and the network does it, paying its own fee.
 *
 * Every label is a link to the function that does it.
 */

type Node = { x: number; label: string; who: string; href: string; net?: boolean };

const NODES: Node[] = [
  { x: 90, label: "open", who: "borrower", href: link.open },
  { x: 285, label: "bid", who: "lender", href: link.bid },
  { x: 480, label: "award", who: "anyone", href: link.award },
  { x: 700, label: "repay", who: "borrower", href: link.repay },
  { x: 700, label: "claim", who: "the network", href: link.claim, net: true },
];

export default function Lifecycle() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(6);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        let i = 0;
        const id = setInterval(() => {
          i += 1;
          setN(i);
          if (i >= 6) clearInterval(id);
        }, 620);
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shown = (i: number) => n > i;

  return (
    <div ref={ref}>
      <svg viewBox="0 0 800 300" width="100%" role="img"
           aria-label="A borrower opens a request, lenders bid, anyone awards it, and then either the borrower repays or the network claims the collateral on its own.">
        {/* the rail */}
        <line x1={90} y1={110} x2={700} y2={110} stroke="var(--line)" strokeWidth={1} />

        {/* what moves, above the rail */}
        <g opacity={shown(2) ? 1 : 0} style={{ transition: "opacity .5s ease" }}>
          <text x={187} y={58} textAnchor="middle" fontFamily="var(--mono)" fontSize="10.5"
                letterSpacing=".08em" fill="var(--muted)">
            COLLATERAL → ESCROW
          </text>
          <line x1={120} y1={68} x2={255} y2={68} stroke="var(--ink)" strokeWidth={1} />
        </g>
        <g opacity={shown(3) ? 1 : 0} style={{ transition: "opacity .5s ease" }}>
          <text x={590} y={58} textAnchor="middle" fontFamily="var(--mono)" fontSize="10.5"
                letterSpacing=".08em" fill="var(--muted)">
            CASH → BORROWER
          </text>
          <line x1={510} y1={68} x2={670} y2={68} stroke="var(--ink)" strokeWidth={1} />
        </g>

        {NODES.filter((d) => !d.net).map((d, i) => (
          <g key={d.label} opacity={shown(i) ? 1 : 0.18} style={{ transition: "opacity .5s ease" }}>
            <circle cx={d.x} cy={110} r={7} fill={shown(i) ? "var(--ink)" : "none"}
                    stroke="var(--ink)" strokeWidth={1.4} style={{ transition: "fill .4s ease" }} />
            <a href={d.href} target="_blank" rel="noreferrer">
              <text x={d.x} y={148} textAnchor="middle" fontFamily="var(--mono)" fontSize="15"
                    fill="var(--ink)" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
                {d.label}
              </text>
            </a>
            <text x={d.x} y={168} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5"
                  letterSpacing=".1em" fill="var(--muted)">
              {d.who.toUpperCase()}
            </text>
          </g>
        ))}

        {/* the branch: repay, or the network settles it */}
        <g opacity={shown(4) ? 1 : 0} style={{ transition: "opacity .5s ease" }}>
          <path d="M 480 110 C 580 110, 600 226, 700 226" fill="none" stroke="var(--ink)"
                strokeWidth={1} strokeDasharray="4 5" />
          <circle cx={700} cy={226} r={7} fill="var(--ink)" />
          <a href={link.claim} target="_blank" rel="noreferrer">
            <text x={700} y={264} textAnchor="middle" fontFamily="var(--mono)" fontSize="15"
                  fill="var(--ink)" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
              claim
            </text>
          </a>
          <text x={700} y={284} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5"
                letterSpacing=".1em" fill="var(--muted)">
            THE NETWORK
          </text>
        </g>

        {/* the scheduled call booked at award */}
        <g opacity={shown(5) ? 1 : 0} style={{ transition: "opacity .6s ease" }}>
          <rect x={318} y={200} width={252} height={52} rx={3} fill="var(--ink)" />
          <text x={444} y={222} textAnchor="middle" fontFamily="var(--mono)" fontSize="11"
                letterSpacing=".1em" fill="var(--paper)">
            BOOKED AT AWARD
          </text>
          <text x={444} y={240} textAnchor="middle" fontFamily="var(--mono)" fontSize="10"
                fill="rgba(244,242,237,.72)">
            HSS.scheduleCall(claim, dueAt + 60)
          </text>
          <line x1={480} y1={128} x2={480} y2={198} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 4" />
        </g>
      </svg>
    </div>
  );
}
