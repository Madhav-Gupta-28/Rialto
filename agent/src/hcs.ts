import { keccak256, toBytes, type Hex } from "viem";

/**
 * Publishing the reasoning, before anyone knows who won.
 *
 * The bid carries a `reasoningRef` and the contract never reads it. Its whole
 * job is to bind a bid to an explanation that already existed. HCS supplies the
 * ordering and the consensus timestamp; this file supplies the binding.
 *
 * The reference is `keccak256` of the exact bytes published, not a topic and
 * sequence number. That distinction matters: a sequence number says *where* the
 * reasoning is, and could later point at something edited. A content hash says
 * *what* the reasoning was, and cannot. Anyone can list the topic, hash each
 * message, and find the one this bid committed to.
 */

export interface ReasoningRecord {
  requestId: string;
  /** The document the opinion was formed about, as the market froze it. */
  docHash: Hex;
  /** True when that hash was read off the security rather than supplied. */
  docFromChain: boolean;
  underwriter: Hex;
  agent: Hex;
  bid: boolean;
  repayAmount: string;
  rateBps: number;
  reasons: string[];
  flags: string[];
  /** Milliseconds since epoch, from the agent. Not authoritative — HCS is. */
  publishedAt: number;
}

/**
 * Serialise a record so the same content always produces the same bytes.
 *
 * `JSON.stringify` preserves insertion order, which makes the hash depend on
 * how the object happened to be built. Sorting the keys removes that, so two
 * runs that reached the same opinion produce the same reference.
 */
export function canonical(record: ReasoningRecord): string {
  return JSON.stringify(record, Object.keys(record).sort() as (keyof ReasoningRecord)[]);
}

/** The bytes32 the bid carries. */
export function reasoningRef(record: ReasoningRecord): Hex {
  return keccak256(toBytes(canonical(record)));
}

export interface Published {
  ref: Hex;
  topicId: string;
  sequenceNumber: string;
  payload: string;
}

export interface Publisher {
  publish(record: ReasoningRecord): Promise<Published>;
}

/**
 * Used when no HCS topic is configured.
 *
 * It still computes the reference honestly, so the bid is bound to reasoning
 * that exists locally — but nothing is timestamped by consensus, and the log
 * says so rather than implying a record that was never written.
 */
export class LocalPublisher implements Publisher {
  readonly published: Published[] = [];

  async publish(record: ReasoningRecord): Promise<Published> {
    const payload = canonical(record);
    const out: Published = { ref: reasoningRef(record), topicId: "(none)", sequenceNumber: "0", payload };
    this.published.push(out);
    return out;
  }
}

/**
 * Submits to a real HCS topic through the native SDK.
 *
 * HCS is not reachable from the EVM, so this is the one place the agent speaks
 * Hedera rather than Ethereum. The import is deferred so that nothing which
 * merely reads the chain has to pull in the SDK.
 */
export class HcsPublisher implements Publisher {
  constructor(
    private readonly accountId: string,
    private readonly privateKey: string,
    private readonly topicId: string,
  ) {}

  async publish(record: ReasoningRecord): Promise<Published> {
    const { Client, PrivateKey, TopicMessageSubmitTransaction } = await import("@hashgraph/sdk");

    const client = Client.forTestnet().setOperator(this.accountId, PrivateKey.fromStringECDSA(this.privateKey));
    try {
      const payload = canonical(record);
      const receipt = await (
        await new TopicMessageSubmitTransaction({ topicId: this.topicId, message: payload }).execute(client)
      ).getReceipt(client);

      return {
        ref: reasoningRef(record),
        topicId: this.topicId,
        sequenceNumber: receipt.topicSequenceNumber?.toString() ?? "0",
        payload,
      };
    } finally {
      client.close();
    }
  }
}
