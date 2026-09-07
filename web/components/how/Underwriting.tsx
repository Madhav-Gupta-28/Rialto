"use client";

import { useEffect, useRef, useState } from "react";
import { link } from "@/lib/links";

/**
 * How a machine is allowed to spend somebody else's money, and how you know
 * afterwards that it was honest.
 *
 * Two halves, and they are separate on purpose. Above: what it reads and what
 * it publishes, in order, with the publish happening before the bid so the
 * explanation cannot be written to fit the outcome. Below: the mandate, which
 * is on chain and enforced by the market whatever the agent decides.
 */

const STEPS = [
  { t: "reads the document", s: "off the security itself", href: link.agent },
  { t: "checks the bytes", s: "against the hash the issuer signed", href: link.agent },
  { t: "publishes its reasoning", s: "to a Hedera consensus topic", href: link.hcs },
  { t: "then bids", s: "carrying that message's hash", href: link.bid },
];

export default function Underwriting() {
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
        }, 640);
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
              display: "flex", alignItems: "baseline", gap: 20, padding: "20px 24px",
              background: i === 3 ? "var(--ink)" : "var(--paper)",
              color: i === 3 ? "var(--paper)" : "var(--ink)",
              textDecoration: "none",
              opacity: n > i ? 1 : 0,
              transform: n > i ? "none" : "translateY(6px)",
              transition: "opacity .5s ease, transform .5s ease",
            }}
          >
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.55, minWidth: 20 }}>
              {`0${i + 1}`}
            </span>
            <span style={{ fontSize: 17, minWidth: 210 }}>{s.t}</span>
            <span
              style={{
                fontFamily: "var(--mono)", fontSize: 12,
                color: i === 3 ? "rgba(244,242,237,.7)" : "var(--muted)",
              }}
            >
              {s.s}
            </span>
          </a>
        ))}
      </div>

      <div
        style={{
          marginTop: 28, textAlign: "center",
          opacity: n > 4 ? 1 : 0, transition: "opacity .6s ease",
        }}
      >
        <p className="readout" style={{ margin: 0 }}>
          <span className="k">published</span> <span className="v">20:36:21</span>
          {"   "}
          <span className="k">awarded</span> <span className="v">20:37:22</span>
        </p>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: "10px 0 0" }}>
          61 seconds. Consensus timestamped the explanation before anyone knew who had won.
        </p>
      </div>

      {/* the box it cannot bid outside */}
      <div
        style={{
          marginTop: 34, border: "1px solid var(--ink)", padding: "22px 26px",
          opacity: n > 4 ? 1 : 0, transition: "opacity .7s ease .2s",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
          <p className="eyebrow" style={{ margin: 0 }}>The mandate · on chain, enforced by the market</p>
          <a href={link.mandate} target="_blank" rel="noreferrer"
             style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
            Mandates.sol ↗
          </a>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["maxPerDeal", "maxTotal", "minRateBps", "maxTerm", "allowedAssets"].map((f) => (
            <span key={f} className="state" style={{ borderColor: "var(--ink)", color: "var(--ink)" }}>
              {f}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 14.5, color: "var(--ink-2)", margin: "18px 0 0", maxWidth: "62ch" }}>
          A compromised agent key can do nothing its owner had not already authorised. The limits are
          checked against whoever owns the capital, not whoever signed.
        </p>
      </div>
    </div>
  );
}
