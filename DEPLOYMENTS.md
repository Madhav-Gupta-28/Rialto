# Deployments

## Hedera Testnet (chain 296)

| Contract | Address | Size | Deploy cost |
|---|---|---|---|
| `Mandates` | [`0x3C1c0Bc7543874Ba214a6edcBB6798fC9d1caF8e`](https://hashscan.io/testnet/contract/0x3C1c0Bc7543874Ba214a6edcBB6798fC9d1caF8e) | 1,730 B | 427,410 gas / 0.4702 HBAR |
| `RialtoMarket` | [`0x246ECBb8A66e2390214b97CeC43143d86701c4C3`](https://hashscan.io/testnet/contract/0x246ECBb8A66e2390214b97CeC43143d86701c4C3) | 9,735 B | 2.4007 HBAR |

Deployed 2026-09-05. Operator `0.0.8127508`.

### Verify it yourself

Nothing here has to be taken on trust. Every line below reads live state.

```bash
RPC=https://testnet.hashio.io/api
MARKET=0x246ECBb8A66e2390214b97CeC43143d86701c4C3

call () { curl -s -X POST $RPC -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$MARKET\",\"data\":\"$1\"},\"latest\"]}"; }

call $(cast sig 'mandates()')       # -> 0x…3c1c0bc7543874ba214a6edcbb6798fc9d1caf8e
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

| Contract | Address | Note |
|---|---|---|
| `Mandates` | `0x3C1c0Bc7543874Ba214a6edcBB6798fC9d1caF8e` | unchanged |
| `RialtoMarket` | [`0x39535E5FC4C2B285561A00E66d1563Debb4C0C9C`](https://hashscan.io/testnet/contract/0x39535E5FC4C2B285561A00E66d1563Debb4C0C9C) | current |
| `RialtoMarket` (first) | `0x246ECBb8A66e2390214b97CeC43143d86701c4C3` | superseded — could not reach the Schedule Service |
| `DemoCash` | `0x55e9BAF7dCFe0e2A4E51e1BdeBB4e20d6247e365` | 6-decimal cash leg |

## The lifecycle, run on testnet

Three parties, three separate keys: borrower `0x932a7759…`, underwriter
`0x31f66ee3…`, and the underwriter's agent `0x0cA19581…`.

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
MIRROR=https://testnet.mirrornode.hedera.com/api/v1

# the reasoning, as HCS ordered it
curl -s "$MIRROR/topics/0.0.10367534/messages?limit=1&order=desc" \
  | jq -r '.messages[0].message' | base64 -d | tee msg.json
cast keccak -- 0x$(xxd -p -c 999999 msg.json)
# 0xff58c2ae6c7ec3495667ef20c4b6f0e95eb6bb34a7f0452ee68b8d022f2c2a00

# what the bid on-chain committed to
cast call 0x39535E5FC4C2B285561A00E66d1563Debb4C0C9C "bestBid(uint256)" 1 --rpc-url $RPC
# ...reasoningRef == 0xff58c2ae6c7ec349...
```

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
creator            0.0.10367270      <- the market contract itself
expiration_time    1791140001        <- one second after maturity
wait_for_expiry    true
executed_timestamp null               <- waiting
deleted            false
```

At that second, Hedera calls `claim()` on the market. Nobody has to be watching.

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
- **But don't over-set it either.** The relay reserves `gasLimit × gasPrice`
  up front and rejects the transaction if the balance cannot cover it. `-g 300`
  failed with *Insufficient funds for transfer* on an account holding 9.7 HBAR;
  `-g 140` went through and cost 2.4. Raise it only when a deployment actually
  runs out mid-constructor.
