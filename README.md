# Rialto

**An underwriting market for tokenized securities on Hedera — with no price oracle anywhere in it.**

[**hedera-rialto.vercel.app**](https://hedera-rialto.vercel.app) · [Market contract](https://hashscan.io/testnet/contract/0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4) · [Reasoning topic](https://hashscan.io/testnet/topic/0.0.10367534)

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
issuer      setDocument(uri, hash)       the prospectus, on-chain, role-gated
   |
borrower    open(...)                    collateral escrowed, document hash frozen
   |
underwriter bid(repayAmount)             lowest repayment wins; agents or humans
   |
            award()                      cash lender -> borrower, atomically
   |                                     + settlement booked with the network
   |
            repay()  or  claim()         collateral home, or collateral to lender
```

`repay` and `claim` are the only two endings. There is no liquidation, no
margin call, no partial outcome — the haircut the lender accepted at award is
their entire protection, which is why it is theirs to choose.

Three consequences worth stating, because they are what the design buys:

- **Nothing to manipulate.** The repayment is agreed between two parties and
  written to storage. No price moves it afterwards.
- **Nobody has to be watching.** `award` asks Hedera to call `claim` itself at
  maturity, so a defaulted loan closes without a keeper.
- **The lender's reasoning is on the record before the outcome exists.** An
  underwriting opinion is published to consensus *before* the bid that carries
  its hash.

## The three Hedera services, and what each one does here

**Asset Tokenization Studio** — the collateral is a real ERC-3643 security
minted through the live ATS factory. Its offering document is read off the
**ERC-1643 Documentation facet**, and `open` freezes that document's hash into
the request. The browser re-fetches and re-hashes it in front of the reader, so
an issuer swapping the document mid-auction shows up as a mismatch instead of
quietly moving a bid. Rialto also reads ATS's pause, control-list and KYC state
through `ComplianceLens`, and its corporate-action coupons through
`CouponPassThrough`.

**Scheduled contract calls — [HIP-1215](https://hips.hedera.com/hip/hip-1215)** —
`award` asks the network to invoke `claim(id)` on the market one second after
maturity, plus a 60-second margin. A defaulted loan closes itself. The market
contract is `payer_account_id` on every booking, so it funds its own ending out
of an HBAR balance it holds for exactly that. Repaying early cancels the
booking in the same transaction.

**Hedera Consensus Service** — every underwriting opinion is published to topic
[`0.0.10367534`](https://hashscan.io/testnet/topic/0.0.10367534) *before* the
bid, and the bid carries that message's keccak256 on chain. The ordering is the
claim: the reasoning is timestamped ahead of the outcome, so it cannot be edited
to suit it.

## What is proven on chain

Read back off Hedera testnet on **8 September 2026**. Every number here is
reproducible with the commands beside it, not copied from a note.

| | |
|---|---|
| Loans run end to end | **23** — 7 repaid, 7 defaulted, 7 withdrawn, 2 running |
| Principal actually moved | **34,000 dUSD** |
| Settlements booked with the network | **20** |
| ...executed by Hedera, unattended | **11** |
| ...released when the borrower repaid early | **7** |
| Underwriting opinions on HCS | **44** |

```bash
# the settlement counts, straight from the mirror node
curl -s "https://testnet.mirrornode.hedera.com/api/v1/schedules?account.id=0.0.10367270&limit=100&order=desc" \
  | jq '[.schedules[] | select(.payer_account_id == "0.0.10382007")]
        | {booked: length,
           executed: ([.[] | select(.executed_timestamp)] | length),
           released: ([.[] | select(.deleted)] | length)}'
```

**The loan that closed itself.** Request #22 was awarded and then deliberately
abandoned. Schedule `0.0.10420562` was booked inside `award` at `1788866025`,
set to expire at `1788866804` — maturity plus the margin — and executed at
`1788866804.017150496`, the second it was booked for. Its 68-byte body decodes
to `claim(uint256)` with argument 22, addressed to the market. The execution is
a `CONTRACTCALL` whose `entity` is `0.0.10382007`: the market paid for it.

**The reasoning record verifies.** Each winning bid's on-chain `reasoningRef` is
the keccak256 of a consensus message published before that bid existed —
`0x0ce7589494…` = sequence 40 for request #21, `0x2a91ba6390…` = sequence 43
for #22. Reassemble the chunks, hash them, compare:

```bash
script/verify-reasoning.sh <requestId>
```

**The agent priced a coupon before it paid.** With the security reporting
nothing about a coupon whose record date had not arrived, the agent projected
**28.767123 dUSD** and bid it into the repayment. The record date passed, nobody
intervened, and Hedera recorded **28.767123 dUSD**. To the unit.

`DEPLOYMENTS.md` is the full ledger: every lifecycle, every issuer control and
every coupon in this repository was run against the addresses below, and the
figures there were read back off the chain rather than written down.

## Live on Hedera testnet

The front end reads the chain directly — there is no backend, no indexer and no
database to stand up.

| | Address | Hedera id | Source |
|---|---|---|---|
| Market | [`0x9040986D…21a4`](https://hashscan.io/testnet/contract/0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4) | `0.0.10382007` | verified |
| Mandates | [`0xb4F8cB27…47a4`](https://hashscan.io/testnet/contract/0xb4F8cB274387A5190CeF7582004558809f8547a4) | `0.0.10373522` | verified |
| Compliance lens | [`0xd65580d3…3246`](https://hashscan.io/testnet/contract/0xd65580d345aE3c13Ce58586C0891b67198f23246) | `0.0.10382009` | verified |
| Demo cash (dUSD) | [`0x55e9BAF7…e365`](https://hashscan.io/testnet/contract/0x55e9BAF7dCFe0e2A4E51e1BdeBB4e20d6247e365) | — | verified |
| The bond (RDN27) | [`0x52Ea050F…2114`](https://hashscan.io/testnet/contract/0x52Ea050Fe77A303b1A61fe15d8894892aFF02114) | `0.0.10367236` | ATS diamond proxy — not our source |
| Reasoning record | [topic `0.0.10367534`](https://hashscan.io/testnet/topic/0.0.10367534) | | every opinion, before its outcome |

The four contracts marked *verified* are verified through Sourcify and readable
as source on HashScan. RDN27 is not ours to verify: it is a diamond proxy
created by the live ATS factory, and its logic lives in ATS's own facets.

## Repository

| Path | What it is |
|---|---|
| `src/` | The contracts: `RialtoMarket`, `Mandates`, `ComplianceLens`, `CouponPassThrough`, and the ATS / ERC-1643 / HSS interfaces |
| `src/demo/` | Not the protocol. Demo cash, an ISIN checker, and two probes that settled Hedera questions by experiment rather than by guessing |
| `agent/` | The underwriting agent: reads the document, forms an opinion, publishes it to HCS, bids |
| `web/` | The market's front end — borrow, bid, settle, and the manufactured payment |
| `script/` | Deployment and lifecycle drivers |
| `test/` | Foundry tests, at both 6- and 18-decimal cash, plus fuzz and invariant suites |
| `docs/` | The demo instrument's offering document |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | The complete specification. Every claim verified on-chain, with reproduction commands |
| [`DEPLOYMENTS.md`](DEPLOYMENTS.md) | What is deployed, and the transactions proving each claim |
| [`AI_USAGE.md`](AI_USAGE.md) | Where AI was used building this, and where it was not |

## Build and run

Requires [Foundry](https://book.getfoundry.sh/getting-started/installation) and
Node 20+. `forge-std` is vendored, so a plain `git clone` builds without
`--recursive`.

```bash
forge build && forge test               # 243 contract tests
cd agent && npm install && npm test     # 139 agent tests
cd web   && npm install && npm test     #  79 web tests
```

Copy `.env.example` to `.env` and fill it in to run anything against testnet.
A key that has never been used has no Hedera account yet, so fund it once
before anything else — a plain value transfer cannot create one
(`ARCHITECTURE.md` §3.9):

```bash
node agent/scripts/fund-account.mjs <address> 5
```

Then:

```bash
cd web && npm run dev                   # the market, against testnet, on :3100
cd agent && npm start                   # the underwriting agent
```

### Deploying your own

```bash
forge script script/Deploy.s.sol --rpc-url $HEDERA_TESTNET_RPC --broadcast
npx tsx agent/scripts/create-topic.ts   # an HCS topic for the reasoning record
```

That deploys the market, the mandates registry and the compliance lens, and
creates the consensus topic. Write the resulting addresses back into `.env`.

**Issuing the bond is different.** Anything that talks to ATS has to be sent
with `cast send`, not `forge script`: forge simulates the script body locally
against forked state, which for an ATS diamond means hundreds of
`eth_getStorageAt` calls, and the mirror node times out under that load.
`script/IssueBond.s.sol` and `script/AdmitUnderwriter.s.sol` document the
sequence and are testable locally, but the live path is `cast` — the exact
calls are in `DEPLOYMENTS.md`, which also covers the two ATS APIs that are
easy to get wrong (`grantKyc` takes five arguments, and freezing is
`setAddressFrozen`, which leaves `isFrozen` reading false).

### Driving one loan by hand

```bash
ID=<n> script/coupon.sh                 # the manufactured payment on one request
script/verify-reasoning.sh <n>          # re-hash the HCS opinion behind a bid
cd web && npm run verify:reads          # multicall answers == individual calls
```

Everything else is reachable from the front end, including the default path:
the loan-length field takes minutes as well as days, so a twelve-minute loan can
be opened, awarded, abandoned and watched closing itself without leaving the
page.

## Testing

| Suite | Tests | What it covers |
|---|---|---|
| `test/` | 243 | The contracts — unit, fuzz and invariant |
| `agent/test/` | 139 | Document verification, SSRF defences, the reasoners, coupon projection, HCS |
| `web/test/` | 79 | Amount parsing, revert decoding, the compliance lens copy, URI safety |

Coverage on the four production contracts is **100% of lines, 100% of
functions, 98.89% of branches**:

```bash
forge coverage --no-match-coverage "(test|script|demo)"
```

The invariant suite is the one worth reading: it drives a handler through open,
bid, warp, award, repay, claim and coupon at depth 250, and asserts that
escrowed collateral always equals the sum of live positions, that the market
never holds cash, that nobody exceeds their own ceiling, that a settled request
never moves again, and that every ending is reachable.

There is also a fork test that runs against the live ATS deployment. It is
opt-in, because it needs the network and a judge should be able to run the
suite offline:

```bash
FORK=1 forge test --match-path "test/fork/*" -vv
```

## Security notes

- **No oracle, no liquidation, no admin price path.** The repayment is fixed at
  award and only time and payment decide the outcome.
- **`claim` pays the lender recorded in storage, never the caller** — which is
  exactly why it is safe to hand to the network as a scheduled call.
- **Reentrancy** is guarded on every state-changing entry point, and accounting
  is written before transfers regardless.
- **Empty returndata is only trusted from an address that has code.** On Hedera
  a call to a codeless address succeeds with zero bytes, and so does a native
  HTS token — accepting that would let `award` mark a position funded while no
  cash moved. Established on testnet with `src/demo/HtsProbe.sol`.
- **A standing bid counts against an underwriter's ceiling**, so twenty best
  bids cannot each pass their limit check and breach it together on award.
- **The offering document is fetched over http/https only**, size-capped and
  hashed in the browser. A security pointing its document at a `javascript:`
  URI is refused rather than rendered as a link.

## Licence

MIT — see [LICENSE](LICENSE).
