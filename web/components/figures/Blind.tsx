"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Why nobody will lend against it today.
 *
 * A lender needs to know what the thing is worth. On the left, they can look
 * whenever they like. On the right, the last time anyone said a price was four
 * months ago — so the answer is no, and the asset gets sold instead.
 *
 * Two panels, nine words of label, and nothing else.
 */
export default function Blind() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          io.disconnect();
          setOn(true);
        }
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ticks = Array.from({ length: 34 }, (_, i) => i);

  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
      <div style={{ border: "1px solid var(--line)", padding: "30px 28px 26px" }}>
        <p className="eyebrow" style={{ marginBottom: 22 }}>A share, or a coin</p>
        <svg viewBox="0 0 320 60" width="100%" style={{ display: "block" }} aria-hidden="true">
          {ticks.map((t) => (
            <line
              key={t}
              x1={8 + t * 9} y1={30} x2={8 + t * 9} y2={30}
              stroke="var(--ink)" strokeWidth={2.4} strokeLinecap="round"
              style={{
                transition: `y1 .4s ease ${t * 22}ms, y2 .4s ease ${t * 22}ms`,
                ...(on ? { y1: 30 - ((t * 37) % 17) - 3, y2: 30 + ((t * 23) % 15) + 3 } : {}),
              } as React.CSSProperties}
            />
          ))}
        </svg>
        <p style={{ fontSize: 16, color: "var(--ink)", margin: "22px 0 0" }}>
          A lender can check the price whenever they want.
        </p>
      </div>

      <div style={{ border: "1px solid var(--line)", borderLeft: "none", padding: "30px 28px 26px" }}>
        <p className="eyebrow" style={{ marginBottom: 22 }}>Your bond</p>
        <svg viewBox="0 0 320 60" width="100%" style={{ display: "block" }} aria-hidden="true">
          <line x1={8} y1={30} x2={312} y2={30} stroke="var(--line)" strokeWidth={1} />
          {[8, 150, 300].map((x, k) => (
            <circle
              key={x} cx={x} cy={30} r={5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.6}
              style={{ opacity: on ? 1 : 0, transition: `opacity .4s ease ${k * 260}ms` }}
            />
          ))}
        </svg>
        <p style={{ fontSize: 16, color: "var(--ink)", margin: "22px 0 0" }}>
          It last traded four months ago. They are guessing.
        </p>
      </div>
    </div>
  );
}
