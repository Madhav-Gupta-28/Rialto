"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { marketAbi } from "@/lib/abi";
import { MARKET, CASH_DECIMALS, BOND_DECIMALS } from "@/lib/chain";
import { units, duration, rateLabel, short } from "@/lib/format";
import StatusPill from "./Status";

export default function RequestRow({ id }: { id: bigint }) {
  const { data: r } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "get", args: [id] });
  const { data: best } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "bestBid", args: [id] });
  const { data: count } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "bidCount", args: [id] });

  if (!r) return null;
  const bid = best?.[2] ?? 0n;
  const hasBid = (best?.[0] ?? "0x0") !== "0x0000000000000000000000000000000000000000";
  const rate = hasBid && r.principal > 0n ? rateOf(r.principal, bid, r.term) : null;

  return (
    <tr>
      <td>
        <Link href={`/request/${id}`}>#{id.toString()}</Link>
      </td>
      <td>
        <StatusPill status={r.status} />
      </td>
      <td>{units(r.principal, CASH_DECIMALS)}</td>
      <td>{units(r.collateralAmount, BOND_DECIMALS, 0)}</td>
      <td>{duration(r.term)}</td>
      <td>{hasBid ? units(bid, CASH_DECIMALS) : <span className="sub">—</span>}</td>
      <td>{rate !== null ? rateLabel(rate) : <span className="sub">—</span>}</td>
      <td>{(count ?? 0n).toString()}</td>
      <td className="wide sub">{short(r.borrower)}</td>
    </tr>
  );
}

/** Mirrors RialtoMarket.rateBps so a row does not need a chain call to show it. */
function rateOf(principal: bigint, repay: bigint, term: bigint): number {
  if (repay <= principal || principal === 0n || term === 0n) return 0;
  const v = ((repay - principal) * 10_000n * 31_536_000n) / (principal * term);
  return v > 65535n ? 65535 : Number(v);
}
