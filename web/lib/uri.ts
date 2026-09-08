/**
 * The offering document's location is written by the issuer, into a contract
 * anybody can deploy — so it is a stranger's string, and this page does two
 * dangerous things with it: it fetches it, and it renders it as a link.
 *
 * `javascript:` is the one that matters. A security whose document URI reads
 * `javascript:…` becomes a script that runs in the reader's page, with their
 * wallet already connected, the moment they click "the file". React escapes the
 * text it renders; it does not vet the scheme of an href, so nothing else in
 * this app was going to stop that.
 *
 * The rest are quieter. `data:` and `blob:` are markup of the issuer's choosing
 * loaded into a tab that trusts it. `file:` reaches for the reader's own disk.
 * A relative path resolves against Rialto's own origin, so the document check
 * would hash one of our pages and report on it as though it were the bond's
 * paperwork.
 *
 * Two schemes are fetchable and linkable. Everything else is refused by name,
 * because an underwriter should be told the document could not be checked
 * rather than shown a check that quietly did not happen.
 */

export type SafeUri = { ok: true; url: string } | { ok: false; why: string };

const ALLOWED = new Set(["http:", "https:"]);

export function documentUri(raw: string | undefined): SafeUri {
  if (!raw || raw.trim() === "") return { ok: false, why: "the security names no document" };

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    // No scheme at all. Resolving it would point at this site rather than at
    // the issuer's, which is worse than refusing it.
    return { ok: false, why: "not an absolute address" };
  }

  if (!ALLOWED.has(parsed.protocol)) {
    return { ok: false, why: `${parsed.protocol.replace(":", "")} is not a scheme this page will open` };
  }

  return { ok: true, url: parsed.toString() };
}
