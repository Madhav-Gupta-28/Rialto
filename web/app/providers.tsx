"use client";

import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hederaTestnet } from "@/lib/chain";
import { retryRead } from "@/lib/retry";

/**
 * Wallets are discovered through EIP-6963 rather than declared.
 *
 * Importing wagmi's connectors barrel to get `injected()` pulls in the Coinbase
 * account SDK and its optional x402 dependency, which does not resolve and
 * fails the build. Discovery is the better answer regardless: every injected
 * wallet the browser announces shows up, without naming any of them here.
 *
 * The transport batches. Reads that leave in the same tick — and a table of
 * loans renders every row in one commit, so they all do — go out as a single
 * JSON-RPC array instead of one POST each. That works with the multicall
 * declared on the chain rather than against it: viem splits a large multicall
 * into several `eth_call`s to stay under the calldata limit, and the batcher
 * puts those back into one request.
 */
const config = createConfig({
  chains: [hederaTestnet],
  multiInjectedProviderDiscovery: true,
  transports: { [hederaTestnet.id]: http(undefined, { batch: { wait: 16 } }) },
  ssr: true,
});

/**
 * Reads are cached for a few seconds.
 *
 * Without this every navigation back to the market refetches the whole table
 * from cold, which is the same wait again for figures that cannot have moved:
 * Hedera produces a block roughly every two seconds, and nothing here is a
 * price. Four seconds is short enough that the age beside the table stays
 * honest. An explicit `refetch` after a transaction ignores it entirely, so
 * the one moment freshness actually matters is unaffected.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 4_000,
        gcTime: 5 * 60_000,
        retry: retryRead,
      },
    },
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  // Held in state, not at module scope. A module-level client is created once
  // per server process and would be shared by every request rendering at the
  // same time; in the browser it has to survive re-renders, which `useState`
  // with an initialiser does and a bare `new QueryClient()` does not.
  const [queryClient] = useState(makeQueryClient);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
