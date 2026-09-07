"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An address you can take with you.
 *
 * Shortened for the eye, full on the clipboard — reading `0x932a…515A` off a
 * screen and typing it into a terminal is exactly the kind of transcription
 * nobody should be asked to do. Stops the click reaching the row behind it,
 * which is a link.
 */
export default function Copy({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className="copy"
      title={value}
      aria-label={`Copy ${value}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(
          () => {
            setDone(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setDone(false), 1400);
          },
          () => undefined,
        );
      }}
    >
      <span className="mono">{label}</span>
      <span className="mark" aria-hidden="true">{done ? "copied" : "copy"}</span>
    </button>
  );
}
