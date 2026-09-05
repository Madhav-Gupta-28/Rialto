"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { hederaTestnet } from "@/lib/chain";
import { short } from "@/lib/format";

const links = [
  { href: "/", label: "Market" },
  { href: "/borrow", label: "Borrow" },
  { href: "/mandate", label: "Underwrite" },
];

export default function Nav() {
  const path = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const wrongChain = isConnected && chainId !== hederaTestnet.id;

  return (
    <header className="top">
      <div className="wrap row">
        <Link href="/" className="mark">
          Rialto<span>.</span>
        </Link>
        <nav className="links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="spacer" />
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
    </header>
  );
}
