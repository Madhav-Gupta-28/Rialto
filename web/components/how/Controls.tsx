"use client";

import { useEffect, useRef, useState } from "react";
import { link } from "@/lib/links";

/**
 * What an issuer can do to a live loan, and what happens to the loan.
 *
 * The answer is the same for all four controls and it is the point of the
 * section: the position holds. So the four are drawn as gates over one rail —
 * shut one and settlement stops there, open it and settlement continues. The
 * collateral never moves either way.
 *
 * The proof underneath is the strongest single fact in the project: the
 * network's own scheduled call hit one of these gates and reverted.
 */

const GATES = [
  { name: "pause", note: "every transfer halts" },
  { name: "freeze", note: "one address comes off the list" },
  { name: "revoke KYC", note: "a credential expires" },
  { name: "delist the escrow", note: "the market itself is stopped" },
];

export default function Controls() {
  const ref = useRef<HTMLDivElement>(null);
  const [shut, setShut] = useState<number | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(2);
      setShut(1);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        setN(1);
        let i = 0;
        const id = setInterval(() => {
          setShut(i % GATES.length);
          i += 1;
          if (i > 8) {
            clearInterval(id);
            setShut(null);
            setN(2);
          }
        }, 900);
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${GATES.length}, 1fr)`, gap: 2 }}>
        {GATES.map((g, i) => {
          const closed = shut === i;
          return (
            <div
              key={g.name}
              style={{
                border: "1px solid var(--ink)",
                background: closed ? "var(--ink)" : "transparent",
                color: closed ? "var(--paper)" : "var(--ink)",
                padding: "20px 18px 18px",
                transition: "background .4s ease, color .4s ease",
                opacity: n > 0 ? 1 : 0,
              }}
            >
              <p style={{ fontFamily: "var(--mono)", fontSize: 12.5, letterSpacing: ".06em", margin: "0 0 6px" }}>
                {g.name}
              </p>
              <p
                style={{
                  fontSize: 12.5, margin: 0,
                  color: closed ? "rgba(244,242,237,.7)" : "var(--muted)",
                  transition: "color .4s ease",
                }}
              >
                {g.note}
              </p>
            </div>
          );
        })}
      </div>

      <p
        style={{
          textAlign: "center", fontSize: 16, color: "var(--ink)", margin: "26px 0 0",
          minHeight: 24,
        }}
      >
        {shut !== null ? (
          <>Settlement stops. <span style={{ color: "var(--muted)" }}>The collateral does not move.</span></>
        ) : n > 1 ? (
          <>Every gate open. <span style={{ color: "var(--muted)" }}>The loan completes exactly as agreed.</span></>
        ) : (
          " "
        )}
      </p>

      {/* the one that matters */}
      <div style={{ marginTop: 40, borderTop: "1px solid var(--line)", paddingTop: 32 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>
          Every scheduled call the market has ever made
        </p>
        <div style={{ display: "grid", gap: 6 }}>
          {[
            ["20:33:25", "ok"],
            ["20:54:13", "ok"],
            ["20:54:22", "ok"],
            ["21:11:12", "blocked"],
          ].map(([t, state]) => (
            <p key={t} className="readout" style={{ margin: 0 }}>
              <span className="k">{t}</span> <span className="v">claim</span>{" "}
              <span className={`state ${state === "ok" ? "settled" : "blocked"}`}>{state}</span>
              {state === "blocked" && <span className="k"> — the lender was frozen</span>}
            </p>
          ))}
        </div>
        <p style={{ fontSize: 15.5, color: "var(--ink-2)", margin: "22px 0 0", maxWidth: "62ch" }}>
          <strong style={{ color: "var(--ink)", fontWeight: 500 }}>
            The issuer&rsquo;s control stopped Hedera itself, mid-settlement.
          </strong>{" "}
          The loan stayed open, the collateral stayed escrowed, and it completed the moment the freeze
          lifted.{" "}
          <a href={link.scheduled} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
            See every scheduled call ↗
          </a>
        </p>
      </div>
    </div>
  );
}
