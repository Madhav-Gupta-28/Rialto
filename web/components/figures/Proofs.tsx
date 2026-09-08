"use client";

import { useSeen, useSteps } from "@/lib/reveal";

/**
 * The three strongest facts, given a shape each.
 *
 * They were three near-identical bordered cards of monospace text, which the
 * eye reads as a list and skips. Each is now a single gesture: a gap that
 * fills, a stamp that lands, and a run of settlements with one that does not.
 *
 * The third is the one that matters — four attempts where the last is refused
 * is a story with a turn in it, and printing four lines of equal weight threw
 * the turn away.
 */

/** The gap between explaining and knowing, drawn to scale. */
function Ordering() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className="proof">
      <h3>The lender explained itself before it knew if it had won.</h3>
      <div className="gap">
        <div className="ends">
          <span><b>20:36:21</b> reasoning published</span>
          <span><b>20:37:22</b> loan funded</span>
        </div>
        <div className="bar">
          <div className="fill" style={{ transform: `scaleX(${seen ? 1 : 0})` }} />
        </div>
        <p className="mid">61 seconds</p>
      </div>
      <p className="says">
        The bid carries the hash of that message. It cannot have been written afterwards to fit.
      </p>
    </div>
  );
}

/** The settlement nobody triggered, stamped. */
function Unattended() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className="proof">
      <h3>A loan settled itself with nobody watching.</h3>
      <div className={`stamp${seen ? " in" : ""}`}>
        <span className="k">scheduled</span>
        <span className="v">true</span>
        <span className="k">payer</span>
        <span className="v">the contract itself</span>
      </div>
      <p className="says">No keeper, no bot. Hedera closed the loan and paid its own fee to do it.</p>
    </div>
  );
}

/** Three that went through, and the one that did not. */
function Blocked() {
  const [ref, n] = useSteps<HTMLDivElement>(4, 480);

  const rows = [
    ["20:33:25", false],
    ["20:54:13", false],
    ["20:54:22", false],
    ["21:11:12", true],
  ] as const;

  return (
    <div ref={ref} className="proof">
      <h3>The issuer froze the lender, and the network could not settle.</h3>
      <div className="runs">
        {rows.map(([t, stopped], i) => (
          <div
            key={t}
            className={`run${stopped ? " stopped" : ""}`}
            style={{ opacity: n > i ? 1 : 0, transform: n > i ? "none" : "translateY(4px)" }}
          >
            <span className="t">{t}</span>
            <span className="w">{stopped ? "refused" : "settled"}</span>
          </div>
        ))}
      </div>
      <p className="says">
        The loan held. Nothing was lost, and it completed the moment the freeze lifted.
      </p>
    </div>
  );
}

export default function Proofs() {
  return (
    <div className="proofs">
      <Ordering />
      <Unattended />
      <Blocked />
    </div>
  );
}
