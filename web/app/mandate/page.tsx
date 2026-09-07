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

  // Committed capital, against the ceiling its owner set. Standing bids count
  // too: holding the best bid on twenty auctions passes every limit check
  // separately and breaches the ceiling the moment they all award.
  const ceiling = active ? mandate!.maxTotal : 0n;
  const committed = (live ?? 0n) + (reserved ?? 0n);
  const pct = (x: bigint) => (ceiling > 0n ? Math.min(Number((x * 10_000n) / ceiling) / 100, 100) : 0);
  const headroom = ceiling > committed ? ceiling - committed : 0n;

  return (
    <>
      <section className="band void" style={{ paddingTop: 104, paddingBottom: 56 }}>
        <div className="wrap narrow">
          <p className="eyebrow">Underwriter</p>
          <h1 className="claim" style={{ fontSize: "clamp(30px,4.4vw,50px)" }}>
            Authority on chain.
            <br />
            <span className="dim">Judgement anywhere else.</span>
          </h1>
          <p className="lede" style={{ maxWidth: "54ch" }}>
            A mandate is what an agent may do with your money, and the market enforces it. The strategy it
            follows is a paragraph of English you can change any time. Leave the agent empty and you bid by
            hand — the contract cannot tell the two apart.
          </p>
        </div>
      </section>

    <section style={{ paddingTop: 40 }}>
      <div className="wrap narrow">
        {isConnected && (
          <div className="panel" style={{ marginBottom: 22 }}>
            <div className="head">
              <p className="eyebrow" style={{ margin: 0 }}>Where you stand</p>
              {active
                ? <span className="state settled">mandate active</span>
                : <span className="state pending">no mandate</span>}
            </div>
            <div className="body">
              {active && (
                <div className="meter" style={{ marginBottom: 22 }}>
                  <div className="track">
                    <div className="fill live" style={{ width: `${pct(live ?? 0n)}%` }} />
                    <div className="fill held" style={{ width: `${pct(reserved ?? 0n)}%` }} />
                  </div>
                  <div className="legend">
                    <span><i style={{ background: "var(--settled)" }} />
                      funded {units(live ?? 0n, CASH_DECIMALS)}</span>
                    <span><i style={{ background: "var(--pending)" }} />
                      standing bids {units(reserved ?? 0n, CASH_DECIMALS)}</span>
                    <span style={{ marginLeft: "auto" }}>
                      {units(headroom, CASH_DECIMALS)} of {units(ceiling, CASH_DECIMALS)} left
                    </span>
                  </div>
                </div>
              )}

              <div className="reads">
                {active ? (
                  <>
                    <div>
                      <span className="k">Agent</span>
                      <span className="v">
                        {mandate!.agent === ZERO
                          ? <span className="sub" style={{ fontSize: 13 }}>none — you bid by hand</span>
                          : short(mandate!.agent)}
                      </span>
                    </div>
                    <div>
                      <span className="k">Largest single deal</span>
                      <span className="v">{units(mandate!.maxPerDeal, CASH_DECIMALS)} dUSD</span>
                    </div>
                    <div>
                      <span className="k">Minimum rate</span>
                      <span className="v">{bps(Number(mandate!.minRateBps))}</span>
                    </div>
                    <div>
                      <span className="k">Longest term</span>
                      <span className="v">{duration(mandate!.maxTerm)}</span>
                    </div>
                    <div>
                      <span className="k">RDN27 as collateral</span>
                      <span className="v">
                        {allowed
                          ? <span className="state settled">allowed</span>
                          : <span className="state blocked">not listed</span>}
                      </span>
                    </div>
                  </>
                ) : (
                  <div>
                    <span className="k">Status</span>
                    <span className="v sub" style={{ fontSize: 13 }}>
                      Nothing set. The market will refuse any bid you place.
                    </span>
                  </div>
                )}
              </div>

              {active && (
                <p className="note" style={{ marginTop: 16 }}>
                  Standing bids count against the ceiling as well as funded ones. Without that, holding the
                  best bid on twenty auctions would pass every limit check separately and breach it the
                  moment they all awarded.
                </p>
              )}
            </div>
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
