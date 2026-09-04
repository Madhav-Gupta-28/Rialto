import "dotenv/config";
import { Client, PrivateKey, TopicCreateTransaction } from "@hashgraph/sdk";

/**
 * Create the HCS topic the agents publish their reasoning to.
 *
 * Run once. The topic id goes in .env as HCS_TOPIC_ID.
 *
 * Deliberately no submit key: anyone may publish to this topic. A submit key
 * would let whoever holds it decide whose reasoning is allowed to exist, which
 * is the opposite of what the record is for. The binding that matters is not
 * "only approved agents wrote here" — it is that a bid on-chain carries the
 * hash of a message that already had a consensus timestamp. Nobody can forge
 * that after the fact, and a topic full of other people's opinions does not
 * weaken it.
 */
async function main(): Promise<void> {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const key = process.env.PRIVATE_KEY;
  if (!accountId || !key) throw new Error("HEDERA_ACCOUNT_ID and PRIVATE_KEY must be set");

  const client = Client.forTestnet().setOperator(accountId, PrivateKey.fromStringECDSA(key));
  try {
    const receipt = await (
      await new TopicCreateTransaction()
        .setTopicMemo("Rialto — underwriting reasoning, published before the outcome is known")
        .execute(client)
    ).getReceipt(client);

    console.log("HCS_TOPIC_ID=" + receipt.topicId!.toString());
  } finally {
    client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
