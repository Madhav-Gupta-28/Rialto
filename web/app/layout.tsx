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
              Hedera testnet. The instrument is a demonstration bond issued through Asset Tokenization
              Studio; it represents no real company and is not an offer of securities.
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
