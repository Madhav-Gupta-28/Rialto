import { keccak256, type Hex } from "viem";

/**
 * The document is the thing being underwritten, so everything here exists to
 * answer one question: are these bytes the bytes the issuer committed to?
 */

export interface OnChainDocument {
  /** Where the bytes are said to live. Untrusted — supplied by the issuer. */
  uri: string;
  /** The hash the security carries, written under a role-gated call. */
  hash: Hex;
  /** When the issuer last wrote it. */
  timestamp: bigint;
}

export type DocumentOutcome =
  | { ok: true; bytes: Uint8Array; text: string; hash: Hex }
  | { ok: false; reason: DocumentFailure; detail: string };

export type DocumentFailure =
  | "no-document" // the security carries no such document
  | "unreachable" // the URI did not answer
  | "too-large" // refused before reading it into memory
  | "hash-mismatch"; // the bytes are not what was committed to

/** Nothing a counterparty controls gets to decide how much memory we spend. */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** Rewrites ipfs:// to a gateway. Injectable so tests never touch a network. */
  resolveUri?: (uri: string) => string;
}

export function defaultResolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

/**
 * Fetch a document and prove it is the one the security committed to.
 *
 * Returns a failure rather than throwing, because "I could not verify this" is
 * an ordinary outcome for an underwriter and the correct response to it is to
 * not bid — silence is a valid opinion.
 */
export async function fetchAndVerify(doc: OnChainDocument, opts: FetchOptions = {}): Promise<DocumentOutcome> {
  const {
    fetchImpl = fetch,
    timeoutMs = 15_000,
    maxBytes = MAX_DOCUMENT_BYTES,
    resolveUri = defaultResolveUri,
  } = opts;

  // An unset document reads as the zero hash. There is nothing to verify
  // against, so there is nothing to reason about.
  if (!doc.uri || doc.hash === ZERO_HASH) {
    return { ok: false, reason: "no-document", detail: "the security carries no document under that name" };
  }

  const url = resolveUri(doc.uri);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let bytes: Uint8Array;
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, reason: "unreachable", detail: `${url} answered ${res.status}` };
    }

    // Trust the advertised length only to refuse early; still bound the read.
    const advertised = Number(res.headers?.get?.("content-length") ?? 0);
    if (advertised > maxBytes) {
      return { ok: false, reason: "too-large", detail: `${advertised} bytes exceeds the ${maxBytes} cap` };
    }

    bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      return { ok: false, reason: "too-large", detail: `${bytes.byteLength} bytes exceeds the ${maxBytes} cap` };
    }
  } catch (e) {
    return { ok: false, reason: "unreachable", detail: describe(e) };
  } finally {
    clearTimeout(timer);
  }

  const hash = keccak256(bytes);
  if (hash.toLowerCase() !== doc.hash.toLowerCase()) {
    // This is the line the whole design rests on. Bytes that do not hash to
    // what the issuer committed to are a different document, whatever they say
    // inside, and an agent that reasons over them is reasoning about a document
    // nobody signed for.
    return {
      ok: false,
      reason: "hash-mismatch",
      detail: `fetched bytes hash to ${hash}, the security committed to ${doc.hash}`,
    };
  }

  return { ok: true, bytes, text: new TextDecoder().decode(bytes), hash };
}

export const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function describe(e: unknown): string {
  if (e instanceof Error) return e.name === "AbortError" ? "timed out" : e.message;
  return String(e);
}
