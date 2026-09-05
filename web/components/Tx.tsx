"use client";

import { useWaitForTransactionReceipt } from "wagmi";
import type { Hex } from "viem";

/**
 * Reports what actually happened to a transaction.
 *
 * A receipt arriving is not the same as the transaction succeeding — a revert
 * produces one too. The agent had this exact bug, so the interface does not
 * repeat it: nothing here says "done" until the receipt says `success`.
 */
export default function Tx({ hash, error }: { hash?: Hex; error?: Error | null }) {
  const { data, isLoading } = useWaitForTransactionReceipt({ hash });

  if (error) return <p className="err">{trim(error.message)}</p>;
  if (!hash) return null;
  if (isLoading) return <p className="sub">Waiting for consensus…</p>;
  if (data?.status === "reverted") return <p className="err">Reverted on chain — {hash}</p>;

  return (
    <p className="sub ok">
      Confirmed ·{" "}
      <a href={`https://hashscan.io/testnet/transaction/${hash}`} target="_blank" rel="noreferrer">
        view on HashScan
      </a>
    </p>
  );
}

/** Wallet errors arrive with a wall of context; the first line is the useful part. */
function trim(m: string): string {
  const line = m.split("\n").find((l) => l.trim().length > 0) ?? m;
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}
