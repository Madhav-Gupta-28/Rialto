"use client";

import { useSeen } from "@/lib/reveal";

/**
 * Two people ask the same lender for a loan, and only one gets it.
 *
 * The old figure showed price history and expected the reader to infer the
 * consequence. This shows the consequence directly: same lender, same request,
 * and the only difference is whether anyone knows what the thing is worth.
 */
export default function Ask() {
  const [ref, on] = useSeen<HTMLDivElement>();

  const row = (y: number, asset: string, answer: string, ok: boolean, delay: number) => (
    <g>
      {/* what is being offered */}
      <rect x={8} y={y - 21} width={168} height={42} rx={3} fill="none" stroke="var(--ink)" strokeWidth={1.2} />
      <text x={92} y={y + 5} textAnchor="middle" fontFamily="var(--sans)" fontSize="14" fill="var(--ink)">
        {asset}
      </text>

      {/* the ask */}
      <g style={{ opacity: on ? 1 : 0, transition: `opacity .5s ease ${delay}ms` }}>
        <line x1={186} y1={y} x2={292} y2={y} stroke="var(--ink)" strokeWidth={1} strokeDasharray="4 4" />
        <text x={239} y={y - 10} textAnchor="middle" fontFamily="var(--mono)" fontSize="10"
              letterSpacing=".1em" fill="var(--muted)">
          LEND ME CASH
        </text>
      </g>

      {/* the answer */}
      <g style={{ opacity: on ? 1 : 0, transition: `opacity .5s ease ${delay + 420}ms` }}>
        <rect
          x={302} y={y - 21} width={330} height={42} rx={3}
          fill={ok ? "none" : "var(--ink)"}
          stroke="var(--ink)" strokeWidth={1.2}
          strokeDasharray={ok ? undefined : "0"}
        />
        <text
          x={467} y={y + 5} textAnchor="middle" fontFamily="var(--sans)" fontSize="14"
          fill={ok ? "var(--ink)" : "var(--paper)"}
        >
          {answer}
        </text>
      </g>
    </g>
  );

  return (
    <div ref={ref}>
      <svg viewBox="0 0 640 190" width="100%" role="img"
           aria-label="A lender funds a share. The same lender refuses a bond, because nobody can say what it is worth.">
        <text x={8} y={22} fontFamily="var(--mono)" fontSize="10" letterSpacing=".12em" fill="var(--muted)">
          YOU HOLD
        </text>
        <text x={302} y={22} fontFamily="var(--mono)" fontSize="10" letterSpacing=".12em" fill="var(--muted)">
          THE LENDER SAYS
        </text>
        {row(70, "a share", "Fine. It is worth £12 right now.", true, 200)}
        {row(148, "a bond", "No. I have no idea what it is worth.", false, 900)}
      </svg>
    </div>
  );
}
