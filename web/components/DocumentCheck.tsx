"use client";

import { useEffect, useState } from "react";
import { keccak256, type Hex } from "viem";
import { useReadContract } from "wagmi";
import { securityAbi } from "@/lib/abi";

type State =
  | { k: "loading" }
  | { k: "none" }
  | { k: "unreachable"; detail: string }
  | { k: "mismatch"; got: Hex; uri: string }
  | { k: "ok"; uri: string; bytes: number; text: string };

/**
 * Fetch the document and check it here, in the reader's own browser.
 *
 * This is the claim the whole market rests on, so it should not be something a
 * user takes on trust from us. The hash compared against is the one the request
 * froze at `open` — not whatever the security says today — which is why
 * replacing the document mid-auction shows up as a mismatch rather than moving
 * a bid.
 */
export default function DocumentCheck({
  collateral,
  docName,
  frozenHash,
  docFromChain,
}: {
  collateral: Hex;
  docName: Hex;
  frozenHash: Hex;
  docFromChain: boolean;
}) {
  const { data: doc } = useReadContract({
    address: collateral,
    abi: securityAbi,
    functionName: "getDocument",
    args: [docName],
  });

  const [state, setState] = useState<State>({ k: "loading" });
  const uri = doc?.[0];

  useEffect(() => {
    let live = true;
    if (uri === undefined) return;
    if (!uri) {
      setState({ k: "none" });
      return;
    }

    (async () => {
      try {
        const res = await fetch(uri);
        if (!res.ok) {
          if (live) setState({ k: "unreachable", detail: `${res.status}` });
          return;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const got = keccak256(bytes);
        if (!live) return;
        if (got.toLowerCase() !== frozenHash.toLowerCase()) {
          setState({ k: "mismatch", got, uri });
        } else {
          setState({ k: "ok", uri, bytes: bytes.byteLength, text: new TextDecoder().decode(bytes) });
        }
      } catch (e) {
        if (live) setState({ k: "unreachable", detail: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      live = false;
    };
  }, [uri, frozenHash]);

  return (
    <div className="card">
      <p className="eyebrow">The document</p>

      <div className="kv">
        <span className="k">Hash frozen at open</span>
        <span className="v">{frozenHash}</span>
      </div>
      <div className="kv">
        <span className="k">Read from the security</span>
        <span className="v">{docFromChain ? "yes" : "no — borrower supplied"}</span>
      </div>

      {state.k === "loading" && <p className="sub" style={{ marginTop: 14 }}>Fetching and hashing…</p>}

      {state.k === "none" && <p className="sub" style={{ marginTop: 14 }}>No document under that name.</p>}

      {state.k === "unreachable" && (
        <p className="err" style={{ marginTop: 14 }}>
          Could not fetch the document ({state.detail}). An underwriter that cannot verify it should not
          bid.
        </p>
      )}

      {state.k === "mismatch" && (
        <div style={{ marginTop: 14 }}>
          <p className="err">Mismatch. These bytes are not the ones this request committed to.</p>
          <div className="kv">
            <span className="k">Fetched bytes hash to</span>
            <span className="v">{state.got}</span>
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            The document behind this URI has changed since the request was opened. Bids already placed
            remain bound to the hash frozen at open, so nothing here can move them.
          </p>
        </div>
      )}

      {state.k === "ok" && (
        <>
          <div className="kv">
            <span className="k">Fetched</span>
            <span className="v ok">{state.bytes} bytes — hash matches</span>
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            Verified in your browser: the bytes at{" "}
            <a href={state.uri} target="_blank" rel="noreferrer">
              this URI
            </a>{" "}
            hash to exactly what the request committed to.
          </p>
          <details style={{ marginTop: 14 }}>
            <summary className="sub" style={{ cursor: "pointer" }}>
              Read the prospectus
            </summary>
            <pre
              style={{
                marginTop: 12,
                whiteSpace: "pre-wrap",
                fontFamily: "var(--mono)",
                fontSize: 12.5,
                color: "var(--ink-2)",
                background: "var(--ground)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: 14,
                maxHeight: 320,
                overflow: "auto",
              }}
            >
              {state.text}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
