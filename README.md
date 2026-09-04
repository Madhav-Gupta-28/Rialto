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

## Repository

| Path | What it is |
|---|---|
| `ARCHITECTURE.md` | The complete specification. Every claim verified on-chain, with reproduction commands. |
| `src/` | Contracts |
| `test/` | Foundry tests, at both 6- and 18-decimal cash |

## Build

```bash
forge build
forge test -vv
```

## Licence

MIT
