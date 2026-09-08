"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The three ways a figure on this site is allowed to move, in one place.
 *
 * Each of them was written out longhand six times, and each of those six copies
 * carried the same bug: the interval was started inside the observer's callback,
 * where the effect's cleanup could not see it. Leaving the page mid-animation
 * left a timer running against a component that no longer existed — up to
 * thirteen seconds of it on the how-it-works page, still calling setState.
 *
 * Reduced motion is honoured the same way throughout: the figure is shown
 * finished rather than shown still, because these carry meaning and skipping
 * the animation must not mean skipping the content.
 */

const still = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True from the first time the element is scrolled into view, and then always. */
export function useSeen<T extends HTMLElement>(rootMargin = "-70px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (still()) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        setSeen(true);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return [ref, seen] as const;
}

/**
 * A figure that assembles itself once: 0, then 1…`total`, one step every `ms`,
 * beginning when the reader reaches it. Under reduced motion it is `total`
 * from the start.
 */
export function useSteps<T extends HTMLElement>(total: number, ms: number, rootMargin = "-70px") {
  const [ref, seen] = useSeen<T>(rootMargin);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (still()) {
      setN(total);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= total) clearInterval(id);
    }, ms);
    return () => clearInterval(id);
  }, [seen, total, ms]);

  return [ref, n] as const;
}

/**
 * Whether the element is on screen *now* — for the one figure that loops rather
 * than assembling. A loop that runs whether or not anybody is looking at it
 * re-renders forever behind the fold, and greets the reader who finally scrolls
 * down at step three of five, which reads as a still frame rather than as a
 * sequence.
 */
export function useVisible<T extends HTMLElement>(rootMargin = "-70px") {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return [ref, visible] as const;
}

/** Whether the reader has asked for less movement. */
export const prefersStill = still;
