"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useWrite } from "@/lib/useWrite";
import { amount, days as parseDays, basisPoints } from "@/lib/amount";
import { marketAbi, mandatesAbi } from "@/lib/abi";
import { MANDATES, MARKET, BOND, CASH_DECIMALS, hashscan } from "@/lib/chain";
import { units, short, duration, bps } from "@/lib/format";
import Tx from "@/components/Tx";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The underwriter's page.
 *
 * The distinction this page exists to make legible: the mandate is authority and
 * lives on-chain, where it cannot be exceeded. The strategy an agent follows is
 * judgement, lives off-chain, and is editable. A stolen agent key can do nothing
 * its owner did not already authorise here — and an underwriter who would rather
 * bid by hand simply leaves the agent field empty.
 */
export default function MandatePage() {
  const { address, isConnected } = useAccount();
  const { write, data: hash, error, isPending } = useWrite();

  const [agent, setAgent] = useState("");
  const [perDeal, setPerDeal] = useState("500000");
  const [total, setTotal] = useState("1000000");
  const [minRate, setMinRate] = useState("500");
  const [maxTerm, setMaxTerm] = useState("60");

  const { data: mandate, refetch } = useReadContract({
    address: MANDATES, abi: mandatesAbi, functionName: "mandateOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: allowed, refetch: refetchAllowed } = useReadContract({
    address: MANDATES, abi: mandatesAbi, functionName: "assetAllowed",
    args: address ? [address, BOND] : undefined, query: { enabled: !!address },
  });
  const { data: live } = useReadContract({
    address: MARKET, abi: marketAbi, functionName: "liveExposure",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: reserved } = useReadContract({
    address: MARKET, abi: marketAbi, functionName: "reservedExposure",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });

  const active = mandate?.active ?? false;

  const pd = amount(perDeal, CASH_DECIMALS);
  const tot = amount(total, CASH_DECIMALS);
  const rate = basisPoints(minRate);
  const term = parseDays(maxTerm, 60);
  const agentOk = agent.trim() === "" || /^0x[0-9a-fA-F]{40}$/.test(agent.trim());
  const mandateValid = pd.ok && tot.ok && rate.ok && term.ok && agentOk;

  return (
    <section className="first">
      <div className="wrap narrow">
        <p className="eyebrow">Underwriter</p>
        <h1 className="display">Set the limits, then bid inside them.</h1>
        <p className="lede">
          A mandate is authority, and it lives on-chain where it cannot be exceeded. The strategy an agent
          follows is judgement — soft, editable, and deliberately not here. Leave the agent empty and you
          bid by hand; the market cannot tell the two apart.
        </p>

        {isConnected && (
          <div className="card" style={{ marginTop: 30 }}>
            <p className="eyebrow">Where you stand</p>
            <div className="kv"><span className="k">Mandate</span><span className="v">{active ? "active" : "none"}</span></div>
            {active && (
              <>
                <div className="kv">
                  <span className="k">Agent</span>
                  <span className="v">{mandate!.agent === ZERO ? "none — bidding by hand" : short(mandate!.agent)}</span>
                </div>
                <div className="kv"><span className="k">Largest single deal</span><span className="v">{units(mandate!.maxPerDeal, CASH_DECIMALS)} dUSD</span></div>
                <div className="kv"><span className="k">Ceiling</span><span className="v">{units(mandate!.maxTotal, CASH_DECIMALS)} dUSD</span></div>
                <div className="kv"><span className="k">Minimum rate</span><span className="v">{bps(Number(mandate!.minRateBps))}</span></div>
                <div className="kv"><span className="k">Longest term</span><span className="v">{duration(mandate!.maxTerm)}</span></div>
              </>
            )}
            <div className="kv"><span className="k">Funded positions</span><span className="v">{units(live ?? 0n, CASH_DECIMALS)} dUSD</span></div>
            <div className="kv">
              <span className="k">Committed to standing bids</span>
              <span className="v">{units(reserved ?? 0n, CASH_DECIMALS)} dUSD</span>
            </div>
            <p className="note" style={{ marginTop: 12 }}>
              Standing bids count against the ceiling as well as funded ones. Without that, holding the best
              bid on twenty auctions would pass every limit check separately and breach it the moment they
              all awarded.
            </p>
          </div>
        )}

        <div className="card">
          <p className="eyebrow">{active ? "Replace your mandate" : "Set a mandate"}</p>

          <label className="field">
            <span className="name">Agent key — leave empty to bid by hand</span>
            <input className="text" placeholder="0x…" value={agent} onChange={(e) => setAgent(e.target.value)} />
            <span className="hint" style={agentOk ? undefined : { color: "var(--bad)" }}>
              {agentOk
                ? "One key serves exactly one owner, so a stolen key cannot spend two balance sheets."
                : "not a valid address"}
            </span>
          </label>

          <div className="grid two">
            <Field name="Largest single deal (dUSD)" value={perDeal} onChange={setPerDeal} problem={pd.ok ? undefined : pd.why} />
            <Field name="Total ceiling (dUSD)" value={total} onChange={setTotal} problem={tot.ok ? undefined : tot.why} />
            <Field name="Minimum rate (bps)" value={minRate} onChange={setMinRate} hint="500 = 5.00%" problem={rate.ok ? undefined : rate.why} />
            <Field name="Longest term (days)" value={maxTerm} onChange={setMaxTerm} hint="60 maximum" problem={term.ok ? undefined : term.why} />
          </div>

          {!isConnected ? (
            <p className="sub">Connect a wallet to set a mandate.</p>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn"
                disabled={isPending || !mandateValid}
                onClick={() =>
                  pd.ok && tot.ok && rate.ok && term.ok &&
                  write(
                    {
                      address: MANDATES,
                      abi: mandatesAbi,
                      functionName: "setMandate",
                      args: [
                        (agent.trim() || ZERO) as `0x${string}`,
                        pd.value,
                        tot.value,
                        Number(rate.value),
                        term.value,
                      ],
                    },
                    { onSuccess: () => refetch() },
                  )
                }
              >
                {isPending ? "Signing…" : active ? "Replace mandate" : "Set mandate"}
              </button>

              {!allowed && (
                <button
                  className="btn ghost"
                  disabled={isPending}
                  onClick={() =>
                    write(
                      { address: MANDATES, abi: mandatesAbi, functionName: "allowAsset", args: [BOND, true] },
                      { onSuccess: () => refetchAllowed() },
                    )
                  }
                >
                  Allow RDN27 as collateral
                </button>
              )}

              {active && (
                <button
                  className="btn ghost"
                  disabled={isPending}
                  onClick={() =>
                    write({ address: MANDATES, abi: mandatesAbi, functionName: "revoke" }, { onSuccess: () => refetch() })
                  }
                >
                  Stand down
                </button>
              )}
            </div>
          )}

          {isConnected && !allowed && (
            <p className="hint">You cannot bid on a security your mandate does not list.</p>
          )}

          <div style={{ marginTop: 14 }}>
            <Tx hash={hash} error={error} />
          </div>
        </div>

        <p className="sub" style={{ marginTop: 20 }}>
          Mandates contract:{" "}
          <a href={hashscan(MANDATES)} target="_blank" rel="noreferrer">{short(MANDATES)}</a>
        </p>
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
