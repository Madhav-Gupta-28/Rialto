import { AccountId, Client, Hbar, PrivateKey, TransferTransaction } from "@hashgraph/sdk";

/**
 * Put HBAR on an EVM address that has never been used.
 *
 * This cannot be done over JSON-RPC. Hedera creates the account from its alias
 * and that path is a native TransferTransaction, not an EVM value transfer, so
 * `eth_sendRawTransaction` with a value and no calldata comes back status 0
 * with no reason attached — see ARCHITECTURE.md §3.9.
 *
 * Only creation needs this. Once the account exists every later call from that
 * key goes through the relay normally.
 *
 *   node agent/scripts/fund-account.mjs 0xabc… 6
 */
const [evmAddress, amount] = process.argv.slice(2);
if (!evmAddress || !amount) {
  console.error("usage: fund-account.mjs <0x evm address> <hbar>");
  process.exit(1);
}

const operator = process.env.OPERATOR_ACCOUNT_ID;
const key = process.env.PRIVATE_KEY;
if (!operator || !key) {
  console.error("set OPERATOR_ACCOUNT_ID (0.0.x) and PRIVATE_KEY");
  process.exit(1);
}

const client = Client.forTestnet().setOperator(AccountId.fromString(operator), PrivateKey.fromStringECDSA(key));

try {
  const receipt = await new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(operator), new Hbar(-Number(amount)))
    .addHbarTransfer(AccountId.fromEvmAddress(0, 0, evmAddress), new Hbar(Number(amount)))
    .execute(client)
    .then((tx) => tx.getReceipt(client));

  console.log(receipt.status.toString(), evmAddress, `${amount} HBAR`);
} finally {
  client.close();
}
