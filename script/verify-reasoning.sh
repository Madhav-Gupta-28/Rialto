#!/usr/bin/env bash
# Does the bid on-chain carry the hash of an explanation published before it?
#
# That is the whole accountability claim, and it is checkable from cold by
# anyone: the agent writes its reasoning to a Hedera consensus topic, then puts
# that message's hash into the bid. Consensus timestamps the reasoning, so it
# cannot have been written to fit an outcome it predates.
#
# The check runs in the direction that proves something. It reads `reasoningRef`
# off the chain first, then looks for the consensus message that hashes to it —
# rather than picking a message and hoping. That ordering matters because a
# request can carry more than one published opinion: before the agent learned to
# treat a refused bid as an answer, a bid that lost to its own earlier one was
# retried, and the second opinion was published and then discarded. Searching by
# recency finds that orphan and reports a mismatch on a request where the claim
# is true.
#
# A message over 1024 bytes is split into chunks by the SDK, and the hash is
# over the whole message — so the chunks are joined before hashing.
#
#   script/verify-reasoning.sh 22
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

ID="${1:?usage: verify-reasoning.sh <requestId>}"
MIRROR="${MIRROR_NODE:-https://testnet.mirrornode.hedera.com/api/v1}"
GET='get(uint256)((address,uint64,uint8,address,uint64,bool,address,uint64,address,uint256,uint256,uint256,bytes32,bytes32))'

field() {
  cast call "$MARKET_ADDRESS" "$GET" "$ID" --rpc-url "$HEDERA_TESTNET_RPC" \
    | tr -d '()' | tr ',' '\n' | awk '{print $1}' | sed -n "$1p"
}

REF=$(cast call "$MARKET_ADDRESS" 'bestBid(uint256)((address,address,uint256,bytes32))' "$ID" \
  --rpc-url "$HEDERA_TESTNET_RPC" | tr -d '()' | tr ',' '\n' | sed -n 4p | awk '{print $1}')

TERM=$(field 2); DUE=$(field 8)
AWARDED=$(( DUE - TERM ))

echo "request $ID"
echo "  reasoningRef on chain   $REF"

if [ "$REF" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
  echo "  no reasoning reference — this bid was placed by hand, not by an agent"
  exit 0
fi

# Every chunk of one message shares an initial_transaction_id; an unchunked
# message has none, so it is grouped on its own sequence number. Each group is
# emitted as one line the shell can hash.
# The public mirror node rate-limits and occasionally answers with something
# that is not JSON. Retry rather than showing a stack trace.
CANDIDATES=$(curl -s --retry 3 --retry-delay 2 --retry-all-errors --max-time 30 \
  "$MIRROR/topics/$HCS_TOPIC_ID/messages?limit=200&order=desc" \
| ID="$ID" python3 -c '
import sys, json, base64, os, collections
want = os.environ["ID"]
raw = sys.stdin.read()
try:
    messages = json.loads(raw)["messages"]
except Exception:
    sys.stderr.write("  the mirror node did not return readable JSON — try again in a moment\n")
    sys.exit(2)
groups = collections.defaultdict(list)
for m in messages:
    info = m.get("chunk_info") or {}
    origin = info.get("initial_transaction_id") or {}
    key = (origin.get("account_id"), origin.get("transaction_valid_start")) if origin else m["sequence_number"]
    groups[key].append((info.get("number", 1), m["consensus_timestamp"], m["sequence_number"], base64.b64decode(m["message"])))

for parts in groups.values():
    body = b"".join(p for _, _, _, p in sorted(parts))
    try:
        published = json.loads(body)
    except Exception:
        continue
    if str(published.get("requestId")) != want:
        continue
    seqs = "+".join(str(s) for _, _, s, _ in sorted(parts))
    at = min(t for _, t, _, _ in parts)
    amount = published.get("repayAmount")
    rate = published.get("rateBps")
    print("|".join([seqs, str(at), str(amount), str(rate), str(len(body)), body.hex()]))
')

if [ -z "$CANDIDATES" ]; then
  echo "  no message on topic $HCS_TOPIC_ID names request $ID"
  echo "  (the topic holds the most recent 200 messages; an older request may have scrolled off)"
  exit 1
fi

TOTAL=$(echo "$CANDIDATES" | wc -l | tr -d ' ')
echo "  opinions on the topic   $TOTAL"
echo

MATCHED=0
while IFS='|' read -r SEQ AT AMOUNT RATE SIZE HEX; do
  H=$(cast keccak "0x$HEX")
  if [ "$H" = "$REF" ]; then
    MATCHED=1
    echo "  MATCH — sequence $SEQ"
    echo "    $SIZE bytes, says bid $AMOUNT at ${RATE}bps"
    echo "    published at consensus  $AT"
    echo "    awarded at              $AWARDED"
    if [ "${AT%%.*}" -lt "$AWARDED" ]; then
      echo "    the reasoning predates the award by $(( AWARDED - ${AT%%.*} ))s"
    else
      echo "    WARNING: the reasoning does NOT predate the award"
    fi
  else
    echo "  sequence $SEQ — says bid $AMOUNT, hashes to ${H:0:18}… (not this bid)"
  fi
done <<< "$CANDIDATES"

echo
if [ "$MATCHED" = "1" ]; then
  echo "  The bid on chain carries the hash of a message the network timestamped"
  echo "  before the award. It cannot have been written to fit the outcome."
else
  echo "  NO MATCH. No message on this topic hashes to the reference in the bid."
  exit 1
fi
