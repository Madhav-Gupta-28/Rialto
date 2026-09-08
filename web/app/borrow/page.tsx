"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useWrite } from "@/lib/useWrite";
import { amount, term as parseTerm, seconds as parseSeconds, type TermUnit } from "@/lib/amount";
import { maxUint256, stringToHex, type Hex } from "viem";
import { marketAbi, securityAbi } from "@/lib/abi";
import { MARKET, BOND, CASH, CASH_DECIMALS, BOND_DECIMALS, MAX_TERM_SECONDS, hashscan } from "@/lib/chain";
import { units } from "@/lib/format";
import TxDialog from "@/components/TxDialog";

const PROSPECTUS = stringToHex("prospectus", { size: 32 });
const ZERO32 = `0x${"00".repeat(32)}` as Hex;

export default function Borrow() {
  const { address, isConnected } = useAccount();
  const { write, data: hash, error, isPending, reset } = useWrite();
  const [action, setAction] = useState<{ label: string; done: string }>({ label: "", done: "" });

  const [collateral, setCollateral] = useState("10500");
  const [principal, setPrincipal] = useState("10000");
  const [length, setLength] = useState("30");
  const [unit, setUnit] = useState<TermUnit>("days");
  // Not `window`. A local of that name shadows the global inside this whole
  // component, so any later `window.matchMedia` here would read a string and
  // throw — and it would look correct on the page it was written on.
  const [bidWindow, setBidWindow] = useState("300");

  const { data: balance } = useReadContract({
    address: BOND, abi: securityAbi, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: allowance } = useReadContract({
    address: BOND, abi: securityAbi, functionName: "allowance",
    args: address ? [address, MARKET] : undefined, query: { enabled: !!address },
  });
  const { data: listed } = useReadContract({
    address: BOND, abi: securityAbi, functionName: "isInControlList",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });

  // Each field is validated once and the result drives the hint, the disabled
  // state and the argument, so they cannot drift apart.
  const c = amount(collateral, BOND_DECIMALS);
  const pr = amount(principal, CASH_DECIMALS);
  const t = parseTerm(length, unit, MAX_TERM_SECONDS);
  const w = parseSeconds(bidWindow, 60, 604_800);

  const wanted = c.ok ? c.value : 0n;
  const needsApproval = (allowance ?? 0n) < wanted || wanted === 0n;
  const enough = c.ok && (balance ?? 0n) >= c.value;
  const valid = enough && pr.ok && t.ok && w.ok;

  // The ratio the borrower is proposing. There is no price feed anywhere in
  // this project, so this is not a loan-to-value — it is units of a security
  // against units of cash, and it is the entire protection the lender gets.
  const proposal = c.ok && pr.ok && pr.value > 0n
    ? {
        ratio: Number((c.value * 10_000n) / (pr.value * 10n ** BigInt(BOND_DECIMALS - CASH_DECIMALS))) / 10_000,
        pledged: units(c.value, BOND_DECIMALS, 0),
        sought: units(pr.value, CASH_DECIMALS),
      }
    : null;

  return (
    <>
      <section className="band" style={{ paddingTop: 100, paddingBottom: 44, borderBottom: "none" }}>
        <div className="wrap narrow">
          <h1 className="claim" style={{ fontSize: "clamp(34px,5vw,56px)" }}>Borrow.</h1>
          <p className="lede" style={{ maxWidth: "44ch", marginTop: 14 }}>
            Lock your bond, say how much you want and for how long. Lenders bid, and the cheapest one
            wins.
          </p>
        </div>
      </section>

    <section style={{ paddingTop: 40 }}>
      <div className="wrap narrow">
        <div className="panel" style={{ marginBottom: 6 }}>
          <div className="head">
            <p className="eyebrow" style={{ margin: 0 }}>Your bond</p>
            <a className="sub" href={hashscan(BOND)} target="_blank" rel="noreferrer"
               style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>
              RDN27 ↗
            </a>
          </div>
          <div className="body" style={{ padding: "14px 20px", display: "flex", gap: 26, flexWrap: "wrap",
                                         alignItems: "center", fontFamily: "var(--mono)", fontSize: 13 }}>
            <span>
              <span style={{ color: "var(--muted)" }}>you hold </span>
              {balance !== undefined ? `${units(balance, BOND_DECIMALS, 0)}` : "—"}
            </span>
            <span>
              {listed === undefined ? null : listed
                ? <span className="state settled">admitted</span>
                : <span className="state blocked">not listed</span>}
            </span>
            {isConnected && (
              <span>
                {needsApproval
                  ? <span className="state pending">approval needed</span>
                  : <span className="state settled">escrow approved</span>}
              </span>
            )}
          </div>
        </div>

        <div className="card">
          <div className="fieldset" style={{ marginTop: 4 }}>
            <p className="lab">
              <span>What you are pledging</span>
              <span>{proposal ? `${proposal.ratio.toFixed(2)}× cover` : ""}</span>
            </p>
            <div className="grid two">
              <Field name="Bond to lock (RDN27)" value={collateral} onChange={setCollateral} problem={c.ok ? undefined : c.why} />
              <Field name="Cash you want (dUSD)" value={principal} onChange={setPrincipal} problem={pr.ok ? undefined : pr.why} />
            </div>
          </div>

          <div className="fieldset">
            <p className="lab">
              <span>How long</span>
              {/* The contract takes anything from a second to sixty days. Only
                  this form ever rounded to whole days, and that put the ending
                  nobody sends a transaction for beyond the reach of anyone with
                  an afternoon to spend looking at it. */}
              <span className="units">
                {(["days", "minutes"] as const).map((u) => (
                  <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>
                    {u}
                  </button>
                ))}
              </span>
            </p>
            <div className="grid two">
              <Field
                name={`Loan length (${unit})`}
                value={length}
                onChange={setLength}
                hint={unit === "days" ? "60 days maximum" : "short enough to watch Hedera close it itself"}
                problem={t.ok ? undefined : t.why}
              />
              <Field name="Bidding open for (seconds)" value={bidWindow} onChange={setBidWindow} hint="60 s to 7 days" problem={w.ok ? undefined : w.why} />
            </div>
          </div>

          {proposal && (
            <div className={`proposal${enough ? "" : " short"}`}>
              <Ratio value={proposal.ratio} />
              <p>
                {enough ? (
                  <>
                    You lock <strong>{proposal.pledged} RDN27</strong> to borrow{" "}
                    <strong>{proposal.sought} dUSD</strong>. Lock more and lenders bid you a better rate.
                  </>
                ) : (
                  <>
                    You only hold {units(balance ?? 0n, BOND_DECIMALS, 0)} RDN27 — not enough to lock{" "}
                    {proposal.pledged}.
                  </>
                )}
              </p>
            </div>
          )}

          <div className="actions">
          {!isConnected ? (
            <p className="sub">Connect a wallet to open a request.</p>
          ) : needsApproval ? (
            <button
              className="btn"
              disabled={isPending}
              onClick={() => {
                setAction({ label: "Approve the escrow", done: "The market can now take RDN27 into escrow when you open a request." });
                write({ address: BOND, abi: securityAbi, functionName: "approve", args: [MARKET, maxUint256] });
              }}
            >
              {isPending ? "Approving…" : "Let Rialto hold your bond"}
            </button>
          ) : (
            <button
              className="btn"
              disabled={isPending || !valid}
              onClick={() => {
                if (!(valid && c.ok && pr.ok && t.ok && w.ok)) return;
                setAction({ label: "Open the request", done: "Your collateral is escrowed and the auction is live. Underwriters can bid until it closes." });
                write({
                  address: MARKET,
                  abi: marketAbi,
                  functionName: "open",
                  args: [BOND, c.value, CASH, pr.value, t.value, w.value, PROSPECTUS, ZERO32],
                });
              }}
            >
              {isPending ? "Opening…" : "Ask for bids"}
            </button>
          )}
          </div>

          <p className="sub" style={{ textAlign: "center", fontSize: 12.5, marginTop: 16 }}>
            Lenders check the bond&rsquo;s paperwork against the issuer&rsquo;s own record before bidding.
          </p>

          <TxDialog hash={hash} error={error} action={action.label} done={action.done} onClose={reset} />
        </div>
      </div>
    </section>
    </>
  );
}

/**
 * The cover ratio, ticking to its new value as the fields change.
 *
 * It was already recalculating — it just did not look like it was, so it read
 * as a caption rather than as the one number the borrower controls.
 */
function Ratio({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / 260, 1);
      setShown(a + (value - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="big">{shown.toFixed(2)}×</span>;
}

function Field({
  name, value, onChange, hint, problem,
}: {
  name: string; value: string; onChange: (v: string) => void; hint?: string; problem?: string;
}) {
  return (
    <label className="field">
      <span className="name">{name}</span>
      <input
        className="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={problem ? { borderColor: "var(--bad)" } : undefined}
      />
      {problem ? <span className="hint" style={{ color: "var(--bad)" }}>{problem}</span>
        : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}
