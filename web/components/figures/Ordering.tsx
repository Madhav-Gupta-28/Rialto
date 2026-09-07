"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The sixty-one seconds that make the reasoning worth anything.
 *
 * The agent writes why it is bidding to a Hedera consensus topic, and only then
 * bids — carrying that message's hash on chain. Consensus timestamps the
 * explanation, so it cannot have been written to fit an outcome it predates.
 *
 * The bar fills between the two stamps because the *gap* is the claim. Both
 * ends are real: HCS sequence 13 and the award of request #6.
 */
export default function Ordering() {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          io.disconnect();
          setRun(true);
        }
      },
      { rootMargin: "-70px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>Reasoning published</p>
          <p style={{ fontFamily: "var(--mono)", fontSize: 22, color: "var(--paper-ink)", margin: 0 }}>20:36:21</p>
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--paper-muted)", margin: "4px 0 0" }}>
            HCS 0.0.10367534 · seq 13
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>Outcome known</p>
          <p style={{ fontFamily: "var(--mono)", fontSize: 22, color: "var(--paper-ink)", margin: 0 }}>20:37:22</p>
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--paper-muted)", margin: "4px 0 0" }}>
            request #6 awarded
          </p>
        </div>
      </div>

      <div style={{ position: "relative", height: 3, background: "var(--paper-line)", margin: "26px 0 12px" }}>
        <div
          style={{
            position: "absolute", inset: 0, transformOrigin: "left",
            transform: `scaleX(${run ? 1 : 0})`,
            transition: "transform 1.5s cubic-bezier(.2,.7,.3,1) .3s",
            background: "var(--settled)",
          }}
        />
      </div>

      <p style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--paper-muted)", margin: 0 }}>
        61 seconds
      </p>

      <div style={{ marginTop: 30, borderTop: "1px solid var(--paper-line)", paddingTop: 20 }}>
        <p className="readout" style={{ margin: 0, wordBreak: "break-all" }}>
          <span className="k">keccak(message)</span>{" "}
          <span className="v">0xe3f8da90407445a5c3a624b06e7bfc21cddf935f73ce820ccf57dd0e026b67cd</span>
          <br />
          <span className="k">reasoningRef on chain</span>{" "}
          <span className="v">0xe3f8da90407445a5c3a624b06e7bfc21cddf935f73ce820ccf57dd0e026b67cd</span>
        </p>
      </div>
    </div>
  );
}
