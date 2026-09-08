"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useWrite } from "@/lib/useWrite";
import { amount, days as parseDays, basisPoints } from "@/lib/amount";
import { marketAbi, mandatesAbi } from "@/lib/abi";
import { MANDATES, MARKET, BOND, CASH_DECIMALS, hashscan } from "@/lib/chain";
import { units, short, duration, bps } from "@/lib/format";
import TxDialog from "@/components/TxDialog";
import Copy from "@/components/Copy";

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
  const { write, data: hash, error, isPending, reset } = useWrite();
  const [action, setAction] = useState<{ label: string; done: string }>({ label: "", done: "" });

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
      <section className="band" style={{ paddingTop: 100, paddingBottom: 44, borderBottom: "none" }}>
        <div className="wrap narrow">
          <h1 className="claim" style={{ fontSize: "clamp(34px,5vw,56px)" }}>Lend.</h1>
          <p className="lede" style={{ maxWidth: "46ch", marginTop: 14 }}>
            Set the limits your money bids inside. Bid by hand, or hand the key to an agent — the market
            holds both to the same rules.
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
                    <span><i style={{ background: "var(--ink)" }} />
                      out on loan <b>{units(live ?? 0n, CASH_DECIMALS, 0)}</b></span>
                    <span><i className="held" />
                      promised <b>{units(reserved ?? 0n, CASH_DECIMALS, 0)}</b></span>
                    <span style={{ marginLeft: "auto" }}>
                      <b>{units(headroom, CASH_DECIMALS, 0)}</b> still free
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
                        {mandate!.agent === ZERO ? (
                          <span className="sub" style={{ fontSize: 13 }}>none — you bid by hand</span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 12 }}>
                            <Copy value={mandate!.agent} label={short(mandate!.agent)} />
                            <a href={hashscan(mandate!.agent)} target="_blank" rel="noreferrer"
                               style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                              ↗
                            </a>
                          </span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="k">Biggest loan</span>
                      <span className="v">{units(mandate!.maxPerDeal, CASH_DECIMALS)}</span>
                    </div>
                    <div>
                      <span className="k">Lowest rate</span>
                      <span className="v">{bps(Number(mandate!.minRateBps))}</span>
                    </div>
                    <div>
                      <span className="k">Longest loan</span>
                      <span className="v">{duration(mandate!.maxTerm)}</span>
                    </div>
                    <div>
                      <span className="k">RDN27</span>
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
                      Nothing set — the market will refuse any bid you place.
                    </span>
                  </div>
                )}
              </div>

              {active && (
                <p className="note" style={{ marginTop: 14 }}>
                  A standing bid counts against your ceiling too — otherwise twenty best bids would each
                  pass on their own and blow through it together.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <p className="eyebrow">{active ? "Change your limits" : "Set your limits"}</p>

          <label className="field">
            <span className="name">Agent key — leave empty and you bid yourself</span>
            <input className="text" placeholder="0x…" value={agent} onChange={(e) => setAgent(e.target.value)} />
            <span className="hint" style={agentOk ? undefined : { color: "var(--bad)" }}>
              {agentOk
                ? "One key, one owner. A stolen key still cannot exceed these limits."
                : "not a valid address"}
            </span>
          </label>

          <div className="fieldset">
            <p className="lab"><span>How much</span></p>
            <div className="grid two">
              <Field name="Biggest single loan (dUSD)" value={perDeal} onChange={setPerDeal} problem={pd.ok ? undefined : pd.why} />
              <Field name="Most you will lend at once (dUSD)" value={total} onChange={setTotal} problem={tot.ok ? undefined : tot.why} />
            </div>
          </div>

          <div className="fieldset">
            <p className="lab">
              <span>What you will accept</span>
              <span>{rate.ok ? bps(Number(rate.value)) : ""}</span>
            </p>
            <div className="grid two">
              <Field name="Lowest rate (bps)" value={minRate} onChange={setMinRate} hint="500 = 5.00%" problem={rate.ok ? undefined : rate.why} />
              <Field name="Longest loan (days)" value={maxTerm} onChange={setMaxTerm} hint="60 maximum" problem={term.ok ? undefined : term.why} />
            </div>
          </div>

          {!isConnected ? (
            <p className="sub">Connect a wallet to set a mandate.</p>
          ) : (
            <div className="actions" style={{ gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn"
                disabled={isPending || !mandateValid}
                onClick={() => {
                  if (!(pd.ok && tot.ok && rate.ok && term.ok)) return;
                  setAction({
                    label: active ? "Replace the mandate" : "Set the mandate",
                    done: "Your limits are on chain. The market will refuse any bid that breaches them, including one from your own agent.",
                  });
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
                  );
                }}
              >
                {isPending ? "Signing…" : active ? "Update limits" : "Set your limits"}
              </button>

              {!allowed && (
                <button
                  className="btn ghost"
                  disabled={isPending}
                  onClick={() => {
                    setAction({ label: "Allow RDN27", done: "Your mandate now lists this security, so you can bid on requests collateralised by it." });
                    write(
                      { address: MANDATES, abi: mandatesAbi, functionName: "allowAsset", args: [BOND, true] },
                      { onSuccess: () => refetchAllowed() },
                    );
                  }}
                >
                  Accept RDN27
                </button>
              )}

              {active && (
                <button
                  className="btn ghost"
                  disabled={isPending}
                  onClick={() => {
                    setAction({ label: "Stand down", done: "The mandate is revoked and any agent key it named is unbound. Your funded positions are untouched." });
                    write({ address: MANDATES, abi: mandatesAbi, functionName: "revoke" }, { onSuccess: () => refetch() });
                  }}
                >
                  Stand down
                </button>
              )}
            </div>
          )}

          {isConnected && !allowed && (
            <p className="hint">You cannot bid on a bond you have not accepted.</p>
          )}

          <TxDialog hash={hash} error={error} action={action.label} done={action.done} onClose={reset} />
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
