/**
 * Does batching change any answer?
 *
 * The market page stopped reading its loans one at a time and started reading
 * them through Multicall3, which is a different contract executing the calls in
 * a different context. That is worth believing only if it is checked, so this
 * asks the live market both ways and compares every field.
 *
 *   npm run verify:reads
 *
 * It also prints what each way costs in requests, which is the reason for the
 * change: the count is linear in the size of the market, and one of the two
 * numbers does not grow. Read the request counts, not the milliseconds — node
 * and a browser pipeline these very differently, and the honest wall-clock
 * comparison is the one measured in Chrome, noted in lib/chain.ts.
 */

import { createPublicClient, http } from "viem";
import { hederaTestnet, MARKET } from "../lib/chain.ts";
import { marketAbi } from "../lib/abi.ts";

let posts = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => { posts++; return realFetch(...a); };

const bigints = (_, v) => (typeof v === "bigint" ? v.toString() : v);
const same = (a, b) => JSON.stringify(a, bigints) === JSON.stringify(b, bigints);

const batched = createPublicClient({ chain: hederaTestnet, transport: http(undefined, { batch: { wait: 16 } }) });
const oneByOne = createPublicClient({
  // The chain without its multicall, and without transport batching: exactly
  // what every read did before.
  chain: { ...hederaTestnet, contracts: {} },
  transport: http(),
});

const n = Number(await batched.readContract({ address: MARKET, abi: marketAbi, functionName: "requests" }));
console.log(`the market holds ${n} loans\n`);

const contracts = Array.from({ length: n }, (_, i) => {
  const id = BigInt(i);
  return [
    { address: MARKET, abi: marketAbi, functionName: "get", args: [id] },
    { address: MARKET, abi: marketAbi, functionName: "bestBid", args: [id] },
    { address: MARKET, abi: marketAbi, functionName: "bidCount", args: [id] },
  ];
}).flat();

posts = 0;
let t = Date.now();
const viaMulticall = await batched.multicall({ contracts });
console.log(`through Multicall3   ${String(Date.now() - t).padStart(5)} ms   ${String(posts).padStart(3)} request(s)`);

posts = 0;
t = Date.now();
// In parallel, the way a browser rendering twenty-one rows at once issues them.
// Timed serially this would look far worse than it is, and the point here is
// the request count, not a flattering number.
const individually = await Promise.all(
  contracts.map(async (c) => ({ status: "success", result: await oneByOne.readContract(c) })),
);
console.log(`one call at a time   ${String(Date.now() - t).padStart(5)} ms   ${String(posts).padStart(3)} request(s)`);

const wrong = viaMulticall.filter((r, i) => r.status !== "success" || !same(r.result, individually[i].result));
console.log(
  `\n${contracts.length} values compared: ${wrong.length === 0 ? "every one identical" : `${wrong.length} DIFFER`}`,
);
process.exit(wrong.length === 0 ? 0 : 1);
