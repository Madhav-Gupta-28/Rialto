import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import Providers from "./providers";
import Nav from "@/components/Nav";
import "./globals.css";

/**
 * The one typeface, served from Rialto's own origin.
 *
 * It used to be two preconnects and a blocking stylesheet to fonts.googleapis,
 * which is a third-party round trip in front of the first paint and a request
 * to Google from the browser of everybody who opens the page. Next fetches the
 * file at build time and serves it from here, so neither happens.
 */
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  // Its own variable, not --serif. next/font puts its declaration on a class,
  // and a class and `:root` carry the same specificity — so the two would have
  // been decided by whichever stylesheet Next happened to emit second. This
  // way globals.css reads it rather than races it.
  variable: "--font-serif",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  title: "Rialto — underwriting market for tokenized securities",
  description:
    "Post a tokenized security, publish its offering document, and let underwriters compete to fund you. No price oracle anywhere.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
          <footer className="foot">
            <div className="wrap">
              <div className="row">
                <div>
                  <span className="mark">Rialto.</span>
                  <span className="built">Built on Hedera</span>
                </div>
                <nav>
                  <a href="/market">Market</a>
                  <a href="/how">How it works</a>
                  <a href="/borrow">Borrow</a>
                  <a href="/mandate">Underwrite</a>
                  <a href="https://github.com/Madhav-Gupta-28/Rialto" target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                  <a
                    href="https://hashscan.io/testnet/contract/0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Contract
                  </a>
                  <span className="ver">v1</span>
                </nav>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
