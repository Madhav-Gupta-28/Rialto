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
