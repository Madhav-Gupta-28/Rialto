#!/usr/bin/env bash
# Does the bid on-chain carry the hash of an explanation published before it?
#
# That is the whole accountability claim, and it is checkable from cold by
# anyone: the agent writes its reasoning to a Hedera consensus topic, then puts
# that message's hash into the bid. Consensus timestamps the reasoning, so it
# cannot have been written to fit an outcome it predates.
#
# A message over 1024 bytes is split into chunks by the SDK, and the hash is
# over the whole message — so the chunks have to be joined before hashing.
# Reasoning from a model routinely runs past that limit, which is why this
# reassembles rather than reading a single message.
#
#   script/verify-reasoning.sh 9
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

ID="${1:?usage: verify-reasoning.sh <requestId>}"
MIRROR="${MIRROR_NODE:-https://testnet.mirrornode.hedera.com/api/v1}"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

curl -s "$MIRROR/topics/$HCS_TOPIC_ID/messages?limit=100&order=desc" \
| ID="$ID" OUT="$TMP" python3 -c '
import sys, json, base64, os, collections
want, out = os.environ["ID"], os.environ["OUT"]
messages = json.load(sys.stdin)["messages"]

# Every chunk of one message shares an initial_transaction_id; an unchunked
# message has none, so it is grouped on its own sequence number.
groups = collections.defaultdict(list)
for m in messages:
    info = m.get("chunk_info") or {}
    origin = info.get("initial_transaction_id") or {}
    key = (origin.get("account_id"), origin.get("transaction_valid_start")) if origin else m["sequence_number"]
    groups[key].append((info.get("number", 1), m["consensus_timestamp"], base64.b64decode(m["message"])))

for parts in groups.values():
    body = b"".join(p for _, _, p in sorted(parts))
    try:
        published = json.loads(body)
    except Exception:
        continue
    if str(published.get("requestId")) != want:
        continue
    open(out, "wb").write(body)
    print(f"  reassembled        {len(body)} bytes from {len(parts)} chunk(s)")
    print(f"  consensus at       {min(t for _, t, _ in parts)}")
    amount, rate = published.get("repayAmount"), published.get("rateBps")
    print(f"  it says            bid {amount} at {rate}bps")
    break
else:
    sys.exit(f"  no reasoning published for request {want}")
'

echo "  keccak(reasoning)  $(cast keccak "0x$(xxd -p "$TMP" | tr -d '\n')")"
echo "  reasoningRef       $(cast call "$MARKET_ADDRESS" \
  'bestBid(uint256)((address,address,uint256,bytes32))' "$ID" --rpc-url "$HEDERA_TESTNET_RPC" \
  | tr -d '()' | tr ',' '\n' | sed -n 4p | awk '{print $1}')"
echo
echo "  The two hashes must be identical, and the consensus timestamp above must"
echo "  precede the Awarded event for this request."
