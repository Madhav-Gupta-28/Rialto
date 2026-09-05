"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useWrite } from "@/lib/useWrite";
import { amount, days as parseDays, seconds as parseSeconds } from "@/lib/amount";
import { maxUint256, stringToHex, type Hex } from "viem";
import { marketAbi, securityAbi } from "@/lib/abi";
import { MARKET, BOND, CASH, CASH_DECIMALS, BOND_DECIMALS, hashscan } from "@/lib/chain";
import { units } from "@/lib/format";
import Tx from "@/components/Tx";

const PROSPECTUS = stringToHex("prospectus", { size: 32 });
const ZERO32 = `0x${"00".repeat(32)}` as Hex;

export default function Borrow() {
  const { address, isConnected } = useAccount();
  const { write, data: hash, error, isPending } = useWrite();

  const [collateral, setCollateral] = useState("10500");
  const [principal, setPrincipal] = useState("10000");
  const [days, setDays] = useState("30");
  const [window, setWindow] = useState("300");

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
  const t = parseDays(days, 60);
  const w = parseSeconds(window, 60, 604_800);

  const wanted = c.ok ? c.value : 0n;
  const needsApproval = (allowance ?? 0n) < wanted || wanted === 0n;
  const enough = c.ok && (balance ?? 0n) >= c.value;
  const valid = enough && pr.ok && t.ok && w.ok;

  return (
    <section className="first">
      <div className="wrap narrow">
        <p className="eyebrow">Borrower</p>
        <h1 className="display">Raise cash against a security.</h1>
        <p className="lede">
          You fix the principal, the term, and how much collateral you are pledging — which <em>is</em> the
          haircut you are proposing. Underwriters answer with a repayment. You never name a price.
        </p>

        <div className="card" style={{ marginTop: 30 }}>
          <p className="eyebrow">The instrument</p>
          <div className="kv">
            <span className="k">Collateral</span>
            <span className="v">
              <a href={hashscan(BOND)} target="_blank" rel="noreferrer">RDN27</a> · ATS security
            </span>
          </div>
          <div className="kv">
            <span className="k">Your balance</span>
            <span className="v">{balance !== undefined ? units(balance, BOND_DECIMALS, 0) : "—"}</span>
          </div>
          <div className="kv">
            <span className="k">On the control list</span>
            <span className="v">{listed === undefined ? "—" : listed ? "yes" : "no"}</span>
          </div>
          {listed === false && (
            <p className="note" style={{ marginTop: 12 }}>
              This security is permissioned. Until the issuer adds you to its control list you cannot hold
              or pledge it — the ERC-3643 constraint that makes ordinary AMMs incompatible with regulated
              assets.
            </p>
          )}
        </div>

        <div className="card">
          <p className="eyebrow">Your request</p>

          <div className="grid two">
            <Field name="Collateral to pledge (RDN27)" value={collateral} onChange={setCollateral} problem={c.ok ? undefined : c.why} />
            <Field name="Principal sought (dUSD)" value={principal} onChange={setPrincipal} problem={pr.ok ? undefined : pr.why} />
            <Field name="Term (days)" value={days} onChange={setDays} hint="60 days maximum" problem={t.ok ? undefined : t.why} />
            <Field name="Auction length (seconds)" value={window} onChange={setWindow} hint="60 s to 7 days" problem={w.ok ? undefined : w.why} />
          </div>

          <p className="note" style={{ margin: "6px 0 18px" }}>
            The document hash is read off the security itself, not taken on your word. That is what binds a
            bid to the bytes the issuer published.
          </p>

          {!isConnected ? (
            <p className="sub">Connect a wallet to open a request.</p>
          ) : needsApproval ? (
            <button
              className="btn"
              disabled={isPending}
              onClick={() =>
                write({ address: BOND, abi: securityAbi, functionName: "approve", args: [MARKET, maxUint256] })
              }
            >
              {isPending ? "Approving…" : "Approve the escrow to hold RDN27"}
            </button>
          ) : (
            <button
              className="btn"
              disabled={isPending || !valid}
              onClick={() =>
                valid &&
                c.ok && pr.ok && t.ok && w.ok &&
                write({
                  address: MARKET,
                  abi: marketAbi,
                  functionName: "open",
                  args: [BOND, c.value, CASH, pr.value, t.value, w.value, PROSPECTUS, ZERO32],
                })
              }
            >
              {isPending ? "Opening…" : "Open the request"}
            </button>
          )}

          {isConnected && c.ok && !enough && (
            <p className="hint">
              You hold {units(balance ?? 0n, BOND_DECIMALS, 0)} RDN27 — not enough for that pledge.
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <Tx hash={hash} error={error} />
          </div>
        </div>
      </div>
    </section>
  );
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
