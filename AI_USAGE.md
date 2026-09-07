# AI usage

I built Rialto with Claude (Anthropic) as a coding assistant, through Claude
Code. This file says plainly where it was used and where it was not, because a
vague answer is worse than an honest one.

## Where it was used

Most of the code in this repository was written with AI assistance. Rather than
list a handful of files and imply the rest is untouched, assume the whole tree
is AI-assisted:

- `src/` — the contracts: `RialtoMarket`, `Mandates`, `ComplianceLens`,
  `CouponPassThrough`, and the ATS / ERC-1643 / HSS interfaces
- `agent/src/` — the underwriting agent, including the HCS publisher and the
  coupon projection
- `web/` — the Next.js front end
- `test/`, `agent/test/`, `web/test/` — the test suites, including the Foundry
  fuzz and invariant tests
- `README.md`, `ARCHITECTURE.md`, `DEPLOYMENTS.md`

It was also used to diagnose failures: decoding revert selectors, reading
mirror-node receipts, and working out undocumented behaviour in Asset
Tokenization Studio and the Hedera Schedule Service.

## What was mine

**The idea and the financial model.** Rialto exists because a tokenized bond
posted as collateral keeps paying its coupon to whoever holds it on the record
date — which, while a loan is live, is the escrow and not the borrower who still
owns it. Repo settles that with a manufactured payment from the collateral taker
to the collateral giver, netted against the repurchase price rather than wired
separately. That mechanism, why it matters, and the decision to build the whole
project around it are mine. So is every product decision: what the agent is
allowed to do, what a mandate constrains, what the borrower sees, and what the
system refuses to do.

**All the testing that mattered.** Every transaction in `DEPLOYMENTS.md` was
sent from my own keys against Hedera testnet, and I clicked through the entire
flow by hand rather than trusting the suite. That is where the real bugs were:
a repayment that pulled `repaymentDue` while the app only ever approved the
principal; an approve control that lived in a panel the borrower no longer sees
by the time they need it; an agent reading the deployer's key instead of the one
holding the mandate, so every bid it placed would have been rejected; a
formatter that truncated to two decimal places and rendered a short loan's
entire fee as zero. None of those were reachable from a unit test. All of them
were found by using the thing.

**Judgement about what to keep.** The AI proposed plenty that is not in this
repo. Deciding what was actually true, what was worth building, and what to
throw away was the work.

## What the AI did not do

It has no keys and never had. It did not deploy anything, sign anything, or move
any value. Every contract on Hedera testnet was deployed by me, and every
transaction referenced in this repo was authorised by me.
