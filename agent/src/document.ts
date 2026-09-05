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
  | "blocked-uri" // the URI names something an agent must not fetch
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
  /** Follow at most this many redirects, revalidating the target of each. */
  maxRedirects?: number;
}

/**
 * The URI is chosen by the counterparty, so fetching it is an action taken on
 * their instruction. Anything only reachable from inside the network the agent
 * runs in is off limits: cloud metadata, a local RPC node, an internal admin
 * page. The hash check means nothing useful could come back, but the request
 * itself is the problem — it turns the agent into a probe.
 *
 * This is a literal check on the host as written, and it is honest about what
 * that does not cover: a public hostname whose DNS resolves to a private
 * address still passes. Closing that needs resolution before connecting and
 * pinning the address actually used, which belongs in the deployment's egress
 * policy rather than here.
 */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true;
  // fc00::/7 unique-local, fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;

  // An IPv4 address wearing an IPv6 coat. `::ffff:127.0.0.1` and
  // `::ffff:7f00:1` are the same address as `127.0.0.1`, and a resolver treats
  // them that way, so they have to be unwrapped before they are judged.
  const mapped = h.match(/^::ffff:(.+)$/);
  if (mapped) {
    const inner = mapped[1];
    const hexPair = inner.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    const asV4 = hexPair
      ? ((parseInt(hexPair[1], 16) << 16) | parseInt(hexPair[2], 16)) >>> 0
      : toIPv4(inner);
    if (asV4 !== null && isPrivateIPv4(asV4)) return true;
  }

  const v4 = toIPv4(h);
  if (v4 !== null && isPrivateIPv4(v4)) return true;

  return false;
}

/**
 * Parse every spelling of an IPv4 address a resolver accepts, not just the
 * dotted-quad one.
 *
 * `127.0.0.1`, `127.1`, `2130706433` and `0x7f000001` are the same host, and
 * `getaddrinfo` will happily connect to all four. A check that only recognises
 * the first is not a check — it is a speed bump with a documented bypass, and
 * the bypass is the whole attack: the counterparty picks the URI.
 *
 * Returns the address as a 32-bit number, or null when the string is not an
 * IPv4 literal in any form (an ordinary hostname, for instance).
 */
function toIPv4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const p of parts) {
    let v: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(p)) v = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) v = parseInt(p, 8);
    else if (/^(0|[1-9][0-9]*)$/.test(p)) v = parseInt(p, 10);
    else return null;
    if (!Number.isSafeInteger(v) || v < 0) return null;
    nums.push(v);
  }

  // The final part absorbs whatever octets were left unwritten: in `127.1` the
  // 1 is the low three bytes, not the second octet.
  const last = nums.pop();
  if (last === undefined) return null;
  if (nums.some((n) => n > 0xff)) return null;
  if (last >= 2 ** (8 * (4 - nums.length))) return null;

  let addr = last;
  for (let i = 0; i < nums.length; i++) addr += nums[i] * 2 ** (8 * (3 - i));
  return addr >>> 0;
}

/** The ranges an agent must never be made to reach out to. */
function isPrivateIPv4(addr: number): boolean {
  const a = (addr >>> 24) & 0xff;
  const b = (addr >>> 16) & 0xff;

  if (a === 0) return true; // 0.0.0.0/8, "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** Only http(s). Never file:, data:, ftp: or anything else a URL parser accepts. */
function checkUri(raw: string): { ok: true; url: URL } | { ok: false; detail: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, detail: `not a URL: ${raw}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, detail: `refusing scheme ${url.protocol}` };
  }
  if (isBlockedHost(url.hostname)) {
    return { ok: false, detail: `refusing to fetch a private or loopback address: ${url.hostname}` };
  }
  return { ok: true, url };
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
    maxRedirects = 3,
  } = opts;

  // An unset document reads as the zero hash. There is nothing to verify
  // against, so there is nothing to reason about.
  if (!doc.uri || doc.hash === ZERO_HASH) {
    return { ok: false, reason: "no-document", detail: "the security carries no document under that name" };
  }

  const checked = checkUri(resolveUri(doc.uri));
  if (!checked.ok) return { ok: false, reason: "blocked-uri", detail: checked.detail };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let bytes: Uint8Array;
  try {
    let target = checked.url;
    let res: Response | undefined;

    // Redirects are followed by hand so every hop is checked. Left to the
    // runtime, a public URL that redirects to 169.254.169.254 walks straight
    // past the check above.
    for (let hop = 0; ; hop++) {
      res = await fetchImpl(target.toString(), { signal: controller.signal, redirect: "manual" });

      if (res.status >= 300 && res.status < 400) {
        if (hop >= maxRedirects) return { ok: false, reason: "unreachable", detail: "too many redirects" };
        const location = res.headers?.get?.("location");
        if (!location) return { ok: false, reason: "unreachable", detail: `${res.status} with no location` };
        const next = checkUri(new URL(location, target).toString());
        if (!next.ok) return { ok: false, reason: "blocked-uri", detail: `redirect ${next.detail}` };
        target = next.url;
        continue;
      }
      break;
    }

    if (!res.ok) {
      return { ok: false, reason: "unreachable", detail: `${target.toString()} answered ${res.status}` };
    }

    const advertised = Number(res.headers?.get?.("content-length") ?? 0);
    if (advertised > maxBytes) {
      return { ok: false, reason: "too-large", detail: `${advertised} bytes exceeds the ${maxBytes} cap` };
    }

    const read = await readCapped(res, maxBytes);
    if (!read.ok) return { ok: false, reason: "too-large", detail: read.detail };
    bytes = read.bytes;
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

/**
 * Read a body, stopping as soon as it passes the cap.
 *
 * `arrayBuffer()` buffers the whole response before anything can be measured,
 * so a server that omits content-length — or lies about it — decides how much
 * memory the agent spends. Streaming makes the cap mean what it says.
 */
async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; detail: string }> {
  const reader = res.body?.getReader?.();

  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) return { ok: false, detail: `body exceeds the ${maxBytes} cap` };
    return { ok: true, bytes: buf };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, detail: `body exceeds the ${maxBytes} cap` };
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, bytes: out };
}
