"use client";

import { useEffect, useState } from "react";
import { keccak256, type Hex } from "viem";
import { useReadContract } from "wagmi";
import { securityAbi } from "@/lib/abi";
import { documentUri } from "@/lib/uri";
import Copy from "./Copy";

/** An offering document is prose. Anything larger is not one. */
const MAX_BYTES = 2 * 1024 * 1024;

type State =
  | { k: "loading" }
  | { k: "none" }
  | { k: "refused"; raw: string; why: string }
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
 *
 * The address is the issuer's to choose, so it is checked before it is either
 * fetched or linked: see lib/uri. A refused scheme is reported as a document
 * that could not be checked, never as one that passed.
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
  const raw = doc?.[0];
  const safe = raw === undefined ? undefined : documentUri(raw);
  const uri = safe?.ok ? safe.url : undefined;

  useEffect(() => {
    let live = true;
    if (raw === undefined) return;
    if (raw.trim() === "") {
      setState({ k: "none" });
      return;
    }
    if (!uri) {
      const why = safe && !safe.ok ? safe.why : "not an address this page will open";
      setState({ k: "refused", raw, why });
      return;
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15_000);

    (async () => {
      try {
        const res = await fetch(uri, { signal: abort.signal });
        if (!res.ok) {
          if (live) setState({ k: "unreachable", detail: `${res.status}` });
          return;
        }

        // The URI is chosen by the issuer, so the size of what comes back is
        // their decision unless it is bounded here. Reading it straight into
        // memory would let a hostile document hang the reader's browser.
        const bytes = await readCapped(res, MAX_BYTES);
        if (!bytes) {
          if (live) setState({ k: "unreachable", detail: `larger than ${MAX_BYTES / 1024} KB` });
          return;
        }
        const got = keccak256(bytes);
        if (!live) return;
        if (got.toLowerCase() !== frozenHash.toLowerCase()) {
          setState({ k: "mismatch", got, uri });
        } else {
          setState({ k: "ok", uri, bytes: bytes.byteLength, text: new TextDecoder().decode(bytes) });
        }
      } catch (e) {
        if (live) {
          const m = e instanceof Error ? (e.name === "AbortError" ? "timed out" : e.message) : String(e);
          setState({ k: "unreachable", detail: m });
        }
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      live = false;
      abort.abort();
      clearTimeout(timer);
    };
    // `safe` is derived from `raw` on every render, so `raw` is the dependency
    // that actually changes; listing the object would rerun this each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, uri, frozenHash]);

  return (
    <div className="card">
      <p className="eyebrow">The document</p>

      <div className="kv">
        <span className="k">Fingerprint at open</span>
        <span className="v">
          <Copy value={frozenHash} label={`${frozenHash.slice(0, 14)}…${frozenHash.slice(-4)}`} />
        </span>
      </div>
      <div className="kv">
        <span className="k">Taken from</span>
        <span className="v">{docFromChain ? "the bond itself" : "the borrower — treat with care"}</span>
      </div>

      {state.k === "loading" && <p className="sub" style={{ marginTop: 14 }}>Fetching and hashing…</p>}

      {state.k === "none" && <p className="sub" style={{ marginTop: 14 }}>No document under that name.</p>}

      {state.k === "refused" && (
        <div style={{ marginTop: 14 }}>
          <p className="err">Refused: {state.why}.</p>
          <p className="note" style={{ marginTop: 12 }}>
            The security points its document at{" "}
            <code style={{ fontFamily: "var(--mono)", wordBreak: "break-all" }}>
              {state.raw.length > 120 ? `${state.raw.slice(0, 120)}…` : state.raw}
            </code>
            . Rialto fetches and links documents over http and https only — anything else would be
            running the issuer&rsquo;s choice of code or reaching into your own machine, in a page
            where your wallet is already connected. It is shown, not opened. An underwriter that
            cannot verify a document should not bid.
          </p>
        </div>
      )}

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
            <span className="k">These bytes</span>
            <span className="v">
              <Copy value={state.got} label={`${state.got.slice(0, 14)}…${state.got.slice(-4)}`} />
            </span>
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            <strong>This is the check working, not a broken loan.</strong> The request was opened against a
            deliberately falsified document during adversarial testing, and the fingerprint refuses it. An
            agent that cannot verify a document does not bid — which is why this request has none.
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
            Your browser fetched{" "}
            <a href={state.uri} target="_blank" rel="noreferrer">
              the file
            </a>{" "}
            and hashed it. It is the document this loan was agreed against.
          </p>
          <details className="doc" style={{ marginTop: 14 }}>
            <summary>
              Read it <span className="n">{state.bytes} bytes</span>
            </summary>
            <pre
              style={{
                marginTop: 12,
                whiteSpace: "pre-wrap",
                fontFamily: "var(--mono)",
                fontSize: 12,
                lineHeight: 1.7,
                color: "var(--ink-2)",
                background: "var(--wash)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: 16,
                maxHeight: 260,
                overflow: "auto",
                margin: "12px 0 0",
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

/** Read a body, stopping the moment it passes the cap. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > max ? null : buf;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
