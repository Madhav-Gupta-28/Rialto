"use client";

import { useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { marketAbi } from "@/lib/abi";
import { MARKET, BOND, CASH_DECIMALS, hashscan } from "@/lib/chain";
import { units } from "@/lib/format";
import type { Loan, BestBid } from "@/lib/market";
import RequestRow, { SkeletonRow } from "@/components/RequestRow";
import Live from "@/components/Live";

/**
 * Every loan the contract has ever held.
 *
 * One read for the whole page. The table asks for the loan, its best bid and
 * its bid count in a single batched call, and hands each row its own slice —
 * so the tally above the table and the figures underneath it come from the
 * same answer and cannot drift apart, and nothing is fetched twice.
 */
export default function MarketPage() {
  const { data: count, isLoading: countLoading } = useReadContract({
    address: MARKET,
    abi: marketAbi,
    functionName: "requests",
  });

  const n = Number(count ?? 0n);

  // Three reads per loan, in the order the results come back: get, bestBid,
  // bidCount, repeating. Built once per count rather than on every render, so
  // the query key stays stable and the answer is not thrown away and refetched
  // every time the clock beside the table ticks.
  const contracts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const id = BigInt(i);
        return [
          { address: MARKET, abi: marketAbi, functionName: "get", args: [id] },
          { address: MARKET, abi: marketAbi, functionName: "bestBid", args: [id] },
          { address: MARKET, abi: marketAbi, functionName: "bidCount", args: [id] },
        ] as const;
      }).flat(),
    [n],
  );

  const { data: rows, isLoading: rowsLoading } = useReadContracts({
    contracts,
    query: { enabled: n > 0 },
  });

  const at = (i: number, slot: 0 | 1 | 2) => {
    const cell = rows?.[i * 3 + slot];
    return cell?.status === "success" ? cell.result : undefined;
  };

  const loans = Array.from({ length: n }, (_, i) => at(i, 0) as Loan | undefined);
  const bests = Array.from({ length: n }, (_, i) => at(i, 1) as BestBid | undefined);
  const counts = Array.from({ length: n }, (_, i) => at(i, 2) as bigint | undefined);

  // When the last figure on this page actually came off the chain.
  const [readAt, setReadAt] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (rows) setReadAt(Date.now());
  }, [rows]);

  let live = 0;
  let settled = 0;
  let lent = 0n;
  for (const loan of loans) {
    if (!loan) continue;
    if (loan.status === 1) live += 1;
    if (loan.status === 1 || loan.status === 2 || loan.status === 3) {
      settled += loan.status === 1 ? 0 : 1;
      lent += loan.principal;
    }
  }

  const loading = countLoading || (n > 0 && rowsLoading);
  const ids = Array.from({ length: n }, (_, i) => n - 1 - i); // newest first

  return (
    <section className="band" style={{ paddingTop: 96, borderBottom: "none" }}>
      <div className="wrap">
        <h1 className="claim" style={{ fontSize: "clamp(38px,6vw,68px)" }}>The market.</h1>
        <p className="lede" style={{ maxWidth: "48ch", marginTop: 16 }}>
          Collateral is <a href={hashscan(BOND)} target="_blank" rel="noreferrer">RDN27</a>, a bond issued
          through the live ATS factory.
        </p>
        <p style={{ marginTop: 14 }}>
          <Live at={readAt} />
        </p>

        {!loading && n > 0 && (
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

        {loading ? (
          <div style={{ overflowX: "auto", marginTop: 24 }} aria-busy="true">
            <table className="rows">
              <tbody>
                {Array.from({ length: Math.min(Math.max(n, 8), 21) }, (_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </tbody>
            </table>
          </div>
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
                {ids.map((i) => (
                  <RequestRow
                    key={i}
                    id={BigInt(i)}
                    loan={loans[i]}
                    best={bests[i]}
                    bids={counts[i]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="sub" style={{ marginTop: 22, fontSize: 13, maxWidth: "76ch" }}>
          Terms are short because these are testnet loans run end to end rather than left open, and the
          cancelled ones are requests nobody bid on. A rate reading <em>over 655%</em> is a thirty-minute
          fee annualised past the ceiling the contract can store — the fee itself is a fraction of a cent.
        </p>
      </div>
    </section>
  );
}
