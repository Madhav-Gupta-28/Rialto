"use client";

import { useEffect, useRef, useState } from "react";
import { link } from "@/lib/links";

/**
 * Why you can trust a machine with somebody else's money.
 *
 * Two answers. It writes down its thinking to a public topic *before* it bids,
 * so the record cannot be edited to suit the outcome — and it bids inside
 * limits the market itself enforces, so it cannot overspend even if the key is
 * stolen.
 *
 * The step that lands on black is the bid, because it comes last and that
 * ordering is the entire claim.
 */

const STEPS = [
  { t: "reads the bond's paperwork", href: link.agent },
  { t: "checks it is the real document", href: link.agent },
  { t: "writes down its thinking", href: link.hcs },
  { t: "then bids", href: link.bid },
];

const LIMITS = ["biggest loan", "total lent", "lowest rate", "longest term", "which bonds"];

export default function Underwriting() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(6);
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
          if (i >= 6) clearInterval(id);
        }, 520);
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div style={{ display: "grid", gap: 1, background: "var(--line)", border: "1px solid var(--line)" }}>
        {STEPS.map((s, i) => (
          <a
            key={s.t}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 16, padding: "14px 18px",
              background: i === 3 ? "var(--ink)" : "var(--paper)",
              color: i === 3 ? "var(--paper)" : "var(--ink)",
              textDecoration: "none",
              opacity: n > i ? 1 : 0,
              transform: n > i ? "none" : "translateY(5px)",
              transition: "opacity .45s ease, transform .45s ease",
            }}
          >
            <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, opacity: 0.5 }}>{`0${i + 1}`}</span>
            <span style={{ fontSize: 15.5 }}>{s.t}</span>
            {i === 2 && (
              <span
                style={{
                  marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10,
                  letterSpacing: ".08em", color: "var(--muted)",
                }}
              >
                HEDERA CONSENSUS SERVICE
              </span>
            )}
          </a>
        ))}
      </div>

      {/* the ordering, stated as two stamps */}
      <div
        style={{
          marginTop: 18, textAlign: "center",
          opacity: n > 4 ? 1 : 0, transition: "opacity .5s ease",
        }}
      >
        <p className="readout" style={{ margin: 0 }}>
          <span className="v">20:36:21</span> <span className="k">written</span>
          {"     "}
          <span className="v">20:37:22</span> <span className="k">funded</span>
        </p>
      </div>

      {/* the box it cannot bid outside */}
      <div
        style={{
          marginTop: 22, border: "1px solid var(--ink)", padding: "16px 18px",
          opacity: n > 5 ? 1 : 0, transition: "opacity .6s ease",
        }}
      >
        <p className="eyebrow" style={{ margin: "0 0 12px" }}>Limits the market enforces</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {LIMITS.map((f) => (
            <span
              key={f}
              style={{
                border: "1px solid var(--line)", padding: "5px 10px", borderRadius: 2,
                fontSize: 12.5, color: "var(--ink)",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
