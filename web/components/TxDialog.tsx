"use client";

import { useEffect } from "react";
import { useWaitForTransactionReceipt } from "wagmi";
import type { Hex } from "viem";
import { explainRevert, isRejection } from "@/lib/reverts";

/**
 * What happened to the transaction, said out loud.
 *
 * Three things this is careful about.
 *
 * A receipt arriving is not success — a revert produces one too, and the agent
 * shipped with exactly that bug once. Nothing here says settled until the
 * receipt says `success`.
 *
 * A custom error reaches the browser as four bytes. Showing `0x8814cafb` is
 * showing the user the work rather than the answer, so it is decoded, and the
 * selector kept in small type for anyone reading a receipt later.
 *
 * And declining in a wallet is not a failure. It closes quietly.
 */
export default function TxDialog({
  hash,
  error,
  action,
  done,
  onClose,
}: {
  hash?: Hex;
  error?: Error | null;
  /** What the user asked for — "Open the request", "Repay". */
  action: string;
  /** What is true now that it worked. One sentence. */
  done?: string;
  onClose?: () => void;
}) {
  const { data: receipt, isLoading } = useWaitForTransactionReceipt({ hash });

  const rejected = isRejection(error);
  const open = !!hash || (!!error && !rejected);

  // Escape closes, but only once the outcome is known — dismissing a pending
  // transaction would suggest it had been called off, and it has not been.
  const settled = !!error || (!!receipt && !isLoading);
  useEffect(() => {
    if (!open || !settled || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, settled, onClose]);

  if (!open) return null;

  const reverted = receipt?.status === "reverted";
  const failed = !!error || reverted;
  const why = explainRevert(error) ?? (reverted ? explainRevert(receipt) : null);

  const tone = failed ? "bad" : receipt ? "ok" : "";
  const label = failed ? "Refused" : receipt ? "Settled" : "Sent";

  return (
    <div
      className="scrim"
      onClick={() => settled && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-label={`${action} — ${label}`}
    >
      <div className={`dialog ${tone}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="t">{action}</span>
          <span style={{ marginLeft: "auto" }}>
            {failed ? (
              <span className="state blocked">refused</span>
            ) : receipt ? (
              <span className="state settled">settled</span>
            ) : (
              <span className="state pending">awaiting consensus</span>
            )}
          </span>
        </header>

        <div className="body">
          {!failed && !receipt && (
            <>
              <h3>Sent to the network.</h3>
              <p>
                Hedera reaches consensus in a few seconds. Nothing is certain until it does, so this will
                not say settled before then.
              </p>
              <p className="waiting" aria-hidden="true"><i /><i /><i /></p>
            </>
          )}

          {receipt && !reverted && (
            <>
              <h3>Done.</h3>
              <p>{done ?? "The transaction settled on Hedera."}</p>
            </>
          )}

          {failed && (
            <>
              <h3>{why ? why.says : "The network refused this."}</h3>
              {why?.fix && <p>{why.fix}</p>}
              {!why && (
                <p>
                  {trim(error?.message ?? "It reverted on chain, and gave no reason this interface knows how to read.")}
                </p>
              )}
              {why && (
                <div className="why">
                  <span className="sel">{why.name} · reverted on chain</span>
                </div>
              )}
            </>
          )}
        </div>

        <footer>
          {hash ? (
            <a
              href={`https://hashscan.io/testnet/transaction/${hash}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: "var(--mono)", fontSize: 12 }}
            >
              View on HashScan ↗
            </a>
          ) : (
            <span />
          )}
          <button className="btn ghost sm" onClick={() => onClose?.()} disabled={!settled}>
            {settled ? "Close" : "Waiting…"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** A wallet error arrives with a wall of context. The first line is the useful part. */
function trim(m: string): string {
  const line = m.split("\n").find((l) => l.trim().length > 0) ?? m;
  return line.length > 220 ? `${line.slice(0, 220)}…` : line;
}
