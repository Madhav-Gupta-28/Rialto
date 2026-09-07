"use client";

import { useEffect, useRef, useState } from "react";

/**
 * What the underwriter actually said, typed out as it was written.
 *
 * Verbatim from HCS on request #8 — a model reading RDN27's prospectus, not a
 * paraphrase and not an illustration. It found the seniority, found the
 * maturity, checked the loan did not run past it, and then charged 200bps for
 * an issuer it could not identify. The hash beneath is the one the bid carries.
 *
 * Typed rather than shown because the sequence is the point: this was reasoned
 * out before anyone knew who would win.
 */

const LINES: { text: string; flag?: boolean }[] = [
  { text: "The document explicitly states the notes are senior secured obligations of the Issuer." },
  { text: "A clear maturity date of 1 September 2027 is provided." },
  { text: "The requested loan term (1 day) is well within the instrument's maturity (1 September 2027)." },
  {
    text: "The issuer 'Acme Infrastructure Holdings Limited' cannot be identified as the document states it describes no real company — 200bps added.",
    flag: true,
  },
];

const SPEED = 11; // ms per character

export default function Reasoning() {
  const ref = useRef<HTMLDivElement>(null);
  const [chars, setChars] = useState(0);
  const total = LINES.reduce((n, l) => n + l.text.length, 0);
  const done = chars >= total;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setChars(total);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
          const n = Math.floor((now - start) / SPEED);
          setChars(Math.min(n, total));
          if (n < total) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [total]);

  // Spend the character budget line by line, so each appears as it is written.
  let budget = chars;
  const rendered = LINES.map((l) => {
    const take = Math.max(0, Math.min(l.text.length, budget));
    budget -= take;
    return { ...l, shown: l.text.slice(0, take) };
  });

  return (
    <div ref={ref}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <p className="eyebrow" style={{ margin: 0 }}>Published to HCS · request #8</p>
        <span className="sub" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
          gemini-2.5-flash reading RDN27
        </span>
      </div>

      <div style={{ marginTop: 18, minHeight: 132 }}>
        {rendered.map((l, i) =>
          l.shown ? (
            <p
              key={i}
              className="readout"
              style={{
                margin: "0 0 10px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                lineHeight: 1.65,
              }}
            >
              <span style={{ color: l.flag ? "var(--pending)" : "var(--paper-muted)", flexShrink: 0 }}>
                {l.flag ? "!" : "·"}
              </span>
              <span style={{ color: "var(--paper-ink)" }}>
                {l.shown}
                {!done && l.shown.length < l.text.length && (
                  <span style={{ opacity: 0.5 }}>▌</span>
                )}
              </span>
            </p>
          ) : null,
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--paper-line)",
          paddingTop: 18,
          marginTop: 6,
          opacity: done ? 1 : 0,
          transition: "opacity .6s ease",
        }}
      >
        <p className="readout" style={{ margin: 0, wordBreak: "break-all" }}>
          <span className="k">it bid</span> <span className="v">2,000.383561 dUSD at 699 bps</span>
          <br />
          <span className="k">keccak(message)</span>{" "}
          <span className="v">0x6414093a0bfe940e8d720039aa4391d62502b1fd4728003d72d965533123f269</span>
          <br />
          <span className="k">carried on the bid</span>{" "}
          <span className="v">0x6414093a0bfe940e8d720039aa4391d62502b1fd4728003d72d965533123f269</span>
        </p>
      </div>
    </div>
  );
}
