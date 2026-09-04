# The underwriting agent

An agent that reads an offering document and bids its owner's capital behind an
opinion about it.

The test for whether this is decoration is the one in ARCHITECTURE.md §2.5:
remove the component, does the mechanism still work? Remove the agent and
nobody can price a security whose risk lives in a PDF — except a human analyst,
and the argument in §1.2 is that there are not enough of them. The agent is not
computing a number a formula could produce. It is reading a legal document and
forming a credit opinion, which is what a credit analyst does.

Humans bid through the same interface and produce an identical on-chain bid.
The contract cannot tell them apart and does not care.

## What it does, in order

```
1. Watch RialtoMarket for Requested(id, …)
2. Read the collateral's document on-chain      getDocument(name)
3. Fetch the bytes from the URI
4. VERIFY keccak256(bytes) == the on-chain hash   ← refuse to reason on a mismatch
5. Reason, with the document held as evidence and never as instructions
6. Decide: a repayment amount, or no bid at all
7. Publish the reasoning to HCS                   ← before the outcome is known
8. Submit bid(id, repayAmount, hcsRef)
```

Step 4 is not optional. An agent that reasons over a document whose bytes do not
match the on-chain hash is reasoning about a document nobody committed to.

Step 7 happens before step 8, and therefore before anyone knows who won. The HCS
consensus timestamp is what makes the reasoning non-retrofittable.

## Mandate versus strategy

```
MANDATE   on-chain, enforced by RialtoMarket, cannot be exceeded
          agent · maxPerDeal · maxTotal · minRateBps · maxTerm · allowedAssets

STRATEGY  off-chain, plain English, editable
          "Senior secured paper only. Add 200bps for an unrated issuer.
           Never bid when the loan term runs past the instrument's maturity."
```

Judgment is soft. Authority is hard and on-chain. A stolen agent key can do
nothing its owner did not already authorise, and the worst case is a bad deal
inside the owner's own limits, funded with the owner's own money.

## Run

```bash
npm install
npm test
npm start
```
