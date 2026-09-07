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

  return (
    <div ref={ref} style={{ textAlign: "center" }}>
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
