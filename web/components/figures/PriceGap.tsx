"use client";

import { useEffect, useRef } from "react";

/**
 * Why a lending market cannot hold this asset.
 *
 * Two price series and one liquidation threshold. The liquid one updates every
 * frame, so a margin call is a measurement. The bond updates twice in the whole
 * sequence, because it trades by appointment — so the same margin call is a
 * guess, and the gap between the last print and now is the whole risk.
 *
 * Deliberately not a chart of anything real. It is the shape of the problem.
 */
export default function PriceGap() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 760;
    const H = 260;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.scale(dpr, dpr);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--paper-ink").trim() || "#111110";
    const mut = css.getPropertyValue("--paper-muted").trim() || "#6b6760";
    const line = css.getPropertyValue("--paper-line").trim() || "#d9d5cc";
    const blocked = css.getPropertyValue("--blocked").trim() || "#c0705e";

    // A deterministic walk, so the picture is the same every time it is seen.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);

    const N = 240;
    const liquid: number[] = [];
    let v = 0;
    for (let i = 0; i < N; i++) {
      v = v * 0.94 + rnd() * 13;
      liquid.push(v);
    }
    // The bond prints at two points, and holds flat in between.
    const PRINTS = [0, 96, 200];
    const bondAt = (i: number) => {
      let last = PRINTS[0]!;
      for (const p of PRINTS) if (p <= i) last = p;
      return liquid[last]! * 0.55;
    };

    const y = (val: number) => H / 2 - val;
    let frame = 0;
    let raf = 0;

    const draw = () => {
      const n = reduced ? N : Math.min(frame, N);
      ctx.clearRect(0, 0, W, H);

      // the threshold everything is measured against
      ctx.strokeStyle = blocked;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y(-46));
      ctx.lineTo(W, y(-46));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = blocked;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("LIQUIDATION THRESHOLD", 4, y(-46) - 7);

      const px = (i: number) => (i / (N - 1)) * (W - 8) + 4;

      // liquid: a continuous measurement
      ctx.strokeStyle = mut;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(i), y(liquid[i]!));
      ctx.stroke();

      // the bond: a step, and long flat stretches where nothing is known
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(i), y(bondAt(i)));
      ctx.stroke();

      // mark each print, because the sparseness is the argument
      ctx.fillStyle = ink;
      for (const p of PRINTS) {
        if (p >= n) continue;
        ctx.beginPath();
        ctx.arc(px(p), y(bondAt(p)), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = mut;
      ctx.font = "10px ui-monospace, monospace";
      if (n > 30) ctx.fillText("LIQUID ASSET · PRICED EVERY BLOCK", px(4), y(liquid[4]!) - 12);
      if (n > 140) ctx.fillText("THE BOND · THREE PRINTS, THEN SILENCE", px(112), y(bondAt(112)) + 22);

      if (!reduced && frame < N + 40) {
        frame += 2;
        raf = requestAnimationFrame(draw);
      }
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          io.disconnect();
          draw();
        }
      },
      { rootMargin: "-60px" },
    );
    io.observe(cv);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} style={{ width: "100%", height: "auto", display: "block" }} aria-label="A liquid asset prices continuously; the bond prints three times and then goes quiet." />;
}
