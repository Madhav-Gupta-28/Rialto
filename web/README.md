# Rialto — web

The borrower, underwriter and settlement flows, reading live Hedera testnet
state.

```bash
npm install
npm run dev      # http://localhost:3100
```

Addresses live in `lib/chain.ts` and match `DEPLOYMENTS.md`. Nothing here holds
a key: every action is a transaction the connected wallet signs.

## Why the interface exists

Two claims in this project are only claims until a person can act on them.

**Agents are not required.** The market cannot tell an agent from a human — both
produce the identical on-chain bid. `/request/[id]` has a bidding form, so
anyone can be the underwriter without running anything.

**The document is the collateral's risk.** `DocumentCheck` fetches the
prospectus and hashes it *in the reader's browser*, comparing against the hash
the request froze at `open`. A judge does not have to take our word for it, and
when an issuer swaps the document mid-auction the page says mismatch rather than
quietly repricing.

## A note on wallets

Connectors are discovered through EIP-6963 rather than declared. Importing
wagmi's connectors barrel pulls in the Coinbase account SDK and an optional
`@x402/evm` dependency that does not resolve, which fails the build — and
discovery is the better answer anyway, since every injected wallet the browser
announces appears without naming any of them here.
