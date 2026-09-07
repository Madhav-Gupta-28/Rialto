"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { marketAbi } from "@/lib/abi";
import { MARKET, BOND, CASH_DECIMALS, hashscan } from "@/lib/chain";
import { units } from "@/lib/format";
import RequestRow from "@/components/RequestRow";

/**
 * Every loan the contract has ever held.
 *
 * The tally above the table is read the same way the rows are — one call per
 * request, straight from the chain — so the summary cannot drift from what is
 * underneath it.
 */
export default function MarketPage() {
  const { data: count, isLoading } = useReadContract({
    address: MARKET,
    abi: marketAbi,
    functionName: "requests",
  });

  const n = Number(count ?? 0n);
  const ids = Array.from({ length: n }, (_, i) => BigInt(n - 1 - i)); // newest first

  const { data: rows } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: MARKET,
      abi: marketAbi,
      functionName: "get" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: n > 0 },
  });

  let live = 0;
  let settled = 0;
  let lent = 0n;
  for (const row of rows ?? []) {
    if (row.status !== "success") continue;
    const r = row.result as { status: number; principal: bigint };
    if (r.status === 1) live += 1;
    if (r.status === 1 || r.status === 2 || r.status === 3) {
      settled += r.status === 1 ? 0 : 1;
      lent += r.principal;
    }
  }

  return (
    <section className="band" style={{ paddingTop: 96, borderBottom: "none" }}>
      <div className="wrap">
        <h1 className="claim" style={{ fontSize: "clamp(38px,6vw,68px)" }}>The market.</h1>
        <p className="lede" style={{ maxWidth: "48ch", marginTop: 16 }}>
          Collateral is <a href={hashscan(BOND)} target="_blank" rel="noreferrer">RDN27</a>, a bond issued
          through the live ATS factory.
        </p>

        {!isLoading && n > 0 && (
          <div className="tally">
            <div>
              <b>{n}</b>
              <span>loans</span>
            </div>
            <div>
              <b>{units(lent, CASH_DECIMALS, 0)}</b>
              <span>dUSD funded</span>
            </div>
            <div>
              <b>{settled}</b>
              <span>settled</span>
            </div>
            <div>
              <b>{live}</b>
              <span>live now</span>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="empty">Reading the chain…</p>
        ) : n === 0 ? (
          <p className="empty">No requests yet. Open the first one.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 24 }}>
            <table className="rows">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Status</th>
                  <th className="fig">Principal</th>
                  <th className="fig">Collateral</th>
                  <th>Term</th>
                  <th className="fig">Best bid</th>
                  <th className="fig">Rate</th>
                  <th className="fig">Bids</th>
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

        <p className="sub" style={{ marginTop: 22, fontSize: 13 }}>
          Every figure on this page is a contract call made by your browser. No backend, no indexer.
        </p>
      </div>
    </section>
  );
}
