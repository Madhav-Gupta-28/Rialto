"use client";

import { useRouter } from "next/navigation";
import { CASH_DECIMALS, BOND_DECIMALS } from "@/lib/chain";
import { units, duration, rateLabel, short } from "@/lib/format";
import { rateOf, ZERO_ADDRESS, type Loan, type BestBid } from "@/lib/market";
import StatusPill from "./Status";
import Copy from "./Copy";

/**
 * One loan, as a row.
 *
 * The row holds no chain call of its own. It used to make three, which meant
 * the market read every loan twice — once for the tally above the table, once
 * again here — and paid for twenty-one of those reads twice over. Everything it
 * needs now arrives as props from the one batched read the page already makes.
 *
 * It still holds its height before the figures arrive, because they arrive
 * together and a table that grows as they land makes the page jump under
 * whoever is reading it.
 *
 * The whole row is the link — a nine-column table where only a four-character
 * id is clickable makes the reader hunt. The id stays a real anchor so keyboard
 * and middle-click still work, and the row itself is focusable.
 */
export default function RequestRow({
  id,
  loan,
  best,
  bids,
}: {
  id: bigint;
  loan?: Loan;
  best?: BestBid;
  bids?: bigint;
}) {
  const router = useRouter();
  const href = `/request/${id}`;

  if (!loan) return <SkeletonRow />;

  const bid = best?.[2] ?? 0n;
  const hasBid = (best?.[0] ?? ZERO_ADDRESS) !== ZERO_ADDRESS;
  const rate = hasBid && loan.principal > 0n ? rateOf(loan.principal, bid, loan.term) : null;

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
        <StatusPill status={loan.status} />
      </td>
      <td className="fig">{units(loan.principal, CASH_DECIMALS)}</td>
      <td className="fig">{units(loan.collateralAmount, BOND_DECIMALS, 0)}</td>
      <td>{duration(loan.term)}</td>
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
        {bids === undefined ? <span className="skel" style={{ width: 12 }} /> : bids.toString()}
      </td>
      <td className="wide">
        <Copy value={loan.borrower} label={short(loan.borrower)} />
      </td>
    </tr>
  );
}

/** The row's shape before its figures exist, so the table is its full height at once. */
export function SkeletonRow() {
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
