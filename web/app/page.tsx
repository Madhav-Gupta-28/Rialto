"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { marketAbi } from "@/lib/abi";
import { MARKET, BOND, hashscan } from "@/lib/chain";
import RequestRow from "@/components/RequestRow";

export default function Market() {
  const { data: count, isLoading } = useReadContract({
    address: MARKET,
    abi: marketAbi,
    functionName: "requests",
  });

  const n = Number(count ?? 0n);
  const ids = Array.from({ length: n }, (_, i) => BigInt(n - 1 - i)); // newest first

  return (
    <>
      <section className="first">
        <div className="wrap">
          <p className="eyebrow">Hedera · Asset Tokenization Studio</p>
          <h1 className="display">
            An underwriting market for
            <br />
            tokenized securities.
          </h1>
          <p className="lede">
            A holder of a tokenized bond needs cash for thirty days. Today the only options are to sell
            the asset or to find a bank. Rialto is the third: post the security, publish its offering
            document, and let underwriters compete to fund you.
          </p>
          <div style={{ marginTop: 26, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/borrow">
              Raise cash against a security
            </Link>
            <Link className="btn ghost" href="/mandate">
              Underwrite
            </Link>
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="grid two">
            <div className="card">
              <p className="eyebrow">There is no price feed</p>
              <p className="lede" style={{ fontSize: 15 }}>
                Search the contract for one. An illiquid security has no price to read — its risk lives in
                the offering document. Underwriters read that document and bid their own capital behind an
                opinion. Every branch after award depends only on time and on whether the money arrived.
              </p>
            </div>
            <div className="card">
              <p className="eyebrow">Two endings, no liquidator</p>
              <p className="lede" style={{ fontSize: 15 }}>
                Repay and the collateral goes home. Miss the date and it goes to the lender. No auction, no
                margin call, no partial outcome — the haircut agreed at award is the lender&apos;s whole
                protection, which is why it is theirs to choose.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 8 }}>
        <div className="wrap">
          <h2 className="h">Requests</h2>
          <p className="sub" style={{ marginBottom: 18 }}>
            Live from{" "}
            <a href={hashscan(MARKET)} target="_blank" rel="noreferrer">
              the market contract
            </a>{" "}
            on Hedera testnet. Collateral is{" "}
            <a href={hashscan(BOND)} target="_blank" rel="noreferrer">
              RDN27
            </a>
            , a bond issued through the live ATS factory.
          </p>

          {isLoading ? (
            <p className="empty">Reading the chain…</p>
          ) : n === 0 ? (
            <p className="empty">No requests yet. Open the first one.</p>
          ) : (
            <table className="rows">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Status</th>
                  <th>Principal</th>
                  <th>Collateral</th>
                  <th>Term</th>
                  <th>Best bid</th>
                  <th>Rate</th>
                  <th>Bids</th>
                  <th>Borrower</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id) => (
                  <RequestRow key={id.toString()} id={id} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
