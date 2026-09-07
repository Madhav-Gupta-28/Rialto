"use client";

import { useEffect, useRef } from "react";

/**
 * Why a lending market cannot hold this asset.
 *
 * Two lanes, not two lines on one axis — overlaid they read as one noisy chart
 * and the argument disappears. Above: an asset priced every block, where a
 * margin call is a measurement. Below: the same threshold against a bond that
 * printed three times, with everything between the prints shaded, because that
 * shading is the whole risk. A liquidation there is a guess about a number
 * nobody has.
 */
export default function PriceGap() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const W = 900;
    const H = 340;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.scale(dpr, dpr);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = getComputedStyle(document.documentElement);
    const ink = s.getPropertyValue("--paper-ink").trim() || "#111110";
    const mut = s.getPropertyValue("--paper-muted").trim() || "#6b6760";
    const rule = s.getPropertyValue("--paper-line").trim() || "#d9d5cc";
    const bad = s.getPropertyValue("--blocked").trim() || "#c0705e";

    // Deterministic, so the picture is identical every time anyone sees it.
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);

    const N = 260;
    const walk: number[] = [];
    let v = 0;
    for (let i = 0; i < N; i++) {
      v = v * 0.93 + rnd() * 15;
      walk.push(v);
    }

    const L = 56;                         // left gutter for labels
    const R = W - 16;
    const px = (i: number) => L + (i / (N - 1)) * (R - L);

    const LANE_A = 96;                    // baseline of the top lane
    const LANE_B = 258;                   // baseline of the bottom lane
    const PRINTS = [0, 104, 214];

    const lane = (baseY: number, title: string, note: string) => {
      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L, baseY + 46);
      ctx.lineTo(R, baseY + 46);
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(title, L, baseY - 56);
      ctx.fillStyle = mut;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(note, L, baseY - 41);
    };

    const threshold = (baseY: number) => {
      const y = baseY + 30;
      ctx.strokeStyle = bad;
      ctx.setLineDash([3, 4]);
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(R, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = bad;
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText("THRESHOLD", 4, y + 3);
    };

    let frame = 0;
    let raf = 0;

    const draw = () => {
      const n = reduced ? N : Math.min(frame, N);
      ctx.clearRect(0, 0, W, H);

      lane(LANE_A, "A liquid asset", "priced every block · a margin call is a measurement");
      threshold(LANE_A);
      lane(LANE_B, "The bond", "three prints in a month · a margin call is a guess");
      threshold(LANE_B);

      // Everything between prints is a stretch where no price exists. Shading it
      // is the argument; the line alone would look merely quiet.
      for (let p = 0; p < PRINTS.length; p++) {
        const from = PRINTS[p]!;
        const to = p + 1 < PRINTS.length ? PRINTS[p + 1]! : N - 1;
        if (from >= n) break;
        const x0 = px(from);
        const x1 = px(Math.min(to, n));
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.045;
        ctx.fillRect(x0, LANE_B - 46, x1 - x0, 76);
        ctx.globalAlpha = 1;
        if (x1 - x0 > 90) {
          ctx.fillStyle = mut;
          ctx.font = "9px ui-monospace, monospace";
          ctx.fillText("NO PRICE", (x0 + x1) / 2 - 22, LANE_B + 44);
        }
      }

      // the liquid series
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(i), LANE_A - walk[i]! * 0.5);
      ctx.stroke();

      // the bond: flat between prints, stepping only where one lands
      const bond = (i: number) => {
        let last = PRINTS[0]!;
        for (const p of PRINTS) if (p <= i) last = p;
        return LANE_B - walk[last]! * 0.5;
      };
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(i), bond(i));
      ctx.stroke();

      ctx.fillStyle = ink;
      for (const p of PRINTS) {
        if (p >= n) continue;
        ctx.beginPath();
        ctx.arc(px(p), bond(p), 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced && frame < N) {
        frame += 3;
        raf = requestAnimationFrame(draw);
      }
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        draw();
      },
      { rootMargin: "-60px" },
    );
    io.observe(cv);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-label="A liquid asset is priced every block. The bond prints three times, and between those prints no price exists."
    />
  );
}
