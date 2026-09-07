"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Rows that arrive one at a time.
 *
 * Used where the order of a list is the argument. Every scheduled call the
 * market has ever made reads SUCCESS until the last one, and that last one is
 * the whole compliance claim — printed all at once it is a table, printed in
 * sequence it is a story with an ending.
 */
export default function Sequence({
  rows,
  gap = 420,
}: {
  rows: React.ReactNode[];
  /** Milliseconds between rows. */
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(rows.length);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        let i = 0;
        const id = setInterval(() => {
          i += 1;
          setShown(i);
          if (i >= rows.length) clearInterval(id);
        }, gap);
        setShown(1);
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, gap]);

  return (
    <div ref={ref}>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            opacity: i < shown ? 1 : 0,
            transform: i < shown ? "none" : "translateY(6px)",
            transition: "opacity .38s ease, transform .38s ease",
          }}
        >
          {row}
        </div>
      ))}
    </div>
  );
}
