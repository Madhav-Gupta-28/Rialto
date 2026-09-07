"use client";

import { useReadContract } from "wagmi";
import { marketAbi } from "@/lib/abi";
import { MARKET, BOND, hashscan } from "@/lib/chain";
import RequestRow from "@/components/RequestRow";

/** Every loan the contract has ever held, read straight from it. */
export default function MarketPage() {
  const { data: count, isLoading } = useReadContract({
    address: MARKET,
    abi: marketAbi,
    functionName: "requests",
  });

  const n = Number(count ?? 0n);
  const ids = Array.from({ length: n }, (_, i) => BigInt(n - 1 - i)); // newest first

  return (
    <section className="band void" style={{ paddingTop: 104, borderBottom: "none" }}>
      <div className="wrap">
        <p className="eyebrow">The market</p>
        <h1 className="claim" style={{ fontSize: "clamp(28px,4vw,46px)" }}>
          {isLoading ? "Reading the chain…" : `${n} loans, live from the contract.`}
        </h1>
        <p className="sub" style={{ maxWidth: "54ch" }}>
          No backend and no indexer — every figure below is a contract call made by your browser. Collateral
          is <a href={hashscan(BOND)} target="_blank" rel="noreferrer">RDN27</a>, a bond issued through the
          live ATS factory.
        </p>

        {isLoading ? (
          <p className="empty">Reading the chain…</p>
        ) : n === 0 ? (
          <p className="empty">No requests yet. Open the first one.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 30 }}>
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
                  <th className="wide">Borrower</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id) => (
                  <RequestRow key={id.toString()} id={id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
