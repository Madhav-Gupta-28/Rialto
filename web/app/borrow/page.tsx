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
      <section className="band void" style={{ paddingTop: 104, paddingBottom: 56 }}>
        <div className="wrap narrow">
          <p className="eyebrow">Borrower</p>
          <h1 className="claim" style={{ fontSize: "clamp(30px,4.4vw,50px)" }}>
            Name the terms.
            <br />
            <span className="dim">Let underwriters answer.</span>
          </h1>
          <p className="lede" style={{ maxWidth: "54ch" }}>
            You fix the principal, the term, and how much collateral you are pledging. You never name a
            price, and neither does the contract — the auction does that, once.
          </p>
        </div>
      </section>

    <section style={{ paddingTop: 40 }}>
      <div className="wrap narrow">
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="head">
            <p className="eyebrow" style={{ margin: 0 }}>The instrument</p>
            <a className="sub" href={hashscan(BOND)} target="_blank" rel="noreferrer"
               style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
              RDN27 · ATS security ↗
            </a>
          </div>
          <div className="body">
            <div className="reads">
              <div>
                <span className="k">Your balance</span>
                <span className="v">
                  {balance !== undefined ? `${units(balance, BOND_DECIMALS, 0)} RDN27` : "—"}
                </span>
              </div>
              <div>
                <span className="k">Control list</span>
                <span className="v">
                  {listed === undefined ? "—" : listed
                    ? <span className="state settled">admitted</span>
                    : <span className="state blocked">not listed</span>}
                </span>
              </div>
              <div>
                <span className="k">Escrow approval</span>
                <span className="v">
                  {!isConnected ? "—" : needsApproval
                    ? <span className="state pending">required</span>
                    : <span className="state settled">granted</span>}
                </span>
              </div>
            </div>
            {listed === false && (
              <p className="note" style={{ marginTop: 16 }}>
                This security is permissioned. Until the issuer admits you, you cannot hold or pledge it —
                the ERC-3643 constraint that makes ordinary AMMs incompatible with regulated assets.
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <p className="eyebrow">Your request</p>

          <div className="grid two">
            <Field name="Collateral to pledge (RDN27)" value={collateral} onChange={setCollateral} problem={c.ok ? undefined : c.why} />
            <Field name="Principal sought (dUSD)" value={principal} onChange={setPrincipal} problem={pr.ok ? undefined : pr.why} />
            <Field name="Term (days)" value={days} onChange={setDays} hint="60 days maximum" problem={t.ok ? undefined : t.why} />
            <Field name="Auction length (seconds)" value={window} onChange={setWindow} hint="60 s to 7 days" problem={w.ok ? undefined : w.why} />
          </div>

          {proposal && (
            <div className={`proposal${enough ? "" : " short"}`}>
              <span className="big">{proposal.ratio.toFixed(2)}×</span>
              <p>
                {proposal.pledged} RDN27 pledged against{" "}
                {proposal.sought} dUSD. <strong>That ratio is the whole of the
                lender&rsquo;s protection</strong> — there is no margin call to top it up later, and no
                oracle to argue with. Pledge more and you will be bid a lower repayment.
              </p>
            </div>
          )}

          <p className="note" style={{ margin: "18px 0" }}>
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
    </>
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
