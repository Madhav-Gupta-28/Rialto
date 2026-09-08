"use client";

import { useEffect, useState } from "react";
import { MARKET, hashscan } from "@/lib/chain";
import { short } from "@/lib/format";

/**
 * Evidence that the figures came from somewhere, put beside the figures.
 *
 * Without this a reader cannot tell a table of contract calls from a table of
 * hardcoded HTML, and the claim that there is no backend sits in grey text at
 * the foot of the page — the weakest possible place for the strongest possible
 * claim. The age ticks, so the page is visibly still connected to something.
 */
export default function Live({ at }: { at: number | undefined }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const age = at ? Math.max(0, Math.round((now - at) / 1000)) : null;

  return (
    <span className="live">
      <span className="dot" aria-hidden="true" />
      {age === null ? (
        <>reading the chain…</>
      ) : (
        <>
          read from{" "}
          <a href={hashscan(MARKET)} target="_blank" rel="noreferrer">
            {short(MARKET)}
          </a>{" "}
          · {age === 0 ? "just now" : `${age}s ago`}
        </>
      )}
    </span>
  );
}
