"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { maxUint256, stringToHex, type Hex } from "viem";
import { marketAbi, securityAbi } from "@/lib/abi";
import { MARKET, BOND, CASH, CASH_DECIMALS, BOND_DECIMALS, hashscan } from "@/lib/chain";
import { units, parseUnits } from "@/lib/format";
import Tx from "@/components/Tx";

const PROSPECTUS = stringToHex("prospectus", { size: 32 });
const ZERO32 = `0x${"00".repeat(32)}` as Hex;

export default function Borrow() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, error, isPending } = useWriteContract();

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

  const wanted = safe(collateral, BOND_DECIMALS);
  const needsApproval = (allowance ?? 0n) < wanted;
  const enough = (balance ?? 0n) >= wanted && wanted > 0n;
  const valid = enough && safe(principal, CASH_DECIMALS) > 0n && Number(days) > 0 && Number(window) >= 60;

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
            <Field name="Collateral to pledge (RDN27)" value={collateral} onChange={setCollateral} />
            <Field name="Principal sought (dUSD)" value={principal} onChange={setPrincipal} />
            <Field name="Term (days)" value={days} onChange={setDays} hint="60 days maximum" />
            <Field name="Auction length (seconds)" value={window} onChange={setWindow} hint="60 s to 7 days" />
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
                writeContract({ address: BOND, abi: securityAbi, functionName: "approve", args: [MARKET, maxUint256] })
              }
            >
              {isPending ? "Approving…" : "Approve the escrow to hold RDN27"}
            </button>
          ) : (
            <button
              className="btn"
              disabled={isPending || !valid}
              onClick={() =>
                writeContract({
                  address: MARKET,
                  abi: marketAbi,
                  functionName: "open",
                  args: [
                    BOND,
                    safe(collateral, BOND_DECIMALS),
                    CASH,
                    safe(principal, CASH_DECIMALS),
                    BigInt(Math.floor(Number(days) * 86400)),
                    BigInt(Math.floor(Number(window))),
                    PROSPECTUS,
                    ZERO32,
                  ],
                })
              }
            >
              {isPending ? "Opening…" : "Open the request"}
            </button>
          )}

          {!enough && isConnected && <p className="hint">Not enough RDN27 for that collateral amount.</p>}
          <div style={{ marginTop: 14 }}>
            <Tx hash={hash} error={error} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  name, value, onChange, hint,
}: { name: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="field">
      <span className="name">{name}</span>
      <input className="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function safe(v: string, d: number): bigint {
  try {
    return parseUnits(v, d);
  } catch {
    return 0n;
  }
}
