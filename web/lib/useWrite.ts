"use client";

import { useWriteContract } from "wagmi";
import { hederaTestnet } from "./chain";

/**
 * Every write in this app, with the chain pinned.
 *
 * `useWriteContract` follows whatever chain the wallet happens to be on. Naming
 * the chain makes wagmi refuse instead of sending an `approve` to an address
 * that means something entirely different on another network.
 *
 * Refusing is the safe half; the header carries the other half, offering the
 * switch. That pairing only works if the header can actually see the wallet's
 * chain — it reads `useAccount().chainId` rather than `useChainId()`, because
 * the latter reports the config's chain and this config declares exactly one.
 */
export function useWrite() {
  const { writeContract, ...rest } = useWriteContract();

  return {
    ...rest,
    write: (
      args: Omit<Parameters<typeof writeContract>[0], "chainId">,
      opts?: Parameters<typeof writeContract>[1],
    ) => writeContract({ ...args, chainId: hederaTestnet.id } as Parameters<typeof writeContract>[0], opts),
  };
}
