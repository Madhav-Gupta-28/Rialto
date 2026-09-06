#!/usr/bin/env bash
# The manufactured payment, driven end to end.
#
# A coupon belongs to whoever holds the security on its record date, and while a
# loan is live that is the escrow — so the borrower, who still owns the bond and
# gets it back on repayment, is credited with nothing by the security itself.
# Repo settles that with a manufactured payment from the collateral taker to the
# collateral giver, netted at repayment rather than wired separately.
#
# For each coupon whose record date falls inside the request's term:
#
#   ahead of its record date   ask Hedera to record it on the day
#   past it, uncounted         record it now
#   already counted            leave it alone
#
# Then, if the position has already settled and something is still outstanding,
# pay it — the path repayment cannot net, being a default or a coupon recorded
# after the loan closed.
#
# Every call here is permissionless. None of it needs the borrower's key or the
# lender's, because the answer is fixed by the security's own snapshot.
#
# This is a shell script and not a forge script on purpose. Scheduling goes
# through the Hedera Schedule Service, a native system contract with no EVM
# bytecode, so forge's local simulation cannot run it and refuses the
# transaction before it is ever sent — with or without --skip-simulation.
#
#   ID=2 script/coupon.sh
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

: "${ID:?set ID to the request id}"
R="$HEDERA_TESTNET_RPC"
M="$MARKET_ADDRESS"
GET="get(uint256)((address,uint64,uint8,address,uint64,bool,address,uint64,address,uint256,uint256,uint256,bytes32,bytes32))"

field() { cast call "$M" "$GET" "$ID" --rpc-url "$R" | tr -d '()' | tr ',' '\n' | awk '{print $1}' | sed -n "$1p"; }

STATUS=$(field 3); TERM=$(field 2); DUE=$(field 8); SEC=$(field 4)
[ "$DUE" = "0" ] && { echo "request $ID was never awarded; there is no term to fall inside"; exit 1; }
AWARDED=$((DUE - TERM))
COUNT=$(cast call "$SEC" "getCouponCount()(uint256)" --rpc-url "$R")

echo "request $ID   term $AWARDED -> $DUE   coupons on the security: $COUNT"

COUPON_TUPLE="getCouponFor(uint256,address)((uint256,uint8,uint256,uint256,bool,(uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8),(uint256,uint256,bool),bool))"

for ((c = 1; c <= COUNT; c++)); do
  ROW=$(cast call "$SEC" "$COUPON_TUPLE" "$c" "$M" --rpc-url "$R" | tr -d '()' | tr ',' '\n' | awk '{print $1}')
  REACHED=$(echo "$ROW" | sed -n 5p)
  RECORD_DATE=$(echo "$ROW" | sed -n 6p)

  # Only income earned while this collateral was pledged passes through.
  if [ "$RECORD_DATE" -lt "$AWARDED" ] || [ "$RECORD_DATE" -gt "$DUE" ]; then continue; fi

  if [ "$(cast call "$M" 'couponRecorded(uint256,uint256)(bool)' "$ID" "$c" --rpc-url "$R")" = "true" ]; then
    echo "  coupon $c  already counted"
  elif [ "$REACHED" = "true" ]; then
    printf "  coupon %s  recording now                " "$c"
    cast send "$M" "$(cast calldata 'recordCoupon(uint256,uint256)' "$ID" "$c")" \
      --private-key "$PRIVATE_KEY" --rpc-url "$R" --gas-limit 1500000 >/dev/null && echo ok
  else
    printf "  coupon %s  handing to the network        " "$c"
    cast send "$M" "$(cast calldata 'scheduleCoupon(uint256,uint256)' "$ID" "$c")" \
      --private-key "$PRIVATE_KEY" --rpc-url "$R" --gas-limit 2500000 >/dev/null && echo ok
  fi
done

OWED=$(cast call "$M" "manufacturedOwed(uint256)(uint256)" "$ID" --rpc-url "$R" | awk '{print $1}')
echo "manufacturedOwed  $OWED"
echo "repaymentDue      $(cast call "$M" 'repaymentDue(uint256)(uint256)' "$ID" --rpc-url "$R" | awk '{print $1}')"

# Repayment nets the obligation. A closed position cannot, so it is paid outright.
if [ "$OWED" != "0" ] && [ "$STATUS" != "1" ]; then
  printf "settling outright, nothing left to net against  "
  cast send "$M" "$(cast calldata 'settleManufacturedPayment(uint256)' "$ID")" \
    --private-key "$PRIVATE_KEY" --rpc-url "$R" --gas-limit 2000000 >/dev/null && echo ok
fi
