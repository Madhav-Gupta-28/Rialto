"use client";

import { useSteps } from "@/lib/reveal";

/**
 * The product, in one frame that holds still.
 *
 * The figure this replaces was three empty rectangles and two small pills in a
 * full viewport — nearly blank as a screenshot, and a screenshot is what ends up
 * in a judging deck. This is the loan itself, written the way a receipt is:
 * four lines that assemble, and a fifth that is the whole point.
 *
 * Every figure is real — request #12 on the live market — and shown to two
 * places, because six decimal places on a round number is noise rather than
 * precision. The exact figures are on the request page for anyone who wants
 * them.
 *
 * Two columns, not three. A note beside every figure explained what the label
 * already said, and four sentences competing with four numbers is what made it
 * read slowly — the point of a receipt is that you take it in at a glance.
 *
 * The last line is deliberately not a subtraction. Rounded to two places the
 * arithmetic lands on 0.00 rather than the true 0.007828, so a reader checking
 * it would watch it fail. What that line is for is the thing nobody expects
 * anyway: the bond never stopped being theirs.
 */

const LINES = [
  { k: "you locked", v: "2,100", u: "RDN27" },
  { k: "you borrowed", v: "2,000", u: "dUSD" },
  { k: "you repaid", v: "2,028.77", u: "dUSD" },
  { k: "the bond paid you", v: "28.77", u: "dUSD" },
];

export default function Receipt() {
  // Four lines, then the closing one.
  const [ref, n] = useSteps<HTMLDivElement>(5, 460, "-40px");

  return (
    <div ref={ref} className="receipt">
      <div className="head">
        <span>One loan, start to finish</span>
        <span className="id">#12 · settled</span>
      </div>

      {LINES.map((l, i) => (
        <div
          key={l.k}
          className="line"
          style={{ opacity: n > i ? 1 : 0, transform: n > i ? "none" : "translateY(4px)" }}
        >
          <span className="k">{l.k}</span>
          <span className="v">
            {l.v} <i>{l.u}</i>
          </span>
        </div>
      ))}

      <div className="total" style={{ opacity: n > 4 ? 1 : 0 }}>
        <span className="k">you kept the bond</span>
        <span className="v">cost: under a cent</span>
      </div>
    </div>
  );
}
