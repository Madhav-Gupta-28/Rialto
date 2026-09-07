"use client";

import { useEffect, useRef, useState } from "react";
import { link } from "@/lib/links";

/**
 * One loan, and the moment it stops needing anyone.
 *
 * Four steps on a rail. Funding the loan books a call on the Hedera Schedule
 * Service, and that booking is drawn as the black plate — because a loan that
 * closes itself is the part a reader will not believe until they see where it
 * comes from.
 *
 * Kept short enough to fit on one screen. Every label links to the function.
 */

const RAIL = [
  { x: 96, label: "open", who: "you", href: link.open },
  { x: 300, label: "bid", who: "lenders", href: link.bid },
  { x: 504, label: "fund", who: "anyone", href: link.award },
  { x: 708, label: "repay", who: "you", href: link.repay },
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
        }, 560);
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const on = (i: number) => n > i;

  return (
    <div ref={ref}>
      <svg viewBox="0 0 800 218" width="100%" role="img"
           aria-label="You open a request, lenders bid, anyone funds it, and then either you repay or Hedera closes the loan on its own.">
        <line x1={96} y1={72} x2={708} y2={72} stroke="var(--line)" strokeWidth={1} />

        {/* what actually moves */}
        <g opacity={on(1) ? 1 : 0} style={{ transition: "opacity .45s ease" }}>
          <text x={198} y={38} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5"
                letterSpacing=".1em" fill="var(--muted)">BOND IN</text>
        </g>
        <g opacity={on(3) ? 1 : 0} style={{ transition: "opacity .45s ease" }}>
          <text x={606} y={38} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5"
                letterSpacing=".1em" fill="var(--muted)">CASH OUT</text>
        </g>

        {RAIL.map((d, i) => (
          <g key={d.label} opacity={on(i) ? 1 : 0.16} style={{ transition: "opacity .45s ease" }}>
            <circle cx={d.x} cy={72} r={6} fill={on(i) ? "var(--ink)" : "none"}
                    stroke="var(--ink)" strokeWidth={1.3} style={{ transition: "fill .4s ease" }} />
            <a href={d.href} target="_blank" rel="noreferrer">
              <text x={d.x} y={104} textAnchor="middle" fontFamily="var(--mono)" fontSize="14"
                    fill="var(--ink)" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
                {d.label}
              </text>
            </a>
            <text x={d.x} y={121} textAnchor="middle" fontFamily="var(--mono)" fontSize="9"
                  letterSpacing=".1em" fill="var(--muted)">{d.who.toUpperCase()}</text>
          </g>
        ))}

        {/* the other ending, which nobody has to trigger */}
        <g opacity={on(4) ? 1 : 0} style={{ transition: "opacity .45s ease" }}>
          <path d="M 504 72 C 590 72, 620 168, 708 168" fill="none" stroke="var(--ink)"
                strokeWidth={1} strokeDasharray="4 5" />
          <circle cx={708} cy={168} r={6} fill="var(--ink)" />
          <a href={link.claim} target="_blank" rel="noreferrer">
            <text x={708} y={198} textAnchor="middle" fontFamily="var(--mono)" fontSize="14"
                  fill="var(--ink)" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
              close
            </text>
          </a>
          <text x={708} y={214} textAnchor="middle" fontFamily="var(--mono)" fontSize="9"
                letterSpacing=".1em" fill="var(--muted)">HEDERA</text>
        </g>

        {/* where that comes from */}
        <g opacity={on(5) ? 1 : 0} style={{ transition: "opacity .55s ease" }}>
          <line x1={504} y1={86} x2={504} y2={146} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 4" />
          <rect x={352} y={146} width={304} height={46} rx={3} fill="var(--ink)" />
          <text x={504} y={166} textAnchor="middle" fontFamily="var(--mono)" fontSize="10"
                letterSpacing=".1em" fill="rgba(244,242,237,.62)">HEDERA SCHEDULE SERVICE · HIP-1215</text>
          <text x={504} y={182} textAnchor="middle" fontFamily="var(--mono)" fontSize="11"
                fill="var(--paper)">scheduleCall(close, dueAt + 60)</text>
        </g>
      </svg>
    </div>
  );
}
