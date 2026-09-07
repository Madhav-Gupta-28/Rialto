"use client";

import { useEffect, useRef, useState } from "react";
import { link } from "@/lib/links";

/**
 * What an issuer can do to a live loan.
 *
 * Four switches over one line. Flip any of them and the line breaks — flip it
 * back and the loan carries on. The collateral never moves either way, which is
 * the only sentence this section needs.
 *
 * Then the fact that makes it real: Hedera's own scheduled call hit one of
 * these and failed.
 */

const SWITCHES = [
  { name: "pause", note: "the whole bond" },
  { name: "freeze", note: "one address" },
  { name: "un-KYC", note: "one credential" },
  { name: "delist", note: "the market" },
];

export default function Controls() {
  const ref = useRef<HTMLDivElement>(null);
  const [shut, setShut] = useState<number | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLive(true);
      setShut(1);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        setLive(true);
        let i = 0;
        const id = setInterval(() => {
          setShut(i % 5 === 4 ? null : i % 5);
          i += 1;
          if (i > 14) {
            clearInterval(id);
            setShut(null);
          }
        }, 850);
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2 }}>
        {SWITCHES.map((g, i) => {
          const closed = shut === i;
          return (
            <div
              key={g.name}
              style={{
                border: "1px solid var(--ink)",
                background: closed ? "var(--ink)" : "transparent",
                color: closed ? "var(--paper)" : "var(--ink)",
                padding: "13px 14px 11px",
                transition: "background .35s ease, color .35s ease",
                opacity: live ? 1 : 0,
              }}
            >
              <p style={{ fontFamily: "var(--mono)", fontSize: 12, margin: "0 0 3px" }}>{g.name}</p>
              <p
                style={{
                  fontSize: 11.5, margin: 0,
                  color: closed ? "rgba(244,242,237,.65)" : "var(--muted)",
                  transition: "color .35s ease",
                }}
              >
                {g.note}
              </p>
            </div>
          );
        })}
      </div>

      {/* the line those switches sit on */}
      <svg viewBox="0 0 800 46" width="100%" style={{ marginTop: 14, display: "block" }} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => {
          const x = 100 + i * 200;
          return (
            <line key={i} x1={x} y1={0} x2={x} y2={14} stroke="var(--line)" strokeWidth={1} />
          );
        })}
        <line x1={20} y1={26} x2={780} y2={26} stroke="var(--line)" strokeWidth={2} />
        {shut !== null && (
          <line
            x1={100 + shut * 200 - 26} y1={26} x2={100 + shut * 200 + 26} y2={26}
            stroke="var(--paper)" strokeWidth={5}
          />
        )}
        {shut !== null && (
          <>
            <line x1={100 + shut * 200 - 9} y1={17} x2={100 + shut * 200 + 9} y2={35}
                  stroke="var(--ink)" strokeWidth={2} />
            <line x1={100 + shut * 200 - 9} y1={35} x2={100 + shut * 200 + 9} y2={17}
                  stroke="var(--ink)" strokeWidth={2} />
          </>
        )}
      </svg>

      <p style={{ textAlign: "center", fontSize: 15.5, color: "var(--ink)", margin: "12px 0 0", minHeight: 22 }}>
        {shut !== null ? (
          <>Settlement stops. <span style={{ color: "var(--muted)" }}>Your bond does not move.</span></>
        ) : live ? (
          <>All clear. <span style={{ color: "var(--muted)" }}>The loan finishes as agreed.</span></>
        ) : (
          " "
        )}
      </p>

      {/* the one that proves it */}
      <div style={{ marginTop: 26, borderTop: "1px solid var(--line)", paddingTop: 22 }}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>Hedera tried to close a loan four times</p>
        <div style={{ display: "grid", gap: 5 }}>
          {[
            ["20:33:25", "ok"],
            ["20:54:13", "ok"],
            ["20:54:22", "ok"],
            ["21:11:12", "stopped"],
          ].map(([t, state]) => (
            <p key={t} className="readout" style={{ margin: 0, fontSize: 12.5 }}>
              <span className="k">{t}</span>{" "}
              <span className={`state ${state === "ok" ? "settled" : "blocked"}`}>{state}</span>
              {state !== "ok" && <span className="k"> — the lender had been frozen</span>}
            </p>
          ))}
        </div>
        <p style={{ fontSize: 14.5, color: "var(--ink-2)", margin: "16px 0 0", maxWidth: "58ch" }}>
          <strong style={{ color: "var(--ink)", fontWeight: 500 }}>
            The issuer stopped Hedera itself.
          </strong>{" "}
          The loan stayed open and finished the moment the freeze lifted.{" "}
          <a href={link.scheduled} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
            See it ↗
          </a>
        </p>
      </div>
    </div>
  );
}
