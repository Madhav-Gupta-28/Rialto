import { describe, it, expect, vi } from "vitest";
import { keccak256 } from "viem";
import { fetchAndVerify, type OnChainDocument } from "../src/document.js";

const BODY = "Acme Holdings Limited. Senior secured note. Matures 2027-09-01.";
const HASH = keccak256(new TextEncoder().encode(BODY));

const doc = (uri: string): OnChainDocument => ({ uri, hash: HASH, timestamp: 1n });

function respond(body: string | Uint8Array, headers: Record<string, string> = {}) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    body: null,
  } as unknown as Response;
}

describe("the document URI is chosen by the counterparty", () => {
  /**
   * The URI is read off the security, so the issuer picks it. An agent that
   * fetches it unconditionally will happily probe whatever the issuer names,
   * including addresses only reachable from inside the network the agent runs
   * in — cloud metadata, a local RPC node, an internal admin page.
   *
   * The hash check means nothing useful comes back. The request still goes out,
   * and the difference between a refused connection and a slow one is already a
   * signal worth having.
   */
  it("refuses to fetch loopback, private and link-local addresses", async () => {
    const hostile = [
      "http://127.0.0.1:8545",
      "http://localhost:8545/",
      "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
      "http://10.0.0.5/internal",
      "http://192.168.1.1/admin",
      "http://172.16.0.9/",
      "http://[::1]:8545/",
      "http://0.0.0.0/",
    ];

    for (const uri of hostile) {
      const fetchImpl = vi.fn(async () => respond(BODY));
      const r = await fetchAndVerify(doc(uri), { fetchImpl: fetchImpl as unknown as typeof fetch });

      expect(r.ok, `${uri} must not be fetched`).toBe(false);
      expect(fetchImpl, `${uri} must not reach the network at all`).not.toHaveBeenCalled();
    }
  });

  it("still allows an ordinary public URL", async () => {
    const fetchImpl = vi.fn(async () => respond(BODY));
    const r = await fetchAndVerify(doc("https://example.com/p.txt"), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("refuses a scheme that is not http or https", async () => {
    const fetchImpl = vi.fn(async () => respond(BODY));
    for (const uri of ["file:///etc/passwd", "ftp://example.com/p", "data:text/plain,hello"]) {
      const r = await fetchAndVerify(doc(uri), { fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(r.ok, uri).toBe(false);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("a document served by a hostile issuer", () => {
  /**
   * The size cap is only useful if it stops the read. Checking `byteLength`
   * after `arrayBuffer()` has already buffered the whole response means a
   * server that omits content-length, or lies about it, can make the agent
   * allocate without limit before the check runs.
   */
  it("stops reading once the cap is passed, rather than buffering everything first", async () => {
    let produced = 0;
    const chunk = new Uint8Array(64 * 1024);

    const streaming = {
      ok: true,
      status: 200,
      headers: { get: () => null }, // no content-length
      body: {
        getReader() {
          return {
            async read() {
              produced += chunk.byteLength;
              if (produced > 8 * 1024 * 1024) return { done: true, value: undefined };
              return { done: false, value: chunk };
            },
            cancel: async () => {},
            releaseLock: () => {},
          };
        },
      },
      arrayBuffer: async () => {
        produced = 8 * 1024 * 1024;
        return new ArrayBuffer(produced);
      },
    } as unknown as Response;

    const r = await fetchAndVerify(doc("https://example.com/huge"), {
      fetchImpl: (async () => streaming) as unknown as typeof fetch,
      maxBytes: 256 * 1024,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too-large");
    expect(produced, "must not read far past the cap").toBeLessThan(2 * 1024 * 1024);
  });
});

describe("submitting a bid", () => {
  /**
   * Waiting for a receipt is not the same as checking it. A reverted
   * transaction still produces one, so an agent that only waits will report a
   * bid it never placed — after having already published reasoning for it.
   */
  it("treats a reverted transaction as a failure, not a bid", async () => {
    process.env.MARKET_ADDRESS = "0x00000000000000000000000000000000000000aa";
    process.env.MANDATES_ADDRESS = "0x00000000000000000000000000000000000000bb";
    const { submitBid } = await import("../src/chain.js");

    const chain = {
      account: { address: "0x00000000000000000000000000000000000000cc" },
      wallet: { writeContract: async () => "0xdead" },
      pub: { waitForTransactionReceipt: async () => ({ status: "reverted" }) },
    } as never;

    await expect(submitBid(chain, 1n, 100n, `0x${"11".repeat(32)}`)).rejects.toThrow(/reverted/);
  });

  it("returns the hash when it succeeded", async () => {
    process.env.MARKET_ADDRESS = "0x00000000000000000000000000000000000000aa";
    process.env.MANDATES_ADDRESS = "0x00000000000000000000000000000000000000bb";
    const { submitBid } = await import("../src/chain.js");

    const chain = {
      account: { address: "0x00000000000000000000000000000000000000cc" },
      wallet: { writeContract: async () => "0xbeef" },
      pub: { waitForTransactionReceipt: async () => ({ status: "success" }) },
    } as never;

    expect(await submitBid(chain, 1n, 100n, `0x${"11".repeat(32)}`)).toBe("0xbeef");
  });
});
