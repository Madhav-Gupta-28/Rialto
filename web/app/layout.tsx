import type { Metadata } from "next";
import Providers from "./providers";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rialto — underwriting market for tokenized securities",
  description:
    "Post a tokenized security, publish its offering document, and let underwriters compete to fund you. No price oracle anywhere.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
          <footer className="foot">
            <div className="wrap">
              <div className="row">
                <span className="mark">Rialto.</span>
                <nav>
                  <a href="/">Market</a>
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
                </nav>
              </div>
              <div className="fine">
                <span>Built on Hedera · testnet</span>
                <span>v1</span>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
