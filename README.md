# Rialto

An underwriting market for tokenized securities on Hedera.

A holder of a tokenized bond needs cash for thirty days. Today the only options
are to sell the asset or to find a bank. Rialto is the third: post the security
as collateral, publish the offering document, and let underwriters compete to
fund you.

**There is no price oracle anywhere in this system.** For an illiquid security
there is no price to read — its risk lives in the offering document, not on a
feed. So Rialto does not read a price. Underwriters read the document, form a
credit opinion, and bid their own capital behind it. The repayment is fixed at
award by agreement, and every branch after that depends only on time and on
whether the money arrived.

That single decision removes the failure mode that took $9.05M out of Bonzo
Lend in July 2026, and with it 40% of Hedera's TVL: there is no feed to
manipulate, because there is no feed.

## How it works

```
issuer     setDocument(uri, hash)        the prospectus, on-chain, role-gated
   |
borrower   open(...)                     collateral escrowed, document hash frozen
   |
underwriter bid(repayAmount)             lowest repayment wins; agents or humans
   |
           award()                        cash lender -> borrower, atomically
   |
           repay()  or  claim()           collateral home, or collateral to lender
```

`repay` and `claim` are the only two endings. There is no liquidation, no
margin call, no partial outcome — the haircut the lender accepted at award is
their entire protection, which is why it is theirs to choose.

## Why Hedera

- **Asset Tokenization Studio** already puts a regulated security's offering
  document on-chain under a role-gated write, through the ERC-1643 Documentation
  facet. Rialto makes that document the price-forming input rather than an
  attachment. It is the one ATS facet with no substitute.
- **Scheduled contract calls** (HIP-1215) let the market ask the network itself
  to settle a defaulted position at maturity. No keeper, no cron box.
- **HCS** gives every underwriting opinion an ordered, timestamped record that
  is published *before* the outcome is known.

## Live on Hedera testnet

**[rialto-lime.vercel.app](https://rialto-lime.vercel.app)** — the market, reading
these contracts directly. Connect a wallet on Hedera testnet to act on anything.

Every contract below is verified and readable as source on HashScan.

| | Address | |
|---|---|---|
| Market | [`0x9040986D…21a4`](https://hashscan.io/testnet/contract/0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4) | `0.0.10382007` |
| Mandates | [`0xb4F8cB27…47a4`](https://hashscan.io/testnet/contract/0xb4F8cB274387A5190CeF7582004558809f8547a4) | `0.0.10373522` |
| Compliance lens | [`0xd65580d3…3246`](https://hashscan.io/testnet/contract/0xd65580d345aE3c13Ce58586C0891b67198f23246) | `0.0.10382009` |
| The bond, through the live ATS factory | [`0x52Ea050F…2114`](https://hashscan.io/testnet/contract/0x52Ea050Fe77A303b1A61fe15d8894892aFF02114) | `RDN27`, `0.0.10367236` |
| Reasoning record | [HCS topic `0.0.10367534`](https://hashscan.io/testnet/topic/0.0.10367534) | every opinion, before its outcome |

`DEPLOYMENTS.md` is the ledger: every lifecycle, every compliance control and
every coupon in this repository was run against those addresses, and the figures
there were read back off the chain rather than written down.

## Repository

| Path | What it is |
|---|---|
| `ARCHITECTURE.md` | The complete specification. Every claim verified on-chain, with reproduction commands. |
| `DEPLOYMENTS.md` | What is deployed, and the transactions proving each claim. |
| `src/` | The contracts: market, mandates, compliance lens, coupon pass-through. |
| `test/` | Foundry tests, at both 6- and 18-decimal cash. |
| `agent/` | The underwriting agent: reads the document, forms an opinion, publishes it to HCS, bids. |
| `web/` | The market's front end — borrow, bid, settle, and the manufactured payment. |
| `script/` | Deployment and lifecycle drivers. |
| `docs/` | The demo instrument's offering document. |

## Build

```bash
forge build && forge test          # 238 contract tests

cd agent && npm install && npm test # 98 agent tests
cd web   && npm install && npm test # 30 web tests
```

Copy `.env.example` to `.env` and fill it in to run anything against testnet.
A key that has never been used has no Hedera account yet, so fund it once with
`node agent/scripts/fund-account.mjs <address> 5` before anything else — a plain
value transfer cannot create one (`ARCHITECTURE.md` §3.9).

```bash
cd web && npm run dev              # the market, against testnet
cd agent && npm start              # the underwriting agent
ID=<n> script/coupon.sh            # the manufactured payment on one request
```

## Licence

MIT
