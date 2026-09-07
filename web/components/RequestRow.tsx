"use client";

import { useRouter } from "next/navigation";
import { useReadContract } from "wagmi";
import { marketAbi } from "@/lib/abi";
import { MARKET, CASH_DECIMALS, BOND_DECIMALS } from "@/lib/chain";
import { units, duration, rateLabel, short } from "@/lib/format";
import StatusPill from "./Status";
import Copy from "./Copy";

/**
 * One loan, as a row.
 *
 * The whole row is the link — a nine-column table where only the id is
 * clickable makes the reader hunt for a four-character target. Keyboard users
 * get the same thing through the id, which stays a real anchor.
 */
export default function RequestRow({ id }: { id: bigint }) {
  const router = useRouter();
  const { data: r } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "get", args: [id] });
  const { data: best } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "bestBid", args: [id] });
  const { data: count } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "bidCount", args: [id] });

  if (!r) return null;
  const href = `/request/${id}`;
  const bid = best?.[2] ?? 0n;
  const hasBid = (best?.[0] ?? "0x0") !== "0x0000000000000000000000000000000000000000";
  const rate = hasBid && r.principal > 0n ? rateOf(r.principal, bid, r.term) : null;

  return (
    <tr className="row" onClick={() => router.push(href)}>
      <td>
        <a href={href} onClick={(e) => e.stopPropagation()} style={{ fontFamily: "var(--mono)" }}>
          #{id.toString()}
        </a>
        <span className="go">→</span>
      </td>
      <td>
        <StatusPill status={r.status} />
      </td>
      <td className="fig">{units(r.principal, CASH_DECIMALS)}</td>
      <td className="fig">{units(r.collateralAmount, BOND_DECIMALS, 0)}</td>
      <td>{duration(r.term)}</td>
      <td className="fig">{hasBid ? units(bid, CASH_DECIMALS) : <span className="sub">—</span>}</td>
      <td className="fig">{rate !== null ? rateLabel(rate) : <span className="sub">—</span>}</td>
      <td className="fig">{(count ?? 0n).toString()}</td>
      <td className="wide">
        <Copy value={r.borrower} label={short(r.borrower)} />
      </td>
    </tr>
  );
}

/** Mirrors RialtoMarket.rateBps so a row does not need a chain call to show it. */
function rateOf(principal: bigint, repay: bigint, term: bigint): number {
  if (repay <= principal || principal === 0n || term === 0n) return 0;
  const v = ((repay - principal) * 10_000n * 31_536_000n) / (principal * term);
  return v > 65535n ? 65535 : Number(v);
}
