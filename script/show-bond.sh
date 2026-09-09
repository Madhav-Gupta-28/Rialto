#!/usr/bin/env bash
# Ask the collateral what it is.
#
# HashScan cannot answer this. RDN27 is an ATS diamond, so an explorer
# that only reads storage and bytecode shows a contract id and three
# empty fields — nothing that says "bond". The security answers happily
# when you call it, and every call below is a standard one: name and
# symbol from ERC-20, the holder register from ERC-3643, the offering
# document from ERC-1643. None of them are Rialto's own.
#
# The last two lines are the ones that matter. The document's location
# and its hash are stored on the token, written by the issuer — which is
# why a lender can price this bond without trusting us, and why swapping
# the file after a loan opens shows up as a mismatch.
#
#   script/show-bond.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

B="${BOND_ADDRESS:-0x52Ea050Fe77A303b1A61fe15d8894892aFF02114}"
R="${HEDERA_TESTNET_RPC:-https://testnet.hashio.io/api}"
c() { cast call "$B" "$1" --rpc-url "$R"; }

echo
echo "  the bond    $B"
echo
printf "  name              %s\n" "$(c 'name()(string)')"
printf "  symbol            %s\n" "$(c 'symbol()(string)')"
printf "  holders           %s\n" "$(c 'getTotalSecurityHolders()(uint256)')"
echo
echo "  its offering document, read off the token (ERC-1643):"
cast call "$B" "getDocument(bytes32)(string,bytes32,uint256)" \
  "$(cast format-bytes32-string prospectus)" --rpc-url "$R" \
  | sed -n '1p;2p' | sed 's/^/    /'
echo
