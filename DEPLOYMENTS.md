# Deployments

## Hedera Testnet (chain 296)

| Contract | Address | Hedera id | Size |
|---|---|---|---|
| `Mandates` | [`0xb4F8cB274387A5190CeF7582004558809f8547a4`](https://hashscan.io/testnet/contract/0xb4F8cB274387A5190CeF7582004558809f8547a4) | `0.0.10373522` | 1,766 B |
| `RialtoMarket` | [`0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4`](https://hashscan.io/testnet/contract/0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4) | `0.0.10382007` | 14,552 B |

Deployed 2026-09-05. Operator `0.0.8127508`. These are the live contracts —
everything below runs against them. Two earlier deployments were superseded
during the build; both are listed with their reasons under
[The market](#the-market).

### Verify it yourself

Nothing here has to be taken on trust. Every line below reads live state.

```bash
RPC=https://testnet.hashio.io/api
MARKET=0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4

call () { curl -s -X POST $RPC -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$MARKET\",\"data\":\"$1\"},\"latest\"]}"; }

call $(cast sig 'mandates()')       # -> 0x…b4f8cb274387a5190cef7582004558809f8547a4
call $(cast sig 'MAX_TERM()')       # -> 5184000  (60 days)
call $(cast sig 'AWARD_WINDOW()')   # -> 604800   (7 days)

# the rate the unit tests assert, computed on-chain:
# 800 of fee on 100,000 over 30 days = 973 bps
call $(cast calldata 'rateBps(uint256,uint256,uint64)' 100000000000 100800000000 2592000)
```

Confirmed on-chain: `mandates()` points at the deployed `Mandates`, `MAX_TERM`
is 5,184,000 seconds, and `rateBps` returns **973**, matching
`test_rateBps_matchesTheWorkedExample`.

### Why MAX_TERM is 60 days

Not a preference — a measured network limit. Hedera refuses a scheduled
transaction whose expiry is more than `scheduling.maxExpirationFutureSeconds`
= 5,356,800 seconds (62 days) ahead. Verified live on testnet *and* mainnet:

```bash
# hasScheduleCapacity(now + N, 200000 gas) against the HSS system contract
NOW=$(date +%s)
probe () { D=$(cast calldata "hasScheduleCapacity(uint256,uint256)" $1 200000)
  curl -s -X POST $RPC -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"0x000000000000000000000000000000000000016b\",\"data\":\"$D\"},\"latest\"]}"; echo; }
probe $((NOW+86400))    # 1  day  -> true
probe $((NOW+5356800))  # 62 days -> true   (exactly the ceiling)
probe $((NOW+5443200))  # 63 days -> false
```

A 90-day term could not have its settlement scheduled at award, so the constant
is 60 with two days of margin.

## The security Rialto underwrites

Issued through the live ATS factory on 2026-09-05, not mocked.

| | |
|---|---|
| Bond | [`0x52ea050fe77a303b1a61fe15d8894892aff02114`](https://hashscan.io/testnet/contract/0x52ea050fe77a303b1a61fe15d8894892aff02114) |
| Name / symbol | Rialto Demo Senior Note 2027 · `RDN27` · 18 decimals |
| Deploy | tx `0xedcad6ef…735a6a5b`, 7,570,717 gas |
| Control list | active (whitelist mode), `RialtoMarket` admitted |
| Document | `prospectus` -> `ipfs://bafyrialtoprospectus` |
| Document hash | `0x09540aec3448e751a6173ccfd75fd8b9eaf023807261233e48cfff5ff0e55aa4` |
| Issued | 1,000,000 RDN27 |

### The gate, checked from the chain

```bash
BOND=0x52ea050fe77a303b1a61fe15d8894892aff02114
PROS=$(cast format-bytes32-string "prospectus")

# what the security says its document is
cast call $BOND "getDocument(bytes32)" $PROS --rpc-url $RPC

# what the bytes actually hash to
cast keccak "Rialto demo prospectus v1"
# 0x09540aec3448e751a6173ccfd75fd8b9eaf023807261233e48cfff5ff0e55aa4
```

Both sides agree. That is the whole claim: the document is on the security,
under a role-gated write, and anyone can check it without trusting us.

## The market

The front end reads these addresses directly — no backend, no indexer, so every
figure on the page is a contract call. `cd web && npm run dev`.


| Contract | Address | Note |
|---|---|---|
| `Mandates` | [`0xb4F8cB274387A5190CeF7582004558809f8547a4`](https://hashscan.io/testnet/contract/0xb4F8cB274387A5190CeF7582004558809f8547a4) | **current**, post-audit |
| `RialtoMarket` | [`0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4`](https://hashscan.io/testnet/contract/0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4) | **current** (`0.0.10382007`) |
| `RialtoMarket` (coupon pass-through) | `0x59d8b1e3d3e8691de6e6a5012fa90c09ba987686` | superseded — a coupon larger than the repayment was kept by the lender |
| `RialtoMarket` (no coupons) | `0xC7C915740e670f85743304019302D8760F857a0a` | superseded |
| `RialtoMarket` (audited, wrong schedule margin) | `0x548cdcCd7386a9E64F74B2c46a5021b77c2d5C15` | superseded |
| `Mandates` (first) | `0x3C1c0Bc7543874Ba214a6edcBB6798fC9d1caF8e` | superseded — one owner could unbind another's agent |
| `RialtoMarket` (second) | `0x39535E5FC4C2B285561A00E66d1563Debb4C0C9C` | superseded — pre-audit |
| `RialtoMarket` (first) | `0x246ECBb8A66e2390214b97CeC43143d86701c4C3` | superseded — could not reach the Schedule Service |
| `ComplianceLens` | [`0xd65580d345aE3c13Ce58586C0891b67198f23246`](https://hashscan.io/testnet/contract/0xd65580d345aE3c13Ce58586C0891b67198f23246) | **current** (`0.0.10382009`); read-only, says *why* a settlement is blocked |
| `ComplianceLens` (bound to the superseded market) | `0xe4f8b3d806914fc9e782e280e8de6a0f0f9b6470` | superseded with the market it points at |
| `ComplianceLens` (first) | `0xec0d6b732a0fc4ad951904ba45bbaea6be727452` | superseded — never checked the escrow's own standing |
| `DemoCash` | `0x55e9BAF7dCFe0e2A4E51e1BdeBB4e20d6247e365` | 6-decimal cash leg |

Every contract is **verified**, and readable as source on HashScan:

```
RialtoMarket    0x9040986Da679d00F0AA93ca21E1c9Aa2143121a4   match
ComplianceLens  0xd65580d345aE3c13Ce58586C0891b67198f23246   match
Mandates        0xb4F8cB274387A5190CeF7582004558809f8547a4   match
DemoCash        0x55e9baf7dcfe0e2a4e51e1bdebb4e20d6247e365   match
```

Verification goes through Sourcify. Hedera's own instance at
`server-verify.hashscan.io` now 308-redirects to `sourcify.dev/server`, and that
redirect drops the path — so a request to the old host answers `Cannot GET /`
rather than failing usefully, which reads like the contract is unverified when
the endpoint has simply moved. Chain 296 is supported there:

```bash
forge verify-contract <address> src/RialtoMarket.sol:RialtoMarket \
  --chain-id 296 --verifier sourcify \
  --verifier-url https://sourcify.dev/server --compiler-version 0.8.24

curl -sL https://sourcify.dev/server/v2/contract/296/<address>
```

## The lifecycle, run on testnet

Three parties, three separate keys: borrower `0x932a7759…`, underwriter
`0x31f66ee3…`, and the underwriter's agent `0x0cA19581…`.

These three requests ran on the **first** market, `0x246ECBb8…`, and are still
readable there. The request numbers below are that contract's, not the current
one's — the current market has its own, later run, listed under *Compliance*.

| Request | Outcome | What it shows |
|---|---|---|
| #0 | declined by the agent | The document was replaced after the request opened. The request had frozen the old hash, the fetched bytes no longer matched, and the agent refused to reason. A bid cannot be moved by swapping the document underneath it. |
| #1 | **Repaid** | Borrower took 100,000 dUSD against 105,000 RDN27, repaid 100,493.15, collateral returned. The underwriter earned 493.15. |
| #2 | **Defaulted** | Term ran out unpaid. `claim` handed the 10,500 RDN27 to the lender. No auction, no liquidator, no price. |

Afterwards `liveExposure` and `reservedExposure` are both zero: the accounting
closed out.

The bid on #1 was placed by the agent, and the market records both parties:

```
underwriter  0x31f66ee3…   the capital, and the loss if it goes wrong
submitter    0x0cA19581…   the agent key that actually signed
repayAmount  100,493.150685 dUSD
rateBps      600           the mandate floor, computed identically off-chain
reasoningRef 0xed0b2a16e115fc7a…
```

## The manufactured payment, proven end to end

A coupon belongs to whoever holds the security on its record date. While a loan
is live that is the escrow — so the borrower, who still owns the bond and gets
it back on repayment, is credited with nothing by the security itself.

### The bug, on a real ATS coupon

`ROLE_CORPORATE_ACTION` granted, a real coupon set on the live RDN27 bond with a
record date inside a live loan, 10,500 pledged and 4,200 held directly:

```
escrow (RialtoMarket)   tokenBalance 10,500.00   payable 143.785674
borrower                tokenBalance  4,200.00   payable  57.514269
```

The coupon on the borrower's own bond accrued to a contract with no way to
spend it.

### The correction, performed by the network

Coupon `#4`, record date `1788617561`, inside a loan running
`1788617392 → 1788619192`. `scheduleCoupon` booked it; nobody touched it after
that.

```
schedule 0.0.10379023   executed_timestamp 1788617621.148907690

manufacturedOwed(0)   143.818968 dUSD     <- established by the network
couponRecorded(0,4)   true
repaymentDue(0)       9,856.215278 dUSD   <- 10,000.034246 - 143.818968
```

### Netted at repayment, to the unit

```
                  before            after           delta
lender      864,542.465754   874,398.681032   +9,856.215278
borrower    140,457.534246   130,601.318968   -9,856.215278
escrow RDN27      10,500.00             0.00

agreed repayment   10,000.034246
coupon netted         143.818968
expected            9,856.215278   exact match
```

Status `Repaid`, collateral home, `manufacturedOwed` back to zero. The lender
simply received less, which is how repo settles a manufactured payment and why
the obligation needs no enforcement anywhere.

## One scheduled call per transaction

`NO_SCHEDULING_ALLOWED_AFTER_SCHEDULED_RECURSION`.

Hedera permits at most one scheduled call per transaction. An `award` that books
its own settlement *and* a coupon record date is rejected outright — so a coupon
falling inside the term would have stopped anyone borrowing against that bond at
all. Found when an award that had worked all day started reverting the moment a
coupon landed in the window.

Confirmed with the cheapest possible experiment rather than by reading: once the
coupon's record date had passed, `award` skipped it, attempted one schedule
instead of two, and simulated clean.

So `award` books the settlement, which is the one that must not be forgotten,
and `scheduleCoupon` books a record date in a separate transaction that anyone
may send. `recordCoupon` stays permissionless either way, so a coupon nobody
books is still claimable by hand.

## Settlement the network performed, unattended

The claim is no longer that Hedera *will* call `claim` at maturity. It did.

A three-minute loan was awarded and then deliberately abandoned — nobody
watched it, nobody sent a transaction. At maturity plus the margin:

```
schedule            0.0.10377580
executed_timestamp  1788609059.141412073
transaction         CONTRACTCALL  SUCCESS   entity 0.0.10377546   fee 0.271 HBAR
```

```
request #0 status   Defaulted
lender              0x31f66ee3…   +2,100 RDN27
liveExposure        0
```

No keeper, no bot, no cron. The market contract paid for its own settlement out
of the HBAR balance it holds for exactly that.

### It took three attempts, and the first two are the interesting part

The first two schedules fired on time and **reverted**. Both cheaply — about
0.035 HBAR, roughly thirty thousand gas — where an out-of-gas at a 400,000
limit would have cost fifteen times that. That fee is the whole tell: a cheap
revert is a failed `require`, not an exhausted budget.

Two hypotheses were tested and discarded. Gas looked likely, and
`eth_estimateGas` then reported 277,394 against a 400,000 budget, which sent the
search elsewhere. The answer came from measuring instead — see §3.6b: a
scheduled call sees a `block.timestamp` that lags the second it was scheduled
for, so `dueAt + 1` produced a call whose own time check said the loan had not
matured. `SETTLEMENT_MARGIN` is 60 seconds now.

Nothing was ever stuck. A manual `claim` remained available throughout and was
used to settle the two stranded positions. But they sat `Funded` past maturity,
which is exactly the state the schedule exists to prevent — and no local test
could have caught it, because Foundry's clock has no lag.

## The reasoning record

Topic **`0.0.10367534`** — every underwriting opinion, published before anyone
knows who won.

The bid on the market carries a `reasoningRef`. The contract never reads it; its
only job is to bind a bid to an explanation that already existed. The reference
is `keccak256` of the exact bytes published, not a topic and sequence number — a
sequence number says *where* the reasoning is and could later point at something
edited, a content hash says *what* it was and cannot.

### Check it end to end

```bash
script/verify-reasoning.sh 9
```

```
reassembled        1160 bytes from 2 chunk(s)
consensus at       1788788687.854026237
it says            bid 2000381816 at 696bps
keccak(reasoning)  0xdc59ee25d5886ff0d34466f04f0af185f62d941a5f4d353a55ba9d118e69fd5b
reasoningRef       0xdc59ee25d5886ff0d34466f04f0af185f62d941a5f4d353a55ba9d118e69fd5b
```

**Reassembly is not a detail.** The SDK splits a message over 1,024 bytes into
chunks, and the hash is over the whole message — so reading `messages[0]` and
hashing it works for a terse opinion and silently fails for a considered one. A
model's reasoning routinely runs past that limit; request 9 above needed two
chunks. Anyone checking a single message and finding no match is looking at half
an explanation.

Measured on this run:

```
reasoning consensus   1788548384.311754
bid consensus         1788548388.699948
                      the reasoning is 4.388s older than the bid it explains
```

That ordering is the point. The explanation reached consensus before the bid
that carries its hash, so it cannot have been written to fit the outcome. The
published record itself:

```json
{
  "agent": "0x0cA19581080F5dcaB2459296CeCa82f87BE820D9",
  "underwriter": "0x31f66ee3A1933b42e9d1904373f97ca6f900A89C",
  "requestId": "1",
  "docHash": "0xbcef65bcc05930a40437ef62f4df6ef7f31e30be53fcc1ced62f653ba54050dc",
  "docFromChain": true,
  "bid": true,
  "repayAmount": "10049315069",
  "rateBps": 600,
  "reasons": ["senior, with a stated maturity"],
  "flags": []
}
```

The topic has **no submit key**, deliberately. A submit key would let whoever
holds it decide whose reasoning is allowed to exist, which is the opposite of
what the record is for. The binding that matters is not that only approved
agents wrote there — it is that a bid carries the hash of a message which
already had a consensus timestamp. A topic full of other people's opinions does
not weaken that.

## Settlement the network performs itself

Awarding on the current market emits `SettlementScheduled`, and the schedule is
a real Hedera entity — not a keeper, not a bot:

```bash
curl -s https://testnet.mirrornode.hedera.com/api/v1/schedules/0.0.10367472
```

```
schedule_id        0.0.10367472
creator            0.0.10367270      <- the account that paid for the award tx
payer              0.0.10367414      <- the market contract, which pays when it fires
expiration_time    1791140001        <- one second after maturity
wait_for_expiry    true
executed_timestamp null               <- waiting
deleted            false
```

`creator` is whoever sent the award transaction, not the contract — worth
stating plainly, because it is the field that looks like it should be the
contract and is not. The contract shows up as `payer`, which is why the market
needs an HBAR balance at all.

The claim that the network will call `claim` is better checked against the
scheduled body itself, which is 68 bytes and decodes to exactly that:

```
contains the market address 0x39535e5f…   true
contains claim(uint256) selector          true   (0x379607f5)
scheduled calldata                        0x379607f5 0000…0000
```

So at that second Hedera calls `claim(0)` on the market. Nobody has to be
watching.

Repaying releases it. Verified on the schedule the audited market created and
then cancelled:

```
schedule_id  0.0.10373549
deleted      true
executed_timestamp null
```

### The bug that made the first market unable to do this

Hedera's Schedule Service is a **native** system contract: it answers calls but
has no EVM bytecode, so `eth_getCode` on `0x…016b` returns `0x`. That defeats
both obvious approaches, in opposite directions:

- A high-level Solidity call emits an `extcodesize` check first, so it reverts
  before the call is made — and `try/catch` cannot catch it, because the revert
  happens in the caller's own frame.
- Guarding on `address(HSS).code.length == 0` reads zero **on Hedera**, and
  silently disables scheduling on the only network that has it.

The first fix caused the second. The working version uses raw `staticcall` and
`call` with returndata length checks: on Hedera they reach the service, and on a
chain with nothing deployed there they return success with empty returndata,
which reads as "no scheduling here" and degrades to a manual `claim()`.

The regression test uses `vm.mockCall` rather than `vm.etch`, because `mockCall`
makes an address answer *without giving it code* — the exact shape of a Hedera
system contract.

## The lifecycle on the current market, run end to end

One loan, from an open request to a settled repayment, with a coupon falling
inside the term. Every figure below was read off the chain, not computed here.

```
open        4,200 RDN27 pledged against 4,000 dUSD, 900s term
            docFromChain true, hash 0xbcef65bc… read off the security itself
bid         4,010.000000 dUSD
award       Funded, dueAt 1788635260
            settlement booked with the network: schedule 0x…9E6Ae6

the issuer declares coupon 6 — 5% annual, record date 1788634517, inside the term
scheduleCoupon books it; nobody touches it afterwards

            manufacturedOwed   57.534246 dUSD   <- established by the network
            couponRecorded     true
            repaymentDue    3,952.465754 dUSD   <- 4,010.000000 - 57.534246

repay       lender received  3,952.465754 dUSD
            borrower paid    3,952.465754 dUSD
            collateral returned 4,200 RDN27, escrow 0
            status Repaid, manufacturedOwed 0
```

The borrower never sees a coupon payment and never chases one. They simply owe
less, which is how a repo settles a manufactured payment and why the obligation
needs no enforcement.

## The agent prices what it will have to hand back

A coupon paying inside the term is the lender's cost. The escrow is the holder
of record, so the security pays the market and the market nets it off the
repayment — the underwriter parts with the principal and receives back less than
the number they bid.

Two requests, minutes apart, same borrower and same collateral. The only
difference is that a coupon falls inside the second one's term.

```
#1  no coupon in the term
    agent bid                        2,000.006850 dUSD   (600 bps)

#2  coupon 7 pays inside the term, still ahead of its record date
    agent projected                     28.767123 dUSD
    agent bid                        2,028.773973 dUSD   = 2,000.006850 + 28.767123

    ...record date passes, nobody intervenes...

    Hedera recorded                     28.767123 dUSD
    repaymentDue                     2,000.006850 dUSD   <- back to #1's number
```

The underwriter earns the rate its credit opinion actually called for, and the
borrower keeps the income on a bond they still own. Neither party had to notice.

The projection is the interesting part. At bid time the coupon has not paid, so
the security reports nothing about it — no balance, no nominal value (§3.10). It
is priced from its own terms instead, and the number that came out before the
fact is the number the network produced after it, to the unit.

## Compliance, shown not described

Six controls, each exercised against a live position and the real RDN27 bond.
The claim being tested is the same one every time: an issuer's control
**delays** a settlement and never destroys one — the position holds its state,
the collateral stays where it is, and the deal completes the moment the control
is lifted.

> **Which contract these ran on.** The request ids below — `#4` and `#6` through
> `#10` — are on [`0x59d8b1e3…`](https://hashscan.io/testnet/contract/0x59d8b1e3d3e8691de6e6a5012fa90c09ba987686),
> a market later superseded when a coupon larger than the whole repayment was
> found to be kept by the lender. **They will not resolve against the current
> market**, which carries requests `#0`–`#6` of its own.
>
> The findings still hold, and the reason is checkable rather than a plea.
> Every control exercised here belongs to the **security**, not to the market:
> pause, freeze, control list and KYC are ATS facets on RDN27, the same token
> the current market escrows. And the lens that reported them is the same code
> now deployed — the two runtimes differ by exactly 60 bytes, which are the
> three copies of the immutable market address:
>
> ```bash
> cast code 0xd65580d345aE3c13Ce58586C0891b67198f23246   # current
> cast code 0xe4f8b3d806914fc9e782e280e8de6a0f0f9b6470   # used in the runs below
> # 2,565 bytes each; identical once the embedded market address is removed
> ```
>
> The coupon-netting bug that forced the market redeploy is in `repay`, and
> `ComplianceLens` takes no part in settlement at all.
>
> That said, an argument is not a transaction. Re-running these against the
> current market is listed as outstanding work, and until it is done this
> section should be read as evidence about the *mechanism*, not as a receipt on
> the deployment a judge will be looking at.

`ComplianceLens` is read separately at each step. It is a view contract, it
takes no part in settlement, and it exists so a blocked party is told which
permission is missing instead of reading a bare revert.

### A pause stops a repayment without taking anything — request #7

```
award                          status Funded    escrow 2,100 RDN27
pause()
  ComplianceLens.check(7)      SecurityPaused
  borrower repays              refused          status Funded
                                                escrow 2,100 RDN27
unpause()
  ComplianceLens.check(7)      None
  borrower repays              ok               status Repaid
                                                escrow 0   borrower 8,400 RDN27
```

### A pause closes the primary market but not the auction — request #8

```
pause()
  a second borrower tries to open    refused - no new collateral can be pledged
  underwriter bids on the open one   landed, 1,015.00 dUSD
```

Bidding moves no tokens, so a paused security cannot stop it — and should not.
The pause bites at the two points where the security actually changes hands:
pledging it and settling against it.

### An address freeze on the lender, past maturity — request #4

The lender was frozen while the loan was live and the term then ran out. A
freeze on ATS is only observable as control-list removal (§3.6c), and the lens
names it that way rather than pretending it is `isFrozen`:

```
ComplianceLens.check(4)   BeneficiaryNotListed   beneficiary 0x31f66ee3… (the lender)
claim                     refused                status Funded, collateral escrowed
setAddressFrozen(false)
ComplianceLens.check(4)   None
claim                     ok                     status Defaulted
```

Note which party the lens names. Before maturity the beneficiary of a
settlement is the borrower; after it, the lender. Checking the wrong one is how
a compliance screen passes a deal it should have stopped.

### A KYC credential admitting a new underwriter — request #6

A genuinely new account — `0x65AE01F6…`, Hedera `0.0.10380891`, funded and
control-listed, holding no credential — won the auction and the loan defaulted.

```
getKycStatusFor(underwriter)   0
ComplianceLens.check(6)        BeneficiaryNoKyc
claim                          refused      status Funded, underwriter 0 RDN27

grantKyc(underwriter, "did:hedera:testnet:rialto/underwriter2", …)
getKycStatusFor(underwriter)   1
ComplianceLens.check(6)        None
claim                          ok           status Defaulted, underwriter 2,100 RDN27
```

Internal KYC is switched on for the whole security, so every settlement above
`#6` runs against a token that enforces it — including request #7's repayment.

### The escrow has a standing of its own — request #9

The one the first lens got wrong. Every settlement is a transfer *from* the
market, a permissioned security screens both sides, and under `isWhiteList` the
market has to be on the control list to hold collateral at all. So it can also
be taken off one — and then nothing settles for anybody, whatever the
beneficiary's own standing is.

Both lenses were deployed and read at the same moment against the same live
position:

```
                                shipped lens      corrected lens
loan funded, all admitted       None              None
market removed from the list    None              EscrowNotListed
  borrower repays                                 refused, status still Funded
market added back               None              None
  borrower repays                                 ok, status Repaid
```

The first lens reported a clean bill of health for a position that could not
move a token. It only ever asked about the party being paid, which is the
easier half of a question with two halves.

### The agent asks before it bids — request #10

An underwriter bids on collateral it expects to take if the loan defaults. If
the security would refuse that delivery, the recovery leg does not exist and the
bid prices a secured loan while owning an unsecured one. The agent now asks the
lens for its own standing before it reasons about anything, on the same request,
minutes apart:

```
underwriter off the control list
  #10 declined — 0x31f66ee3… cannot receive 0x52Ea050F… on default (NotListed)

underwriter readmitted
  #10 document verified against the hash frozen at open (0xbcef65bc…)
  #10 reasoning published — ref 0x00e80585… seq 8
  #10 bid 1000001142 at 600bps — 0xc15dde29…
```

It declines before fetching the document and before publishing anything, so a
position it cannot recover costs no HCS message and no fee. With no
`LENS_ADDRESS` configured the check is skipped and reported as skipped — unknown
is not treated as clear.

## The document

Published, so the claim is checkable by anyone rather than only by us.

| | |
|---|---|
| URI on the security | https://gist.githubusercontent.com/Madhav-Gupta-28/42caf0455877bc587238c13419a44030/raw/prospectus.txt |
| Hash on the security | `0xbcef65bcc05930a40437ef62f4df6ef7f31e30be53fcc1ced62f653ba54050dc` |

```bash
curl -sL <the URI above> -o p.txt
cast keccak -- 0x$(xxd -p -c 999999 p.txt)
# 0xbcef65bcc05930a40437ef62f4df6ef7f31e30be53fcc1ced62f653ba54050dc
```

Both sides agree, and nothing in that check trusts this repository.

## Sending transactions to ATS: use cast, not forge script

`forge script` executes the script body locally against forked state, which for
an ATS diamond means hundreds of `eth_getStorageAt` calls through the relay.
Hedera's mirror node times out under that load:

```
Failed to get storage for 0xBA2D5FC2…18E0a
Mirror node upstream failure: statusCode=504, timeout of 30000ms exceeded
```

The transactions above were sent with `cast send` instead, which forks nothing
and never touches storage it does not need. The scripts are kept because they
document the sequence and are testable locally, but the live path is `cast`.

## Asset Tokenization Studio (not ours — the live ATS deployment we build on)

| Contract | Hedera ID | EVM address |
|---|---|---|
| Factory | `0.0.9213391` | `0xd1F118A40f3b02883D35909eF2517e7EDd78379d` |
| Business Logic Resolver | `0.0.9212226` | `0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a` |

The published ATS docs are stale and still list the v4.0.0 addresses from
January; these come from the repository's own `apps/ats/web/.env.example`
shipped with v8.0.0, and were checked against the chain.

Configuration ids are enumerated rather than assumed — the resolver reports 8
registered, ids `0x…01` through `0x…08`, and **BOND is id 2 at version 1**.

## Gas notes for Hedera

- **Hedera charges for gas *used*, not the gas limit.** Measured: the `Mandates`
  deployment used 427,410 gas and cost 0.4702 HBAR, against a gas price of
  1.16e-6 HBAR/gas — 0.4958 at the limit, so the unused portion came back.
- **`forge script --gas-limit` does nothing.** Forge treats it as an alias for
  `--block-gas-limit`. The flag that matters is `-g` /
  `--gas-estimate-multiplier`.
- **There is no single right multiplier — it depends on the call.** The relay
  reserves `gasLimit × gasPrice` up front and rejects the transaction if the
  balance cannot cover the reservation. A `deployBond` needs `-g 2500` because
  the relay under-reports constructor gas badly; an ordinary call fails at
  `-g 300` on a 9.7 HBAR account with *Insufficient funds for transfer* and
  goes through at `-g 140` for 2.4 HBAR. Full table in ARCHITECTURE.md §3.4.5.
- *Insufficient funds for transfer* on an account that visibly has funds means
  the reservation, not the fee. Lower the multiplier or top up the account —
  more gas makes it worse.
