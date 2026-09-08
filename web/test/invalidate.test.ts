import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { hashFn, readContractQueryKey, readContractsQueryKey } from "wagmi/query";
import { MARKET } from "../lib/chain";
import { marketAbi } from "../lib/abi";

/**
 * TxDialog drops every contract read once a transaction is confirmed, by
 * invalidating the two key prefixes wagmi files its reads under. That is an
 * assumption about somebody else's library, and a wrong one fails silently —
 * the page would go on showing what it showed before the transaction, which is
 * exactly the bug this replaced. So it is checked against wagmi's own key
 * builders rather than against a key written out by hand here.
 *
 * `queryKeyHashFn` is wagmi's, not the default: a request id is a `bigint`, and
 * react-query's own `hashKey` is `JSON.stringify`, which throws on one. wagmi
 * passes its own hash with every query for that reason, so a cache seeded
 * without it is not the cache the app has.
 */
describe("the keys TxDialog invalidates", () => {
  const seed = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { queryKeyHashFn: hashFn } } });
    qc.setQueryData(
      readContractQueryKey({ address: MARKET, abi: marketAbi, functionName: "get", args: [12n] }),
      "one loan",
    );
    qc.setQueryData(
      readContractsQueryKey({ contracts: [{ address: MARKET, abi: marketAbi, functionName: "requests" }] }),
      "the table",
    );
    return qc;
  };

  it("wagmi still files reads under the two prefixes we invalidate", () => {
    const keys = seed().getQueryCache().getAll().map((q) => q.queryKey[0]);
    expect(keys.sort()).toEqual(["readContract", "readContracts"]);
  });

  it("invalidating those prefixes marks every read stale", () => {
    const qc = seed();
    // `refetchType: "none"` because nothing is mounted here. What is under test
    // is whether the filter matches, which is the part that can quietly stop
    // being true when wagmi changes.
    qc.invalidateQueries({ queryKey: ["readContract"], refetchType: "none" });
    qc.invalidateQueries({ queryKey: ["readContracts"], refetchType: "none" });
    expect(qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated)).toHaveLength(2);
  });

  it("matches a bigint-argument key by prefix, without hashing it", () => {
    // The prefix filter is a structural comparison rather than a hash, which is
    // why one read of loan #12 is reachable at all.
    const qc = seed();
    qc.invalidateQueries({ queryKey: ["readContract"], refetchType: "none" });
    const loan = qc.getQueryCache().getAll().find((q) => q.queryKey[0] === "readContract");
    expect(loan?.state.isInvalidated).toBe(true);
  });

  it("does not reach past the reads into the rest of the cache", () => {
    const qc = seed();
    qc.setQueryData(["connect", "status"], "connected");
    qc.invalidateQueries({ queryKey: ["readContract"], refetchType: "none" });
    qc.invalidateQueries({ queryKey: ["readContracts"], refetchType: "none" });
    expect(qc.getQueryCache().find({ queryKey: ["connect", "status"] })?.state.isInvalidated).toBe(false);
  });
});
