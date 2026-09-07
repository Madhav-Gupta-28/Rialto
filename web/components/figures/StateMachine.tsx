"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The whole contract, drawn once.
 *
 * A loan has two endings and nothing in between: repay before the date and the
 * collateral goes home, miss it and it goes to the lender. No margin call, no
 * partial liquidation, no auction — because there is nothing to price.
 *
 * The walk runs the repay branch, rewinds, then runs the default branch. Each
 * step lights a node or an edge rather than moving a token along a path, so any
 * frame of it is a legible diagram on its own.
 */

// node · edge · node · edge · node, then the same again down the other branch
const STEPS = 9;
const DWELL = 900;

export default function StateMachine() {
  const ref = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        if (reduced) {
          setStep(STEPS - 1); // the finished diagram, both branches lit
          return;
        }
        setStep(0);
        const id = setInterval(() => setStep((s) => (s + 1) % STEPS), DWELL);
        return () => clearInterval(id);
      },
      { rootMargin: "-80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Which things are lit at each step of the walk.
  const on = (what: string) => {
    if (step < 0) return false;
    const lit: Record<number, string[]> = {
      0: ["open"],
      1: ["open", "award"],
      2: ["open", "award", "funded"],
      3: ["funded", "repay"],
      4: ["funded", "repay", "repaid"],
      5: ["repaid"],
      6: ["funded"],
      7: ["funded", "claim"],
      8: ["funded", "claim", "defaulted"],
    };
    return (lit[step] ?? []).includes(what);
  };

  const node = (id: string, x: number, y: number, label: string, sub: string, tone: string) => {
    const active = on(id);
    const colour = !active ? "var(--ink-2)" : tone;
    return (
      <g style={{ transition: "opacity .35s ease" }} opacity={active || step < 0 ? 1 : 0.62}>
        <rect
          x={x - 74} y={y - 27} width={148} height={54} rx={3}
          fill={active ? "rgba(20,19,15,.04)" : "none"}
          stroke={colour} strokeWidth={active ? 1.5 : 1}
          style={{ transition: "stroke .35s ease" }}
        />
        <text x={x} y={y - 3} textAnchor="middle" fontFamily="var(--mono)" fontSize="13"
              letterSpacing="1.4" fill={colour} style={{ transition: "fill .35s ease" }}>
          {label}
        </text>
        <text x={x} y={y + 15} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5"
              letterSpacing=".8" fill="var(--muted)">
          {sub}
        </text>
      </g>
    );
  };

  const edge = (id: string, d: string, label: string, lx: number, ly: number) => {
    const active = on(id);
    return (
      <g opacity={active || step < 0 ? 1 : 0.5} style={{ transition: "opacity .35s ease" }}>
        <path d={d} fill="none" stroke={active ? "var(--ink)" : "var(--line)"} strokeWidth={active ? 1.6 : 1}
              markerEnd={`url(#${active ? "tip-on" : "tip-off"})`} style={{ transition: "stroke .35s ease" }} />
        <text x={lx} y={ly} textAnchor="middle" fontFamily="var(--mono)" fontSize="10" letterSpacing=".6"
              fill={active ? "var(--ink-2)" : "var(--muted)"} style={{ transition: "fill .35s ease" }}>
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg ref={ref} viewBox="0 0 780 300" width="100%" role="img"
         aria-label="Open becomes Funded at award, then either Repaid or Defaulted.">
      <defs>
        <marker id="tip-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--ink)" />
        </marker>
        <marker id="tip-off" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--line)" />
        </marker>
      </defs>

      {edge("award", "M 190 150 L 288 150", "award", 239, 138)}
      {edge("repay", "M 446 136 C 502 136, 516 82, 566 82", "repay · before the date", 508, 62)}
      {edge("claim", "M 446 164 C 502 164, 516 218, 566 218", "claim · after it", 508, 250)}

      {node("open", 116, 150, "OPEN", "collateral escrowed", "var(--ink)")}
      {node("funded", 372, 150, "FUNDED", "cash lender → borrower", "var(--ink)")}
      {node("repaid", 648, 84, "REPAID", "collateral home", "var(--settled)")}
      {node("defaulted", 648, 216, "DEFAULTED", "collateral to lender", "var(--pending)")}
    </svg>
  );
}
