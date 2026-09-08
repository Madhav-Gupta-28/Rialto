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
 * The row holds its height before its figures arrive. Twenty-one rows each
 * making three calls is eighty-four round trips resolving in whatever order the
 * network returns them, and a row that renders nothing until it is complete
 * makes the table assemble itself in fragments while the page grows. Reserving
 * the space turns that into figures filling in place, which is what is actually
 * happening.
 *
 * The whole row is the link — a nine-column table where only a four-character
 * id is clickable makes the reader hunt. The id stays a real anchor so keyboard
 * and middle-click still work, and the row itself is focusable.
 */
export default function RequestRow({ id }: { id: bigint }) {
  const router = useRouter();
  const { data: r } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "get", args: [id] });
  const { data: best } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "bestBid", args: [id] });
  const { data: count } = useReadContract({ address: MARKET, abi: marketAbi, functionName: "bidCount", args: [id] });

  const href = `/request/${id}`;

  if (!r) {
    return (
      <tr className="row" aria-busy="true">
        <td><span className="skel" style={{ width: 26 }} /></td>
        <td><span className="skel" style={{ width: 76, height: "1.4em" }} /></td>
        <td className="fig"><span className="skel" style={{ width: 44 }} /></td>
        <td className="fig"><span className="skel" style={{ width: 44 }} /></td>
        <td><span className="skel" style={{ width: 24 }} /></td>
        <td className="fig"><span className="skel" style={{ width: 72 }} /></td>
        <td className="fig"><span className="skel" style={{ width: 40 }} /></td>
        <td className="fig"><span className="skel" style={{ width: 12 }} /></td>
        <td className="wide"><span className="skel" style={{ width: 92 }} /></td>
      </tr>
    );
  }

  const bid = best?.[2] ?? 0n;
  const hasBid = (best?.[0] ?? "0x0") !== "0x0000000000000000000000000000000000000000";
  const rate = hasBid && r.principal > 0n ? rateOf(r.principal, bid, r.term) : null;

  return (
    <tr
      className="row"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
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
      <td className="fig">
        {best === undefined ? (
          <span className="skel" style={{ width: 72 }} />
        ) : hasBid ? (
          units(bid, CASH_DECIMALS)
        ) : (
          <span className="sub">—</span>
        )}
      </td>
      <td className="fig">{rate !== null ? rateLabel(rate) : <span className="sub">—</span>}</td>
      <td className="fig">
        {count === undefined ? <span className="skel" style={{ width: 12 }} /> : count.toString()}
      </td>
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
