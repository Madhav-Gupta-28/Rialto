"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hederaTestnet } from "@/lib/chain";
import { short } from "@/lib/format";

const links = [
  { href: "/how", label: "How it works" },
  { href: "/market", label: "Market" },
  { href: "/borrow", label: "Borrow" },
  { href: "/mandate", label: "Underwrite" },
];

export default function Nav() {
  const path = usePathname();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  // `useAccount().chainId`, not `useChainId()`. The latter reports the chain the
  // *config* is on, and this config declares one chain — so it answered 296 for
  // a wallet sitting on Flare, this button never appeared, and the mismatch
  // surfaced as a signing error with nothing offering to fix it.
  const wrongChain = isConnected && chainId !== undefined && chainId !== hederaTestnet.id;

  return (
    <header className="top">
      <div className="wrap row">
        <Link href="/" className="mark" style={{ justifySelf: "start" }}>
          Rialto<span>.</span>
        </Link>
        <nav className="links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ justifySelf: "end" }}>
        {wrongChain ? (
          <button className="btn small" onClick={() => switchChain({ chainId: hederaTestnet.id })}>
            Switch to Hedera testnet
          </button>
        ) : isConnected ? (
          <button className="btn ghost small num" onClick={() => disconnect()} title={address}>
            {short(address)}
          </button>
        ) : (
          <button
            className="btn small"
            disabled={isPending || connectors.length === 0}
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          >
            {connectors.length === 0 ? "No wallet found" : isPending ? "Connecting…" : "Connect wallet"}
          </button>
        )}
        </div>
      </div>
    </header>
  );
}
