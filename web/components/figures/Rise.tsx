"use client";

import { useSeen } from "@/lib/reveal";

/**
 * Fade a section up once, the first time it is reached, and never again.
 *
 * Anything more than this on a page about credit reads as decoration. The
 * observer disconnects after firing so a slow scroll back up cannot replay it.
 */
export default function Rise({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [ref, shown] = useSeen<HTMLDivElement>("-60px");

  return (
    <div ref={ref} className={`rise${shown ? " in" : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
