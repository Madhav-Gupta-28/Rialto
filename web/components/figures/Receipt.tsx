"use client";

import { useEffect, useRef, useState } from "react";

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
 * The last line is deliberately not a subtraction. Rounded to two places the
 * arithmetic lands on 0.00 rather than the true 0.007828, so a reader checking
 * it would watch it fail. What that line is actually for is the thing nobody
 * expects anyway: the bond never stopped being theirs.
 */

const LINES = [
  { k: "you locked", v: "2,100", u: "RDN27", n: "your bond, into escrow" },
  { k: "you borrowed", v: "2,000", u: "dUSD", n: "from whoever bid lowest" },
  { k: "you repaid", v: "2,028.77", u: "dUSD", n: "on the day it was due" },
  { k: "the bond paid you", v: "28.77", u: "dUSD", n: "income while it was locked" },
];

export default function Receipt() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(5);
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
          if (i >= 5) clearInterval(id);
        }, 460);
      },
      { rootMargin: "-40px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="receipt">
      <div className="head">
        <span>One loan, start to finish</span>
        <span className="id">request #12 · settled</span>
      </div>

      {LINES.map((l, i) => (
        <div
          key={l.k}
          className="line"
          style={{ opacity: n > i ? 1 : 0, transform: n > i ? "none" : "translateY(5px)" }}
        >
          <span className="k">{l.k}</span>
          <span className="v">
            {l.v} <i>{l.u}</i>
          </span>
          <span className="n">{l.n}</span>
        </div>
      ))}

      <div className="total" style={{ opacity: n > 4 ? 1 : 0 }}>
        <span className="k">and</span>
        <span className="v">you kept the bond</span>
        <span className="n">the loan cost you under a cent</span>
      </div>
    </div>
  );
}
