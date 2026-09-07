"use client";

import { useEffect, useRef, useState } from "react";

const AGREED = 2057.542074;
const DUE = 2028.774951;
const COUPON = AGREED - DUE;

/**
 * The number the network moved, moving.
 *
 * Request #12 was awarded owing 2,057.542074. At the coupon's record date
 * Hedera ran `recordCoupon` on a schedule the market booked at award, and the
 * borrower's obligation fell by exactly what the coupon paid the escrow. Nobody
 * pressed anything.
 *
 * The figure counts down rather than swapping, because the drop *is* the point
 * — a still frame taken mid-fall still tells the story, which is the test any
 * animation here has to pass.
 */
export default function CouponFall() {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(AGREED);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();

        if (reduced) {
          setValue(DUE);
          setDone(true);
          return;
        }

        const start = performance.now();
        const HOLD = 900;
        const RUN = 2200;
        let raf = 0;

        const tick = (now: number) => {
          const t = now - start - HOLD;
          if (t <= 0) {
            raf = requestAnimationFrame(tick);
            return;
          }
          const p = Math.min(t / RUN, 1);
          // Ease out: it falls fast and settles, the way a figure lands.
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(AGREED - COUPON * eased);
          if (p < 1) raf = requestAnimationFrame(tick);
          else setDone(true);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      },
      { rootMargin: "-80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Where the coupon went, before the figure moves. The security pays whoever
  // holds it on the record date, and while the loan is live that is the escrow
  // — which is the fact the whole manufactured payment exists to correct.
  const flow = (
    <svg viewBox="0 0 660 92" width="100%" style={{ maxWidth: 560, margin: "0 auto 30px", display: "block" }}
         role="img" aria-label="The security pays the escrow, because the escrow is the holder of record.">
      <line x1={104} y1={46} x2={556} y2={46} stroke="var(--paper-line)" strokeWidth={1} />
      <g style={{ transform: `translateX(${done ? 330 : 104}px)`, transition: "transform 1.6s cubic-bezier(.4,0,.2,1) .3s" }}>
        <circle cx={0} cy={46} r={13} fill="var(--paper)" stroke="var(--settled)" strokeWidth={1.5} />
        <text x={0} y={50} textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5" fill="var(--settled)">28.77</text>
      </g>
      {[[104, "THE BOND", "pays its coupon"], [330, "THE ESCROW", "holder of record"], [556, "THE BORROWER", "still owns it"]].map(
        ([x, a, b]) => (
          <g key={a as string}>
            <line x1={x as number} y1={20} x2={x as number} y2={72} stroke="var(--paper-line)" strokeWidth={1} />
            <text x={x as number} y={86} textAnchor="middle" fontFamily="var(--mono)" fontSize="9"
                  letterSpacing="1.2" fill="var(--paper-muted)">{a as string}</text>
            <text x={x as number} y={14} textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5"
                  fill="var(--paper-muted)">{b as string}</text>
          </g>
        ),
      )}
    </svg>
  );

  return (
    <div ref={ref} style={{ textAlign: "center" }}>
      {flow}
      <p className="eyebrow" style={{ marginBottom: 18 }}>Repayment due · request #12</p>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "clamp(38px, 8vw, 84px)",
          lineHeight: 1,
          letterSpacing: "-0.03em",
          color: done ? "var(--settled)" : "var(--paper-ink)",
          transition: "color .6s ease",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toFixed(6)}
      </div>
      <p
        style={{
          marginTop: 20,
          fontSize: 15,
          color: "var(--paper-muted)",
          opacity: done ? 1 : 0,
          transition: "opacity .7s ease",
        }}
      >
        Recorded by Hedera at the record date, on a schedule booked at award.
        <br />
        <strong style={{ color: "var(--paper-ink)" }}>Nobody was watching.</strong>
      </p>
    </div>
  );
}
