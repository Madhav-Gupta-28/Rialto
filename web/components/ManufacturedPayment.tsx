"use client";

import { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { useWrite } from "@/lib/useWrite";
import { couponAbi, couponMarketAbi } from "@/lib/abi";
import { MARKET, CASH_DECIMALS, BOND_DECIMALS } from "@/lib/chain";
import { units, short } from "@/lib/format";
import { couponsInTerm, settlementLedger, type RawCoupon } from "@/lib/coupons";
import TxDialog from "./TxDialog";

/**
 * A coupon belongs to whoever holds the security on its record date, and while
 * a loan is live that is the escrow — not the borrower, who still owns the bond
 * and gets it back on repayment.
 *
 * This panel is that fact made visible. Repo settles it with a manufactured
 * payment from the collateral taker to the collateral giver, netted against the
 * repayment rather than wired separately, and none of that is legible from a
 * balance alone.
 */
export default function ManufacturedPayment({
  id,
  collateral,
  status,
  awardedAt,
  dueAt,
  agreed,
  lender,
  onDone,
}: {
  id: bigint;
  collateral: `0x${string}`;
  status: number;
  awardedAt: number;
  dueAt: number;
  agreed: bigint;
  lender: `0x${string}`;
  onDone: () => void;
}) {
  const { write, data: hash, error, isPending, reset } = useWrite();
  const [action, setAction] = useState<{ label: string; done: string }>({ label: "", done: "" });
  const { address } = useAccount();

  // `settleManufacturedPayment` pulls the cash from whoever sends it, and the
  // debt is the lender's — they hold the income the collateral earned. Anyone
  // else pressing this would be making the borrower a gift out of their own
  // pocket, so the button belongs to one account and says so to everybody else.
  const isLender = !!address && address.toLowerCase() === lender.toLowerCase();

  const { data: owed } = useReadContract({
    address: MARKET,
    abi: couponMarketAbi,
    functionName: "manufacturedOwed",
    args: [id],
    query: { refetchInterval: 15_000 },
  });

  const { data: count } = useReadContract({
    address: collateral,
    abi: couponAbi,
    functionName: "getCouponCount",
  });

  const n = Number(count ?? 0n);

  // The security's coupons are read one at a time; there is no range query, and
  // ids start at one.
  const { data: coupons } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: collateral,
      abi: couponAbi,
      functionName: "getCouponFor" as const,
      args: [BigInt(i + 1), MARKET] as const,
    })),
    query: { enabled: n > 0 },
  });

  const { data: recorded } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: MARKET,
      abi: couponMarketAbi,
      functionName: "couponRecorded" as const,
      args: [id, BigInt(i + 1)] as const,
    })),
    query: { enabled: n > 0 },
  });

  const inTerm = couponsInTerm(
    Array.from({ length: n }, (_, i) =>
      coupons?.[i]?.status === "success" ? (coupons[i].result as unknown as RawCoupon) : undefined,
    ),
    Array.from({ length: n }, (_, i) => recorded?.[i]?.result as boolean | undefined),
    awardedAt,
    dueAt,
  );

  const owedNow = owed ?? 0n;
  const settled = status === 2 || status === 3; // Repaid or Defaulted
  const nothingToShow = inTerm.length === 0 && owedNow === 0n;

  const send = (fn: "recordCoupon" | "scheduleCoupon", couponId: number) => {
    setAction(
      fn === "scheduleCoupon"
        ? {
            label: `Hand coupon #${couponId} to the network`,
            done: "Hedera will run this on the record date, whether or not anyone is watching. Nothing else is needed from you.",
          }
        : {
            label: `Record coupon #${couponId}`,
            done: "The amount comes from the security's own snapshot, so it is the same figure whoever records it.",
          },
    );
    write(
      { address: MARKET, abi: couponMarketAbi, functionName: fn, args: [id, BigInt(couponId)] },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="card">
      <p className="eyebrow">Income while pledged</p>

      {nothingToShow ? (
        <p className="sub">
          No coupon on this security has a record date inside the loan&rsquo;s term, so there is no
          manufactured payment to settle.
        </p>
      ) : (
        <>
          <p className="lede" style={{ fontSize: 14, marginBottom: 16 }}>
            While this loan is live the escrow is the holder of record, so the security credits{" "}
            <em>it</em> rather than the borrower. Under a repo the collateral taker owes that income
            back, and it is netted off the repayment rather than wired separately.
          </p>

          {inTerm.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {inTerm.map((c) => (
                <div key={c.couponId} className="coupon-row">
                  <div>
                    <p className="coupon-id">Coupon #{c.couponId}</p>
                    <p className="coupon-meta">
                      record date {new Date(c.recordDate * 1000).toISOString().replace("T", " ").slice(0, 19)}
                      {c.reached && c.snapshot > 0n && (
                        <> · escrow held {units(c.snapshot, BOND_DECIMALS, 0)} RDN27</>
                      )}
                    </p>
                  </div>
                  <div className="coupon-act">
                    {c.action === "none" ? (
                      <span className="tag ok">counted</span>
                    ) : c.action === "record" ? (
                      <button
                        className="btn ghost sm"
                        disabled={isPending}
                        onClick={() => send("recordCoupon", c.couponId)}
                      >
                        Record it
                      </button>
                    ) : (
                      <button
                        className="btn ghost sm"
                        disabled={isPending}
                        onClick={() => send("scheduleCoupon", c.couponId)}
                      >
                        Hand to the network
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <p className="hint" style={{ marginTop: 10 }}>
                Handing a coupon to the network books a scheduled call for its record date, so
                nobody has to be watching. Recording it by hand does the same thing afterwards, and
                anyone may — the answer is fixed by the security&rsquo;s own snapshot.
              </p>
            </div>
          )}

          {owedNow > 0n && (
            <>
              <div className="ledger">
                <div className="ledger-row">
                  <span>Agreed repayment</span>
                  <span className="figure">{units(agreed, CASH_DECIMALS)}</span>
                </div>
                <div className="ledger-row">
                  <span>Coupon owed to the borrower</span>
                  <span className="figure minus">&minus;{units(owedNow, CASH_DECIMALS)}</span>
                </div>
                <div className="ledger-row total">
                  <span>{settled ? "Outstanding" : "Borrower pays"}</span>
                  <span className="figure">
                    {settled
                      ? units(owedNow, CASH_DECIMALS)
                      : units(settlementLedger(agreed, owedNow).borrowerPays, CASH_DECIMALS)}
                  </span>
                </div>
              </div>

              {settled && (
                <>
                  <p className="note" style={{ margin: "14px 0 12px" }}>
                    This position has already settled, so there is nothing left to net against. The
                    lender still owes the income the collateral earned.{" "}
                    {isLender
                      ? "That is you."
                      : `It is owed by ${short(lender)}, and comes out of their pocket — not yours.`}
                  </p>
                  <button
                    className="btn"
                    disabled={isPending || !isLender}
                    onClick={() => {
                      setAction({
                        label: "Pay the manufactured payment",
                        done: "The income the collateral earned while it was pledged is back with the borrower. Nothing is outstanding on this position.",
                      });
                      write(
                        {
                          address: MARKET,
                          abi: couponMarketAbi,
                          functionName: "settleManufacturedPayment",
                          args: [id],
                        },
                        { onSuccess: onDone },
                      );
                    }}
                  >
                    {isLender ? "Pay the manufactured payment" : "Only the lender can pay this"}
                  </button>
                </>
              )}
            </>
          )}

          <TxDialog hash={hash} error={error} action={action.label} done={action.done} onClose={reset} />
        </>
      )}
    </div>
  );
}
