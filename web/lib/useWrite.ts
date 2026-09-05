"use client";

import { useWriteContract } from "wagmi";
import { hederaTestnet } from "./chain";

/**
 * Every write in this app, with the chain pinned.
 *
 * `useWriteContract` follows whatever chain the wallet happens to be on. The
 * header offers to switch, but offering is not enforcing — a user on Ethereum
 * mainnet could otherwise sign an `approve` to an address that means something
 * entirely different there. Naming the chain makes wagmi refuse or switch
 * instead of sending it somewhere nobody intended.
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
