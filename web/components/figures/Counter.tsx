"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that arrives rather than appears.
 *
 * Only worth doing where the number is the point — the three in the hero are
 * the entire claim compressed, so they earn it. Everything else on the page
 * shows its figure immediately.
 */
export default function Counter({ to, hold = 0 }: { to: number; hold?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(to);
      return;
    }
    const start = performance.now();
    const RUN = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start - hold;
      if (t <= 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min(t / RUN, 1);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, hold]);

  return <span ref={ref}>{n}</span>;
}
