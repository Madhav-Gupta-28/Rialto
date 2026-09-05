"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hederaTestnet } from "@/lib/chain";

/**
 * Wallets are discovered through EIP-6963 rather than declared.
 *
 * Importing wagmi's connectors barrel to get `injected()` pulls in the Coinbase
 * account SDK and its optional x402 dependency, which does not resolve and
 * fails the build. Discovery is the better answer regardless: every injected
 * wallet the browser announces shows up, without naming any of them here.
 */
const config = createConfig({
  chains: [hederaTestnet],
  multiInjectedProviderDiscovery: true,
  transports: { [hederaTestnet.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
