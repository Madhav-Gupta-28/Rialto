import { describe, it, expect } from "vitest";
import { keccak256, toHex } from "viem";
import { fetchAndVerify, defaultResolveUri, ZERO_HASH, type OnChainDocument } from "../src/document.js";

const BODY = "Rialto Demo Senior Note 2027. Senior secured. Matures 2027-09-01.";
const BYTES = new TextEncoder().encode(BODY);
const HASH = keccak256(BYTES);

function serving(body: string | Uint8Array, init: { status?: number; length?: number } = {}) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return async () =>
    ({
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      headers: { get: (k: string) => (k.toLowerCase() === "content-length" ? String(init.length ?? bytes.byteLength) : null) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }) as unknown as Response;
}

const doc = (over: Partial<OnChainDocument> = {}): OnChainDocument => ({
  uri: "ipfs://bafyprospectus",
  hash: HASH,
  timestamp: 1_788_000_000n,
  ...over,
});

describe("fetchAndVerify", () => {
  it("accepts bytes that hash to what the security committed to", async () => {
    const r = await fetchAndVerify(doc(), { fetchImpl: serving(BODY) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hash).toBe(HASH);
      expect(r.text).toBe(BODY);
    }
  });

  /**
   * The line the whole design rests on. Bytes that do not hash to the committed
   * value are a different document, whatever they say inside.
   */
  it("refuses to reason on a document whose bytes were swapped", async () => {
    const swapped = BODY.replace("Senior secured", "Subordinated, unsecured");
    const r = await fetchAndVerify(doc(), { fetchImpl: serving(swapped) });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("hash-mismatch");
      expect(r.detail).toContain(HASH);
    }
  });

  it("refuses a single flipped byte", async () => {
    const almost = new Uint8Array(BYTES);
    almost[0] = (almost[0]! ^ 0x01) as number;
    const r = await fetchAndVerify(doc(), { fetchImpl: serving(almost) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("hash-mismatch");
  });

  it("treats an unset document as nothing to reason about", async () => {
    const r = await fetchAndVerify(doc({ hash: ZERO_HASH }), { fetchImpl: serving(BODY) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-document");

    const r2 = await fetchAndVerify(doc({ uri: "" }), { fetchImpl: serving(BODY) });
    expect(r2.ok).toBe(false);
  });

  /** Silence is a valid opinion: an unreachable document means no bid, not a crash. */
  it("returns a failure rather than throwing when the URI does not answer", async () => {
    const r = await fetchAndVerify(doc(), { fetchImpl: serving("nope", { status: 404 }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unreachable");

    const boom = async () => {
      throw new Error("connection reset");
    };
    const r2 = await fetchAndVerify(doc(), { fetchImpl: boom as unknown as typeof fetch });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.detail).toContain("connection reset");
  });

  /** Nothing a counterparty controls decides how much memory we spend. */
  it("refuses an oversized document before reading it", async () => {
    const r = await fetchAndVerify(doc(), { fetchImpl: serving(BODY, { length: 999_999_999 }), maxBytes: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too-large");
  });

  it("still catches an oversized body that lied about its length", async () => {
    const big = new Uint8Array(4096);
    const r = await fetchAndVerify(doc(), { fetchImpl: serving(big, { length: 10 }), maxBytes: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too-large");
  });
});

describe("defaultResolveUri", () => {
  it("sends ipfs:// through a gateway and leaves http alone", () => {
    expect(defaultResolveUri("ipfs://abc")).toBe("https://ipfs.io/ipfs/abc");
    expect(defaultResolveUri("https://example.com/p.pdf")).toBe("https://example.com/p.pdf");
  });
});
