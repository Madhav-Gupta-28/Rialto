/**
 * Headers a page that asks people to sign transactions ought to be sending.
 *
 * The one that matters most is framing. A dapp inside somebody else's iframe is
 * how a signature gets taken from a user who thought they were pressing
 * something else, and nothing in the application can tell that it is happening —
 * only the browser can, and only if it is told. `frame-ancestors` is the modern
 * instruction and `X-Frame-Options` is the one older browsers obey, so both.
 *
 * `base-uri` and `form-action` close the two ways an injected tag can redirect
 * the page's own traffic; `object-src` closes plugins.
 *
 * Deliberately absent: `script-src` and `connect-src`. Next inlines its
 * hydration payload, so a script policy here would have to carry
 * `unsafe-inline`, which buys close to nothing over what React's escaping
 * already does — and this page fetches offering documents from addresses
 * issuers choose, so a connect policy strict enough to be worth writing is one
 * that breaks the document check. Both are stated rather than silently omitted.
 */
const headers = [
  {
    key: "Content-Security-Policy",
    value: ["base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'"].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a document served as text/plain being sniffed into something executable.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // HashScan and the mirror node get the origin, never the path — a request id
  // is not theirs to collect.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here is a camera, a microphone or a payment sheet.
  {
    key: "Permissions-Policy",
    value: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  },
];

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers }];
  },
};
