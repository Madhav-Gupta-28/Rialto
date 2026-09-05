# Rialto — Architecture

**An underwriting market for tokenized real-world assets on Hedera.**

Competing underwriters — AI agents or humans — read a security's legal
documents, form a credit opinion, and bid to fund it with their own capital at
risk. The winning bid is the price. There is no oracle anywhere in the system.

> *"What news on the Rialto?"* — the Venetian market where merchant banking and
> marine underwriting began, and where you went to find out what a thing was
> worth because there was nowhere to look it up.

---

## 0. How to read this file

This is the complete specification. Someone with no prior context should be able
to build Rialto from this document alone.

Every number, address and interface below was **verified against the live
network or the source repository on 2026-09-03**, with the scheduled-call
and Proof-of-Reserve findings added **2026-09-04**. Where a claim is unverified or
an assumption, it is marked **ASSUMPTION** in bold. Reproduction commands are
given so any reader can re-check rather than trust.

| Section | What it answers |
|---|---|
| 1 | What problem this solves, with evidence |
| 2 | Why the mechanism is correct, from first principles |
| 3 | Verified chain facts + how to reproduce them |
| 4 | System architecture and component boundaries |
| 5 | The contracts, in full |
| 6 | The underwriting agent |
| 7 | User flows |
| 8 | The arithmetic |
| 9 | Failure modes |
| 10 | Threat model |
| 11 | Invariants |
| 12 | Test plan |
| 13 | Build order |
| 14 | Open items and known limits |
| 15 | Sources |

---

## 1. The problem

### 1.1 A tokenized bond's risk is not in its price

Two bonds can carry identical coupons, identical maturities and identical
issuers, and be worth very different amounts — because one is **senior** and the
other **subordinated**. That fact does not live in a number. It lives in prose,
in the offering document: seniority, covenants, the call schedule, the
governing jurisdiction, the default waterfall.

- An oracle cannot read a prospectus.
- A deterministic script cannot read a prospectus.
- A language model can.

This is the only task in the entire system that no deterministic method can
perform, and it is why an AI agent is load-bearing here rather than decorative.

### 1.2 Underwriting capacity is the bottleneck, not settlement

A human credit analyst costs on the order of $200k/year and can cover a few
dozen issuers. Only assets large enough to amortise that cost ever get
tokenized — which is why on-chain RWA value is dominated by a handful of large
Treasury and money-market products rather than a long tail.

Verified market context (see §15 for sources):

| Fact | Value | As of |
|---|---|---|
| Tokenized RWA on-chain (ex-stablecoins) | ~$60B across 7,000+ products | 2026 |
| Tokenized US Treasuries | ~$9.6–15B, +120% YoY | early 2026 |
| RWA settled on Hedera | $10B+ | 2026 |
| Tokenized repo, Broadridge DLR (private chain) | $351B/day, $7.4T/month, +457% YoY | Aug 2026 |
| Tri-party Treasury repo haircut | ~2%, near-uniform | current |
| Share of Treasury repo at **zero** haircut | **>60%** | 2025–26 |

The last two rows matter enormously and are addressed in §2.3.

### 1.3 Hedera already has the collateral — and no credit layer

Lloyds Banking Group, Aberdeen Investments and Archax executed the **UK's first
tokenized-collateral FX trade on Hedera**, using a tokenized Aberdeen money
market fund and tokenized UK gilts, with Archax (the UK's first FCA-regulated
digital asset exchange) issuing and holding the tokens.

Hedera's own case study names the pain it solved:

> *"Settlement delays currently force variation margin for derivatives trades to
> rely on cash, which creates inefficiencies."*

So the collateral exists on Hedera. What does not exist is an open way to
**fund against it**. Archax operates "Nest", a *permissioned collateral-transfer*
network — mobility, not credit.

**ASSUMPTION:** that no open funding layer for ATS-issued assets ships before
2026-09-13. Archax or others may be building one privately; this is not
knowable from outside.

### 1.4 The failure this design is a response to

On **11 July 2026 at 00:51 UTC**, Bonzo Lend — Hedera's principal lending
protocol — lost **$9.05M**. An attacker submitted a forged price update
inflating SAUCE by roughly twelve orders of magnitude. It was accepted because
Supra's verifier **treated a zeroed BLS signature as valid**: both the signature
and the referenced committee key were zero, the pairing calculation returned
true, and the verifier read that as a valid signature. Eight seconds later the
attacker borrowed 6.63M USDC and 34.5M wrapped HBAR against collateral that did
not exist.

**Hedera's TVL fell ~40% in 24 hours. Bonzo's fell 77%.**

The decisive detail: Bonzo's contracts were not exploited. They "used the
incorrect on-chain price as designed." The protocol did exactly what it was
written to do. **The price was the attack surface.**

---

## 2. Why this mechanism is correct

### 2.1 For an illiquid asset, a price oracle is a fiction

Bonzo was lending against SAUCE — a token with a real, if thin, market. A
tokenized gilt held by Archax has **no on-chain market at all**: no pool, no
book, no trades. Any "price feed" for it is an off-chain attestation wearing an
oracle's clothes.

> **You cannot look up what an illiquid asset is worth. You can only find out
> what someone will pay for it.**

So the auction is not a workaround for a missing oracle. It is the only honest
price discovery that exists for these assets.

### 2.2 The cost of lying

| | Forging Bonzo's price | Forging Rialto's price |
|---|---|---|
| What it takes | A zeroed BLS signature | Actually winning the auction |
| What it costs the liar | **Nothing** | **Lending real money at a bad rate** |
| Who absorbs the error | Every user of the protocol | **The liar** |

To lie about the price here, you have to lose money.

### 2.3 Why removing margin calls does not cost capital efficiency

The obvious objection: without a price feed you cannot margin-call, so you need
a bigger haircut, so it is less capital efficient.

Against a margin-called version of itself — true. Against the thing it will
actually be compared to — false, and by a wide margin:

| | Collateral to borrow $100 | Live price feed? |
|---|---|---|
| Tri-party Treasury repo | **$102** | No |
| Bilateral Treasury repo | **$100** (>60% at zero haircut) | No |
| Aave-style DeFi lending | **$125–150** | Yes, every block |

Haircut is a function of **volatility × term**, nothing else. Bonzo needed a
live feed because it lent against a volatile DEX token. A gilt moves in basis
points. **Applying a volatile-asset risk model to government-quality collateral
adds an attack surface for no benefit.**

Rialto's default term is short (7 days) precisely so this holds.

### 2.4 The fake-document problem, and why verification is the wrong goal

A hash proves *which* document was read. It cannot prove the document is true.
Nothing on-chain can. Any design claiming otherwise is lying.

The two largest on-chain credit protocols do not attempt it either:

| | Who assesses | What constrains them |
|---|---|---|
| **Maple** | Pool Delegates — vetted credit professionals | They post **first-loss capital** |
| **Goldfinch** | Backers — per-borrower due diligence | They post **first-loss junior capital** |

Neither verifies truth. Both **place the consequence on the assessor**. Rialto
does the same, with the human replaced by an agent:

> **The underwriter that believes a forged prospectus loses its own money,
> first, before anyone else's.**

A fake issuer may publish anything. They will receive no bids, or punishing
ones, because every bidder is spending their own capital on their own reading.
**"No bids" is a correct outcome, not a failure.**

Unverifiability becomes a *price* rather than a blocker — exactly as in real
credit markets, where an unrated issuer with no auditor pays a wider spread.
ATS supplies the raw material for that judgment: `SecurityData` carries
`identityRegistry` and `compliance` addresses, so an agent can see whether the
issuer is a known on-chain identity or an anonymous address.

### 2.5 Why the AI is not decoration

The test: **remove the component; does the mechanism still work?**

Remove the agents and nobody can price a security whose risk lives in a PDF —
except a human analyst, and §1.2 is the argument that there are not enough of
them. The agent is not computing a number a formula could produce. It is
reading a legal document and forming a credit opinion, which is what a credit
analyst does.

Humans may also bid, through the same interface, producing an identical
on-chain bid. **The contract cannot tell them apart and does not care.** Agents
are not required — they are what makes the long tail reachable. This is
Goldfinch's own stated rationale for the Backer model: reaching borrowers that
centralised underwriting teams cannot.

---

### 2.6 Why the Documentation facet is the keystone

Asset Tokenization Studio is a large system, and almost every integration built
on it uses the same two facets: **mint**, to create the token, and the **control
list**, to gate transfers. That treats a security as an ERC-20 with a
whitelist — the token is used, the *security* is not.

The Documentation facet (ERC-1643: `setDocument` / `getDocument` /
`getAllDocuments`, gated by `ROLE_DOCUMENTER`) ships in every ATS deployment and
is, in practice, dead weight. It stores a URI and a hash that a human might click
in an explorer. Nothing computes on it.

**Rialto makes it the price-forming input.** The document is not an attachment to
the deal; it is the thing being underwritten. The chain of custody is:

```
issuer  setDocument(name, uri, keccak256(bytes))     ← ATS, on-chain
   │
borrower  open(...) captures docHash at that instant ← §5.3, frozen for the auction
   │
agent   getDocument() → fetch(uri) → re-hash → compare
   │        refuses to reason if the bytes do not match  (§6.1 step 4)
   │
bid     a price that exists only because a document was read
```

Apply the §2.5 test — remove the component, does the mechanism still work?
Remove the Documentation facet and there is no `docHash` to freeze, nothing for
the agent to fetch, nothing for a third party to re-verify, and no defensible
answer to "what was this priced on?" The auction still runs, but it prices
nothing. Every other ATS facet Rialto touches is replaceable: mint could be an
ERC-20, the control list could be a mapping. **The Documentation facet is the
only one with no substitute**, which is precisely why it is the one worth
building on.

This is also the honest answer to "why does this need ATS at all, rather than any
ERC-20 as collateral?" It does not need ATS for escrow. It needs ATS because ATS
is where a regulated security's offering document already lives on-chain, under
a role-gated write, with a hash anyone can check.

---

## 3. Verified chain facts

Everything in this section was checked against Hedera testnet on **2026-09-03**,
except §3.6, checked against testnet and mainnet on **2026-09-04**.

### 3.1 Network

| | Value |
|---|---|
| Network | Hedera Testnet |
| Chain ID | `296` (`0x128`) |
| JSON-RPC relay | `https://testnet.hashio.io/api` |
| Mirror Node REST | `https://testnet.mirrornode.hedera.com/api/v1/` |
| Explorer | `https://hashscan.io/testnet` |

### 3.2 Asset Tokenization Studio, live deployment

**The published documentation is stale.** `docs/ats/developer-guides/contracts/deployed-addresses.md`
lists v4.0.0 contracts deployed 2026-01-22. The repository's own
`apps/ats/web/.env.example` — shipped with v8.0.0 — points at a different, newer
deployment. The newer one is correct.

| Contract | Hedera ID | EVM address | Created |
|---|---|---|---|
| **Factory** | `0.0.9213391` | `0xd1f118a40f3b02883d35909ef2517e7edd78379d` | 2026-06-12 |
| **Resolver (BLR)** | `0.0.9212226` | `0xba2d5fc2083a0b8f164c50e65d782087fba18e0a` | 2026-06-12 |

Verified state:

| Check | Result |
|---|---|
| `getBusinessLogicCount()` | **108** |
| `getConfigurationsLength()` | **8** |
| `getLatestVersionByConfiguration(0x…01)` — EQUITY | **1** |
| `getLatestVersionByConfiguration(0x…02)` — BOND | **1** |
| `getAppliedRegulationData(uint8,uint8)` | returns a valid `RegulationData` |

Reproduce:

```bash
# factory is live and answers the v8 ABI
curl -s -X POST https://testnet.hashio.io/api -H 'content-type: application/json' \
 -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{
   "to":"0xd1f118a40f3b02883d35909ef2517e7edd78379d",
   "data":"'"$(cast calldata 'getAppliedRegulationData(uint8,uint8)' 1 1)"'"},"latest"]}'

# bond configuration is registered at version 1
curl -s -X POST https://testnet.hashio.io/api -H 'content-type: application/json' \
 -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{
   "to":"0xba2d5fc2083a0b8f164c50e65d782087fba18e0a",
   "data":"'"$(cast calldata 'getLatestVersionByConfiguration(bytes32)' \
     0x0000000000000000000000000000000000000000000000000000000000000002)"'"},"latest"]}'
```

### 3.3 Cost of issuing a security

Measured from a **third-party deployment through this factory on 2026-09-02**:

| | Value |
|---|---|
| Gas used | **7,023,179** |
| Gas limit supplied | 10,000,000 |
| Charged fee | **8.08 HBAR** |
| Result | SUCCESS |
| Contract created | `0.0.10331928` |

> ⚠️ **Set the gas limit to 10,000,000.** Default limits will fail. This is the
> same class of trap that cost a day on a previous build where a tool estimated
> 3.1M gas and the real cost was 34.3M.

The factory is in active use — deployments occur regularly, including on
2026-09-02. This is live infrastructure, not an abandoned demo.

### 3.4 Hedera landmines (carried forward from prior builds, all previously verified on-chain)

1. **Long-zero EVM addresses revert for alias-bearing accounts**, as both `from`
   and `to`. Always read `evm_address` from Mirror Node
   (`GET /accounts/{id}`); never hand-derive a long-zero address for an
   *account*.

   **This bites contracts too, and it bites them as a *parameter*, not only as a
   call target.** A contract deployed through the EVM has an alias, so its
   long-zero form is not interchangeable with its EVM address. `eth_getCode`
   answers identically on both — 390 bytes for the ATS factory either way —
   which is precisely what makes the long-zero form look valid. But passing the
   resolver's long-zero address inside `SecurityData.resolver` makes
   `deployBond` revert with a bare `CONTRACT_REVERT_EXECUTED` and no reason
   string, because the factory then *calls into* it.

   Verified by diffing two calldatas that were identical but for one word:

   ```
   0xba2d5fc2083a0b8f164c50e65d782087fba18e0a   -> deploys
   0x00000000000000000000000000000000008c9142   -> reverts
   ```

   Use the EVM addresses from `apps/ats/web/.env.example`, never the ones
   derived from the `0.0.x` ids.
2. **Accounts that must be recovered by `ecrecover` (i.e. any signer) must be
   ECDSA with an EVM alias.** ED25519 or long-zero-only accounts cannot sign
   for EVM verification.
3. **HTS tokens require association before an account can receive them.**
   Rialto is designed so that **no contract ever custodies the cash token**
   (see §5.3), which removes this requirement for the market contract. It does
   not, however, make a raw HTS token usable as the cash leg — see §3.7, where a
   probe deployed on testnet shows an HTS token answering a contract with empty
   returndata and zero code size.
4. Hedera meters gas differently from Ethereum. Never trust a local estimate;
   measure on testnet.
5. **`forge script --gas-limit` is silently ignored.** Forge treats it as an
   alias for `--block-gas-limit`, so it does nothing to the transaction. The
   flag that matters is `-g` / `--gas-estimate-multiplier`, and Hedera's relay
   under-reports deployment gas badly enough that the 130% default runs out
   mid-constructor. Use `-g 2500`. This costs a deployment's worth of HBAR to
   discover, twice.
6. **ATS validates the ISIN, and it is a real ISIN.** `deployBond` reverts with
   `WrongISIN(string)` (`0xdf749cc5`) unless the string is exactly 12
   characters, and with `WrongISINChecksum(string)` unless the twelfth is a
   correct Luhn check digit over the first eleven — letters expanding to two
   digits each (`A` = 10 … `Z` = 35). A plausible-looking identifier such as
   `GB00RIALTO001` is 13 characters and fails on length before the checksum is
   even reached. Source: `packages/ats/contracts/contracts/factory/isinValidator.sol`
   with `_ISIN_LENGTH = 12` and `_CHECKSUM_POSITION_IN_ISIN = 11` in
   `constants/values.sol`. `GB00RIALTO00` is valid.

**Configuration ids, enumerated on-chain rather than assumed.** Calling
`getConfigurations(0, 10)` on the resolver returns eight ids — `0x…01` through
`0x…08`. `0x…02` is BOND and answers `getLatestVersionByConfiguration` with
version 1, which is what `resolverProxyConfiguration` must be set to.

```bash
cast calldata "getConfigurations(uint256,uint256)" 0 10   # then eth_call the resolver
```

### 3.5 ATS interfaces used (verified from v8.0.0 source)

```solidity
// factory/IFactory.sol
function deployBond(BondData calldata, FactoryRegulationData calldata)
    external returns (address bondAddress_);
function deployEquity(EquityData calldata, FactoryRegulationData calldata)
    external returns (address equityAddress_);

struct ResolverProxyConfiguration { bytes32 key; uint256 version; }

struct SecurityData {
    IBusinessLogicResolver resolver;
    uint256 maxSupply;
    ResolverProxyConfiguration resolverProxyConfiguration;
    ICore.ERC20MetadataInfo erc20MetadataInfo;   // { name, symbol, isin, decimals }
    IResolverProxy.Rbac[] rbacs;                 // { bytes32 role; address[] members }
    address[] externalPauses;
    address[] externalControlLists;
    address[] externalKycLists;
    address compliance;
    address identityRegistry;
    bool arePartitionsProtected;
    bool isMultiPartition;
    bool isControllable;
    bool isWhiteList;
    bool clearingActive;
    bool internalKycActivated;
    bool erc20VotesActivated;
}

struct BondDetailsData {
    bytes3  currency;             // ISO 4217, e.g. "GBP"
    uint256 nominalValue;
    uint8   nominalValueDecimals;
    uint256 startingDate;
    uint256 maturityDate;
}

struct BondData {
    SecurityData     security;
    BondDetailsData  bondDetails;
    address[]        proceedRecipients;
    bytes[]          proceedRecipientsData;
}
```

```solidity
// facets/documentation — ERC-1643 style. THIS IS THE KEYSTONE OF RIALTO.
function setDocument(bytes32 _name, string calldata _uri, bytes32 _documentHash) external; // ROLE_DOCUMENTER
function getDocument(bytes32 _name) external view returns (string memory, bytes32, uint256);
function getAllDocuments() external view returns (bytes32[] memory);

// facets/mint
function issue(address _tokenHolder, uint256 _value, bytes calldata _data) external; // ROLE_ISSUER

// control list (whitelist/blacklist gate on transfers)
function addToControlList(address _account) external;     // ROLE_CONTROL_LIST
function isInControlList(address _account) external view returns (bool);
```

Role constants (from `constants/roles.sol`):

| Role | Value |
|---|---|
| `ROLE_ISSUER` | `0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f` |
| `ROLE_DOCUMENTER` | `0xb7b1452b94e2932605f7ad2a3ceba0bafd68db64704c9bd667f27163c57ca319` |
| `ROLE_CONTROL_LIST` | `0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d` |
| `ROLE_KYC` | `0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc` |
| `ROLE_PAUSER` | `0x3cb8b459fdb6e7dc3d2a2aa529e530f885d45e03584adb438423209c86a2731f` |

> ⚠️ **The single most important integration constraint.** When a security is
> deployed with `isWhiteList = true`, every address that touches the token must
> be on its control list — **including the Rialto escrow contract itself.**
> `RialtoMarket` must be added via `addToControlList` before it can hold
> collateral. This is the ERC-3643 trap that makes ordinary AMMs incompatible
> with permissioned securities, and it is a required deployment step, not an
> optional one. See §9.1.

### 3.6 Scheduled contract calls — HIP-1215, verified live

Hedera can call a contract for you at a future second, with no keeper, no cron
box and no off-chain signer. This is a native network feature, not a service.

| | Value |
|---|---|
| HIP | **1215 — Generalized Scheduled Contract Calls** |
| Status | **Final**, shipped in consensus node **v0.68.0** |
| System contract | Hedera Schedule Service (HSS) at `0x…016b` |
| `scheduleCall(address,uint256,uint256,uint64,bytes)` | selector `0x6f5bfde8` → `(int64 rc, address schedule)` |
| `hasScheduleCapacity(uint256,uint256)` | selector `0xdfb4a999` → `bool`, view, ~cold-`SLOAD` cost |
| `deleteSchedule(address)` | selector `0x72d42394` → `int64` |
| Max expiry into the future | **5,356,800 s = exactly 62 days** (`scheduling.maxExpirationFutureSeconds`) |
| Payer | the **scheduling contract**, unless `scheduleCallWithPayer` is used |
| Failure mode | the `scheduleCall*` family **never reverts**; it returns a response code |

Predecessors, for context: HIP-755 gave contracts `signSchedule` (selector
`0x358eeb03`, verified) but only for schedules someone else created; HIP-756
added scheduling for token create/update **only**. Neither can schedule an
arbitrary call. HIP-1215 is what makes §5.5 possible, and it is recent.

**Reproduce — is HSS live, and where exactly is the ceiling?**

```bash
# hasScheduleCapacity(now + N seconds, 200000 gas) against the live network.
NOW=$(date +%s)
probe () {
  D=$(cast calldata "hasScheduleCapacity(uint256,uint256)" $1 200000)
  curl -s -X POST https://testnet.hashio.io/api -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"0x000000000000000000000000000000000000016b\",\"data\":\"$D\"},\"latest\"]}"
  echo
}
probe $((NOW+86400))     # 1  day  -> 0x…01  true
probe $((NOW+5356800))   # 62 days -> 0x…01  true   (exactly the cap)
probe $((NOW+5443200))   # 63 days -> 0x…00  false
probe $((NOW+7776000))   # 90 days -> 0x…00  false
```

Verified 2026-09-04 on **both** testnet and mainnet: `true` at 1 day and at
exactly 62 days, `false` at 63 and 90 days.

> **This is why `MAX_TERM` is 60 days and not 90.** A 90-day loan cannot have its
> settlement scheduled at award time — the network will refuse the expiry. The
> constant is set by a measured network limit, not by preference. §5.2.

### 3.7 Cash token — corrected

The original plan named testnet USDC (`0.0.429274`, HTS `FUNGIBLE_COMMON`,
6 decimals) as the cash leg, on the reasoning that no Rialto contract ever holds
it (§5.3) and so no HTS association is required. **The association argument is
sound and the conclusion was still wrong.**

**A native HTS token, called from a contract, is indistinguishable from an
address with no code.** Settled by deploying a probe on testnet rather than by
reasoning:

```
codeSize(0x…068c1a)                 0 bytes
contract -> HTS USDC balanceOf()    ok = true, returndata length 0
contract -> HTS USDC decimals()     ok = true, returndata length 0
```

That is the same shape as the Schedule Service (§3.4.1) — and it is dangerous
here in a way it was not there. `transfer` and `transferFrom` must accept empty
returndata, because many real ERC-20s return nothing on success. A call to a
codeless address *also* returns success with zero bytes. So an HTS cash token
would have made `award` mark a position funded, record a lender and start the
clock **while no cash moved at all.**

`_check` now trusts an empty answer only from an address that has code
(§5.3). The consequence is a genuine constraint rather than a workaround:

> **The cash leg must be an ERC-20 contract, not a raw HTS token id.**

A wrapped or bridged USDC contract qualifies; `0.0.429274` addressed directly
does not. `DemoCash` is what the testnet lifecycle uses.

**Not yet established:** whether HTS tokens answer through the redirect proxy on
a newer consensus node, or after association, or at a different address form.
The probe above is what this deployment does today, and the contract is written
to be safe either way — a token that starts answering properly is accepted the
moment it has code.

---

## 4. System architecture

```
                          ┌──────────────────────────────┐
   Issuer ───deployBond──▶│  ATS Factory  0.0.9213391    │
        └───setDocument──▶│  → security token (Diamond)  │
                          │     + prospectus URI + hash  │
                          └──────────────┬───────────────┘
                                         │ collateral
                                         ▼
  Borrower ──openRequest──▶┌─────────────────────────────┐
                           │      RialtoMarket.sol       │
  Underwriter ────bid─────▶│  requests · bids · escrow   │◀── Mandates.sol
   (agent or human)        │  award · repay · claim      │    (signed limits)
                           └─────────────┬───────────────┘
                                         │ every state change
                                         ▼
                           ┌─────────────────────────────┐
                           │   HCS topic — audit log     │
                           │  reasoning, bids, outcomes  │
                           │  consensus-timestamped      │
                           └─────────────────────────────┘
                                         ▲
                                         │ publish before outcome is known
                     ┌───────────────────┴────────────────┐
                     │   Underwriting agent (off-chain)   │
                     │  fetch doc → verify hash → reason  │
                     │  → sign bid → submit               │
                     └────────────────────────────────────┘
```

### 4.1 Components

| Component | Where it runs | Responsibility |
|---|---|---|
| ATS security | Hedera (deployed via factory) | The collateral; carries documents on-chain |
| `RialtoMarket` | Hedera EVM | Requests, bids, escrow, settlement |
| `Mandates` | Hedera EVM | An underwriter's signed, enforceable limits |
| Underwriting agent | Off-chain (Node) | Reads documents, forms an opinion, signs bids |
| HCS topic | Hedera Consensus Service | Ordered, timestamped record of reasoning and outcomes |
| Hedera Schedule Service | Hedera (system contract `0x…016b`) | Executes `claim` at maturity with no keeper (§5.5) |
| Web app | Next.js | Borrower and underwriter interfaces; manual bidding |

### 4.2 The separation that makes AI safe

> **The agent has judgment. It never has authority.**

| | Judgment (soft) | Authority (hard) |
|---|---|---|
| Lives in | The agent's strategy prompt, off-chain | `Mandates.sol`, on-chain |
| Editable by | The underwriter, freely, any time | Only by the underwriter, by signed transaction |
| If compromised | A bad opinion | Nothing — the bid reverts |
| Worst case | The underwriter loses **their own** capital, within their own limits | — |

An agent's only possible output is a **signed bid**. Before that bid can win
anything, `RialtoMarket` checks it against limits its owner set themselves. A
fully jailbroken agent cannot do a single thing its owner did not already
approve in advance. Its blast radius is defined by arithmetic.

---

## 5. The contracts

Solidity `0.8.24`. No upgradeability, no admin mint, no pause on user funds, no
`delegatecall`.

### 5.1 `Mandates.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * An underwriter's standing limits, set by the underwriter, enforced by the
 * market. This is the boundary between what an agent may think and what it may
 * do. Nothing here is advisory: a bid outside these limits cannot be recorded.
 */
contract Mandates {
    struct Mandate {
        address agent;          // the key permitted to bid on the owner's behalf
        uint256 maxPerDeal;     // largest principal in a single request
        uint256 maxTotal;       // largest aggregate live exposure
        uint16  minRateBps;     // lowest annualised rate the owner will accept
        uint64  maxTerm;        // longest term, in seconds
        bool    active;
    }

    mapping(address => Mandate) private _mandates;               // owner => mandate
    mapping(address => mapping(address => bool)) private _assets; // owner => collateral => allowed
    mapping(address => address) private _ownerOfAgent;            // agent => owner

    event MandateSet(address indexed owner, address indexed agent, uint256 maxPerDeal, uint256 maxTotal, uint16 minRateBps, uint64 maxTerm);
    event MandateRevoked(address indexed owner);
    event AssetAllowed(address indexed owner, address indexed asset, bool allowed);

    error AgentAlreadyBound();
    error NoMandate();

    /// @notice Set or replace the caller's mandate. The agent may be address(0)
    ///         for an underwriter who intends to bid manually.
    function setMandate(
        address agent,
        uint256 maxPerDeal,
        uint256 maxTotal,
        uint16  minRateBps,
        uint64  maxTerm
    ) external {
        // One agent key serves exactly one owner. Without this, a single
        // compromised key could bid against several balance sheets.
        if (agent != address(0)) {
            address bound = _ownerOfAgent[agent];
            if (bound != address(0) && bound != msg.sender) revert AgentAlreadyBound();
            _ownerOfAgent[agent] = msg.sender;
        }

        address prev = _mandates[msg.sender].agent;
        if (prev != address(0) && prev != agent) delete _ownerOfAgent[prev];

        _mandates[msg.sender] = Mandate(agent, maxPerDeal, maxTotal, minRateBps, maxTerm, true);
        emit MandateSet(msg.sender, agent, maxPerDeal, maxTotal, minRateBps, maxTerm);
    }

    function revoke() external {
        Mandate storage m = _mandates[msg.sender];
        if (!m.active) revert NoMandate();
        if (m.agent != address(0)) delete _ownerOfAgent[m.agent];
        m.active = false;
        emit MandateRevoked(msg.sender);
    }

    function allowAsset(address asset, bool allowed) external {
        _assets[msg.sender][asset] = allowed;
        emit AssetAllowed(msg.sender, asset, allowed);
    }

    /* ── views used by the market ── */

    function mandateOf(address owner) external view returns (Mandate memory) {
        return _mandates[owner];
    }

    function ownerOfAgent(address agent) external view returns (address) {
        return _ownerOfAgent[agent];
    }

    function assetAllowed(address owner, address asset) external view returns (bool) {
        return _assets[owner][asset];
    }
}
```

### 5.2 `RialtoMarket.sol` — data model

```solidity
enum Status { Open, Funded, Repaid, Defaulted, Cancelled }

struct Request {
    address borrower;
    address collateral;        // ATS security token
    uint256 collateralAmount;  // escrowed on award
    address cash;              // HTS token via its ERC-20 facade (USDC)
    uint256 principal;         // amount sought
    uint64  term;              // seconds, starts at award
    uint64  bidDeadline;       // auction closes
    bytes32 docHash;           // document hash captured at open()
    Status  status;
    // set on award
    address lender;
    uint256 repayAmount;       // fixed at award; the only number that matters later
    uint64  dueAt;
}

struct Bid {
    address underwriter;   // whose capital funds it
    address submitter;     // agent key, or the underwriter bidding manually
    uint256 repayAmount;   // the bid: lower wins
    bytes32 reasoningRef;  // HCS message reference, published before the outcome
}
```

**The auction is single-dimension by design.** The borrower fixes principal,
term and collateral — which *is* the haircut they are proposing. Underwriters
bid only `repayAmount`, and **lowest wins**. If an underwriter thinks the
collateral is poor, they bid a high repayment or do not bid at all. One
dimension is legible on a screen in seconds; two are not.

### 5.3 `RialtoMarket.sol` — the mechanism

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {Mandates} from "./Mandates.sol";

/**
 * Rialto — an underwriting market for tokenized securities.
 *
 * No price feed is read anywhere in this contract. The repayment is fixed at
 * award by agreement between two parties, and every later branch depends only
 * on time and on whether that fixed amount arrived.
 *
 * Cash never rests in this contract: at award it moves lender -> borrower, and
 * at repayment borrower -> lender, both by transferFrom in a single call. Only
 * the collateral is escrowed. On Hedera this also means the contract needs no
 * HTS association for the cash token.
 */
/**
 * Hedera Schedule Service (HSS), system contract at 0x…016b. HIP-1215, Final,
 * node v0.68.0 — verified live in §3.6.
 *
 * None of these revert. They return a Hedera response code (22 == SUCCESS), so
 * every call site here must check the code rather than rely on a bubbling
 * revert. That is what lets settlement be scheduled opportunistically without
 * ever putting the award at risk.
 */
interface IHederaScheduleService {
    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
        external returns (int64 responseCode, address scheduleAddress);
    function deleteSchedule(address scheduleAddress) external returns (int64 responseCode);
    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) external view returns (bool);
}

contract RialtoMarket {
    Mandates public immutable mandates;

    IHederaScheduleService constant HSS = IHederaScheduleService(address(0x16b));
    int64  constant HSS_SUCCESS   = 22;
    /// Enough for a status write, an exposure decrement and one collateral transfer.
    uint256 constant CLAIM_GAS    = 400_000;
    uint64  public constant MIN_BID_WINDOW = 60;        // seconds
    // 60 days, not 90, and the reason is a measured network limit rather than a
    // preference: Hedera refuses a scheduled transaction whose expiry is more
    // than scheduling.maxExpirationFutureSeconds = 5_356_800s (62 days) in the
    // future. Verified live in §3.6 — hasScheduleCapacity() is true at exactly
    // 62 days and false at 63. A term beyond that cannot have its settlement
    // scheduled at award, which is what §5.5 depends on. 60 leaves margin.
    uint64  public constant MAX_TERM       = 60 days;
    uint16  public constant BPS            = 10_000;

    Request[] private _requests;
    mapping(uint256 => Bid) public bestBid;                 // requestId => current best
    mapping(uint256 => uint256) public bidCount;
    mapping(address => uint256) public liveExposure;        // underwriter => principal funded
    // Principal committed by a standing best bid that has not yet resolved.
    // Without this, maxTotal is checkable but not enforceable: an underwriter
    // could hold the best bid on many auctions at once, each passing the check
    // independently, and breach the limit the moment they all awarded.
    mapping(address => uint256) public reservedExposure;
    /// requestId => the HSS schedule that will call claim(id) at maturity, if one
    /// was created. address(0) means settlement is manual-only. See §5.5.
    mapping(uint256 => address) public settlementSchedule;

    event Requested(uint256 indexed id, address indexed borrower, address collateral, uint256 collateralAmount, uint256 principal, uint64 term, bytes32 docHash);
    event Bid_(uint256 indexed id, address indexed underwriter, address submitter, uint256 repayAmount, bytes32 reasoningRef);
    event Awarded(uint256 indexed id, address indexed lender, uint256 principal, uint256 repayAmount, uint64 dueAt);
    event Repaid(uint256 indexed id, uint256 amount);
    event Defaulted(uint256 indexed id, address indexed lender, uint256 collateralAmount);
    event Cancelled(uint256 indexed id);
    event SettlementScheduled(uint256 indexed id, address indexed schedule, uint256 expirySecond);

    error BadWindow();
    error BadTerm();
    error NotOpen();
    error AuctionClosed();
    error AuctionLive();
    error NoBids();
    error NotBetter();
    error NoMandate();
    error OverPerDeal();
    error OverTotal();
    error RateTooLow();
    error TermTooLong();
    error AssetNotAllowed();
    error NotBorrower();
    error TooLate();
    error StillCurrent();
    error TransferFailed();

    constructor(Mandates m) { mandates = m; }

    /* ─────────────────────────── borrower ─────────────────────────── */

    /**
     * @notice Open a funding request. The collateral is escrowed immediately, so
     *         an underwriter is bidding on something that is already locked and
     *         cannot be withdrawn mid-auction.
     * @dev `docHash` is read from the security at open() and frozen into the
     *      request. If the issuer later replaces the document, bids placed
     *      against the old hash are still bound to what was actually read.
     */
    function open(
        address collateral,
        uint256 collateralAmount,
        address cash,
        uint256 principal,
        uint64  term,
        uint64  bidWindow,
        bytes32 docHash
    ) external returns (uint256 id) {
        if (bidWindow < MIN_BID_WINDOW) revert BadWindow();
        if (term == 0 || term > MAX_TERM) revert BadTerm();
        if (principal == 0 || collateralAmount == 0) revert BadTerm();

        _pull(collateral, msg.sender, address(this), collateralAmount);

        id = _requests.length;
        _requests.push(Request({
            borrower: msg.sender,
            collateral: collateral,
            collateralAmount: collateralAmount,
            cash: cash,
            principal: principal,
            term: term,
            bidDeadline: uint64(block.timestamp) + bidWindow,
            docHash: docHash,
            status: Status.Open,
            lender: address(0),
            repayAmount: 0,
            dueAt: 0
        }));

        emit Requested(id, msg.sender, collateral, collateralAmount, principal, term, docHash);
    }

    /* ─────────────────────────── underwriter ─────────────────────────── */

    /**
     * @notice Submit a bid. Callable by an underwriter directly, or by the agent
     *         key their mandate names. Either path produces the same bid.
     * @dev Every limit checked here was set by the capital owner. A compromised
     *      agent can do nothing its owner did not already authorise.
     */
    function bid(uint256 id, uint256 repayAmount, bytes32 reasoningRef) external {
        Request storage r = _requests[id];
        if (r.status != Status.Open) revert NotOpen();
        if (block.timestamp >= r.bidDeadline) revert AuctionClosed();

        // Resolve who is actually lending: either the caller, or the owner that
        // bound this agent key.
        address underwriter = mandates.ownerOfAgent(msg.sender);
        if (underwriter == address(0)) underwriter = msg.sender;

        Mandates.Mandate memory m = mandates.mandateOf(underwriter);
        if (!m.active) revert NoMandate();
        if (m.agent != address(0) && msg.sender != m.agent && msg.sender != underwriter) revert NoMandate();

        if (r.principal > m.maxPerDeal) revert OverPerDeal();
        if (r.term > m.maxTerm) revert TermTooLong();
        if (!mandates.assetAllowed(underwriter, r.collateral)) revert AssetNotAllowed();
        if (rateBps(r.principal, repayAmount, r.term) < m.minRateBps) revert RateTooLow();

        // Lowest repayment wins. First bid always stands.
        Bid memory cur = bestBid[id];
        if (cur.underwriter != address(0) && repayAmount >= cur.repayAmount) revert NotBetter();

        // The outgoing best bidder is no longer committed to this request.
        // Released before the incoming check so an underwriter improving their
        // own bid is not measured against themselves.
        if (cur.underwriter != address(0)) reservedExposure[cur.underwriter] -= r.principal;

        if (liveExposure[underwriter] + reservedExposure[underwriter] + r.principal > m.maxTotal) {
            // Restore the released reservation before reverting, so a failed
            // bid cannot free someone else's commitment.
            if (cur.underwriter != address(0)) reservedExposure[cur.underwriter] += r.principal;
            revert OverTotal();
        }
        reservedExposure[underwriter] += r.principal;

        bestBid[id] = Bid(underwriter, msg.sender, repayAmount, reasoningRef);
        unchecked { bidCount[id] += 1; }
        emit Bid_(id, underwriter, msg.sender, repayAmount, reasoningRef);
    }

    /* ─────────────────────────── settlement ─────────────────────────── */

    /**
     * @notice Close the auction and settle both legs atomically.
     * @dev Permissionless: anyone may call it once the window has closed. The
     *      outcome is fully determined by state, so there is nothing for a
     *      caller to influence.
     */
    function award(uint256 id) external {
        Request storage r = _requests[id];
        if (r.status != Status.Open) revert NotOpen();
        if (block.timestamp < r.bidDeadline) revert AuctionLive();

        Bid memory b = bestBid[id];
        if (b.underwriter == address(0)) revert NoBids();

        r.status      = Status.Funded;
        r.lender      = b.underwriter;
        r.repayAmount = b.repayAmount;
        r.dueAt       = uint64(block.timestamp) + r.term;
        reservedExposure[b.underwriter] -= r.principal;
        liveExposure[b.underwriter]     += r.principal;

        // Cash moves lender -> borrower directly. It never rests here.
        _pull(r.cash, b.underwriter, r.borrower, r.principal);

        // Ask Hedera itself to call claim(id) at maturity. Best-effort by
        // construction: if it fails, claim() is still permissionless and the
        // deal is unaffected. See §5.5.
        _scheduleSettlement(id, r.dueAt);

        emit Awarded(id, b.underwriter, r.principal, r.repayAmount, r.dueAt);
    }

    /// @notice Repay the agreed amount and take the collateral back.
    function repay(uint256 id) external {
        Request storage r = _requests[id];
        if (r.status != Status.Funded) revert NotOpen();
        if (msg.sender != r.borrower) revert NotBorrower();
        if (block.timestamp > r.dueAt) revert TooLate();  // late is default; see claim()

        r.status = Status.Repaid;
        liveExposure[r.lender] -= r.principal;

        // The pending claim(id) would revert harmlessly on a repaid request,
        // but cancelling it releases the reserved slot and gas deposit.
        _cancelSettlement(id);

        _pull(r.cash, msg.sender, r.lender, r.repayAmount);
        _push(r.collateral, r.borrower, r.collateralAmount);

        emit Repaid(id, r.repayAmount);
    }

    /**
     * @notice After the due date, an unrepaid position hands the collateral to
     *         the lender. There is no auction, no liquidator, no price, and no
     *         partial outcome. The haircut agreed at award is the lender's
     *         entire protection, which is why it is theirs to choose.
     * @dev Permissionless and parameterless beyond `id`, and it pays the lender
     *      recorded in storage rather than `msg.sender`. That is what makes it
     *      safe to hand to the network as a scheduled call (§5.5) — the
     *      scheduler is just another caller with no special power.
     */
    function claim(uint256 id) external {
        Request storage r = _requests[id];
        if (r.status != Status.Funded) revert NotOpen();
        if (block.timestamp <= r.dueAt) revert StillCurrent();

        r.status = Status.Defaulted;
        liveExposure[r.lender] -= r.principal;

        _push(r.collateral, r.lender, r.collateralAmount);
        emit Defaulted(id, r.lender, r.collateralAmount);
    }

    /**
     * @notice Withdraw an unawarded request after its auction has closed.
     * @dev Deliberately permitted even when a winning bid exists. `award` pulls
     *      cash from the lender, so it can fail for reasons outside anyone's
     *      control — a revoked allowance, a lender no longer on the security's
     *      control list. Without this escape the collateral would be trapped in
     *      a request that can never settle. No cash has moved at this point, so
     *      cancelling costs the bidder nothing but the deal.
     */
    function cancel(uint256 id) external {
        Request storage r = _requests[id];
        if (r.status != Status.Open) revert NotOpen();
        if (msg.sender != r.borrower) revert NotBorrower();
        if (block.timestamp < r.bidDeadline) revert AuctionLive();

        Bid memory cur = bestBid[id];
        if (cur.underwriter != address(0)) reservedExposure[cur.underwriter] -= r.principal;

        r.status = Status.Cancelled;
        _push(r.collateral, r.borrower, r.collateralAmount);
        emit Cancelled(id);
    }

    /* ──────────────────── scheduled settlement (§5.5) ──────────────────── */

    /**
     * @dev Ask HSS to invoke `claim(id)` on this contract at `dueAt`.
     *
     * Safe because it grants no authority that did not already exist: `claim`
     * is permissionless, takes only `id`, and pays the collateral to the lender
     * recorded in storage — never to its caller. The schedule therefore cannot
     * do anything a passer-by could not already do; it only removes the need for
     * anyone to bother.
     *
     * Deliberately best-effort. `scheduleCall` returns a response code instead
     * of reverting, and every failure path here is a no-op: the second may be at
     * capacity, the contract may be short of HBAR, or the network may be older
     * than v0.68.0. In all of those cases settlement falls back to a manual
     * `claim()` and nothing about the deal changes. A funding market must not
     * fail to fund because a convenience could not be arranged.
     */
    function _scheduleSettlement(uint256 id, uint64 dueAt) internal {
        // +1: claim() requires block.timestamp strictly greater than dueAt.
        uint256 expiry = uint256(dueAt) + 1;
        if (!HSS.hasScheduleCapacity(expiry, CLAIM_GAS)) return;

        try HSS.scheduleCall(address(this), expiry, CLAIM_GAS, 0, abi.encodeCall(this.claim, (id)))
            returns (int64 rc, address schedule)
        {
            if (rc == HSS_SUCCESS && schedule != address(0)) {
                settlementSchedule[id] = schedule;
                emit SettlementScheduled(id, schedule, expiry);
            }
        } catch {
            // Older network, or no HSS. Manual claim() remains.
        }
    }

    /// @dev Release a pending schedule once it can no longer do anything useful.
    function _cancelSettlement(uint256 id) internal {
        address schedule = settlementSchedule[id];
        if (schedule == address(0)) return;
        delete settlementSchedule[id];
        try HSS.deleteSchedule(schedule) returns (int64) {} catch {}
    }

    /**
     * @notice Fund the contract's HBAR balance so it can pay for scheduling.
     * @dev Scheduling is paid by the scheduling contract (§3.6). This is a
     *      convenience budget, not user funds: no accounting depends on it, and
     *      an empty balance degrades to manual claim() rather than breaking.
     */
    receive() external payable {}

    /* ─────────────────────────── views ─────────────────────────── */

    function requests() external view returns (uint256) { return _requests.length; }
    function get(uint256 id) external view returns (Request memory) { return _requests[id]; }

    /**
     * @notice Annualised simple rate in basis points.
     * @dev Ordered to multiply before dividing. At 6-decimal cash a naive
     *      ordering truncates small fees to zero.
     */
    function rateBps(uint256 principal, uint256 repayAmount, uint64 term) public pure returns (uint16) {
        if (repayAmount <= principal || principal == 0 || term == 0) return 0;
        uint256 fee = repayAmount - principal;
        uint256 bps = (fee * BPS * 365 days) / (principal * term);
        return bps > type(uint16).max ? type(uint16).max : uint16(bps);
    }

    /* ─────────────────────────── transfers ─────────────────────────── */

    // Tolerant of tokens that return nothing as well as those returning a bool.
    // Hedera's HTS ERC-20 facade returns a 32-byte true, but ATS diamonds and
    // other tokens vary; assume nothing.
    function _pull(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _push(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
```

### 5.4 Why there is no oracle, stated as an audit claim

Search the contract for a price. There isn't one. The complete set of inputs
that determine every branch:

| Branch | Depends on |
|---|---|
| `bid` accepted | mandate limits + a lower `repayAmount` |
| `award` | the best bid, and `block.timestamp >= bidDeadline` |
| `repay` | `msg.sender == borrower`, `block.timestamp <= dueAt`, cash arriving |
| `claim` | `block.timestamp > dueAt` |

**Time and agreement. Nothing else.** There is no external call whose return
value can change who gets paid.

---

### 5.5 Settlement the network performs itself

`claim()` is permissionless, so a defaulted position has always been settleable
by anyone. In practice "anyone" means somebody has to be watching, and the
standard answer — a keeper bot — is an off-chain daemon that can be switched
off, run out of gas, or quietly stop while everything looks fine.

Hedera removes the daemon. At `award`, the contract asks the Hedera Schedule
Service to call `claim(id)` on itself one second after `dueAt` (HIP-1215;
verified live in §3.6). Nobody has to be watching, because the network is.

```
award(id) ──▶ HSS.scheduleCall(this, dueAt+1, 400k gas, 0, claim(id))
                      │
        repay(id) ────┼──▶ HSS.deleteSchedule(...)   position closed early
                      │
                   dueAt+1  ──▶ network executes claim(id)  ── collateral to lender
```

**Why this is safe rather than clever.** The scheduled call is granted no
authority that did not already exist. `claim` takes one argument, checks only
`status` and `block.timestamp`, and sends the collateral to `r.lender` from
storage — never to its caller. A schedule is therefore exactly as powerful as a
passer-by, which is to say not powerful at all. Nothing in the threat model
(§10) changes.

**Why it cannot break a deal.** Every failure is a no-op that degrades to the
behaviour the contract had before:

| Failure | Result |
|---|---|
| Second is at capacity | `hasScheduleCapacity` returns false; not scheduled; manual `claim()` |
| Contract is short of HBAR | `scheduleCall` returns a non-success code; not scheduled; manual `claim()` |
| Network older than v0.68.0 | the `try` catches; not scheduled; manual `claim()` |
| Borrower repays first | schedule deleted; had it fired, `claim` would revert harmlessly |
| Term > 62 days | impossible — `MAX_TERM` is 60 (§3.6) |

So this is an **enhancement to a mechanism that is already complete**, not a
dependency the mechanism rests on. That ordering matters: it is the difference
between using a native feature and needing one.

**ASSUMPTION:** `scheduleCall` has been verified callable at the network level
(§3.6) but Rialto has not yet performed one. Day 3 of §13 is the gate; if it
fails, the line is deleted and nothing else moves.

---

## 6. The underwriting agent

### 6.1 What it does, in order

```
1. Watch RialtoMarket for Requested(id, …)
2. Read the collateral's documents on-chain:
       getAllDocuments()  →  getDocument(name) → (uri, hash, timestamp)
3. Fetch the document from `uri`
4. VERIFY keccak256(bytes) == hash    ← refuse to reason on a mismatch
5. Read issuer context: identityRegistry, compliance, control-list membership
6. Reason: is this senior or subordinated? what is the maturity relative to the
   loan term? who is the issuer, and is anything about them attestable?
7. Decide: a repayment amount, or no bid
8. Publish {requestId, docHash, reasoning, repayAmount} to the HCS topic
9. Submit bid(id, repayAmount, hcsRef) on-chain
```

Step 4 is not optional. **An agent that reasons over a document whose bytes do
not match the on-chain hash is reasoning about a document nobody committed to.**

Step 8 happens **before** step 9 and therefore before the outcome is known. The
HCS consensus timestamp is what makes the reasoning non-retrofittable.

### 6.2 Mandate vs strategy

```
MANDATE — on-chain, signed, enforced by RialtoMarket
    agent · maxPerDeal · maxTotal · minRateBps · maxTerm · allowedAssets

STRATEGY — off-chain, plain English, the agent's brief
    "Senior secured paper only. Require an auditor attestation for any issuer
     not in the identity registry. Add 200bps for an unrated issuer. Never bid
     when the loan term extends beyond the instrument's maturity."
```

Judgment is soft and editable. Authority is hard and on-chain. An underwriter
who prefers to bid manually simply sets `agent = address(0)` and calls `bid`
themselves.

### 6.3 Handling documents as hostile input

The prospectus is **untrusted data supplied by the counterparty**, and must
never be treated as instructions. Concretely:

- Document text is delivered inside a data envelope, never concatenated into the
  instruction section of the prompt
- The model is instructed that document content is evidence to be assessed, and
  that any imperative inside it is itself a finding to report
- Output is constrained to a schema: `{ bid: bool, repayAmount: uint, reasons: string[], flags: string[] }`
- A response that fails schema validation is discarded and no bid is made

**None of this is the primary defence.** The primary defence is economic
(§10.2): the underwriter that is fooled loses its own money first.

### 6.4 Latency

**A model call must never sit inside a transaction.** The agent is an off-chain
participant that submits transactions, exactly like a human. The auction has a
bid window; an agent that is slow simply misses it — which is what happens to
slow underwriters in real markets.

For a demo, `bidWindow` of 90–120 seconds is comfortable. Documents are fetched
and hashed on the `Requested` event, so model latency is the only variable, and
it is bounded by the window rather than by a block.

---

## 7. User flows

### 7.1 Issuer — create the collateral

1. Call `deployBond(BondData, FactoryRegulationData)` on the factory
   (`0.0.9213391`), gas limit **10,000,000**, cost ~8 HBAR
2. Grant yourself `ROLE_DOCUMENTER` and `ROLE_ISSUER` via `rbacs` at deployment
3. `setDocument("prospectus", uri, keccak256(file))`
4. `issue(holder, amount, "")`
5. If `isWhiteList`, `addToControlList` for: the holder, **the RialtoMarket
   contract**, and every prospective lender

### 7.2 Borrower — raise cash against it

1. `approve(RialtoMarket, collateralAmount)` on the security
2. Read `getDocument("prospectus")` to obtain the current hash
3. `open(collateral, collateralAmount, USDC, principal, 7 days, 120, docHash)`
4. Collateral is escrowed immediately; the auction is live
5. After `award`, cash arrives directly from the winning lender
6. Before `dueAt`: `approve(RialtoMarket, repayAmount)` then `repay(id)` —
   collateral returns

### 7.3 Underwriter — deploy an agent, or bid by hand

1. `setMandate(agentKey, maxPerDeal, maxTotal, minRateBps, maxTerm)`
2. `allowAsset(collateralToken, true)`
3. `approve(RialtoMarket, maxTotal)` on the cash token — this is what the market
   draws on if a bid wins
4. Either run the agent with a strategy, or open the web app and bid manually
5. On win: cash leaves at `award`; either repayment or collateral arrives later

### 7.4 Anyone — verify

1. Read the HCS topic through Mirror Node:
   `GET /api/v1/topics/{topicId}/messages`
2. For any deal: compare the consensus timestamp of the reasoning against the
   `Awarded` event timestamp. **The reasoning necessarily predates the outcome.**
3. Re-fetch the document from its URI and re-hash it; compare with the
   `docHash` frozen into the request

---

## 8. The arithmetic

### 8.1 Rate

```
fee      = repayAmount − principal
rateBps  = fee × 10_000 × 365 days / (principal × term)
```

Multiplication precedes division throughout. With 6-decimal cash, a naive
ordering truncates a one-week fee on a small principal to zero — the identical
failure shape to a previous build where `price × quantity / 1e18` silently
returned zero on a 6-decimal token.

### 8.2 Haircut

```
haircut = 1 − principal / (collateralAmount × facePerUnit)
```

`facePerUnit` comes from `BondDetailsData.nominalValue / 10^nominalValueDecimals`
— **read from the instrument, not from a price feed.** It is a stated face
value, not a market price, and it is used only for display and for the agent's
reasoning. **No contract branch depends on it.**

### 8.3 Why a short term keeps the haircut small

Required haircut scales with the volatility of the collateral over the term.
Government-quality paper moves in basis points over a week, which is why real
tri-party Treasury repo runs at ~2% and the majority of bilateral Treasury repo
runs at zero — with no margin calls and no feed. Rialto defaults to a 7-day term
for exactly this reason.

### 8.4 Worst case for the lender

```
loss = max(0, repayAmount − realisable(collateral at default))
```

Bounded by the haircut the lender accepted when they bid. Nothing else in the
system affects it. There is no liquidation cascade, no oracle, no keeper, and no
path by which another user's position can harm theirs. Settlement is scheduled
with the network itself (§5.5), which is not a keeper: it holds no key, decides
nothing, and its absence changes only who pays the gas.

---

## 9. Failure modes

| # | Situation | Behaviour |
|---|---|---|
| 1 | **Market not on the security's control list** | Escrow reverts at `open`. Must be added via `addToControlList` first. §3.5 |
| 2 | Lender not on the control list | `claim` reverts on default; collateral is stuck. Underwriters must be whitelisted before bidding. |
| 3 | No bids by the deadline | `award` reverts `NoBids`; borrower calls `cancel` and recovers collateral |
| 3b | Underwriter holds the best bid on several auctions at once | `reservedExposure` counts every standing bid, so `maxTotal` binds across auctions rather than per-auction |
| 4 | Lender's cash allowance revoked, or lender de-whitelisted, before `award` | `award` reverts. Borrower calls `cancel` after the deadline and recovers collateral — this is why `cancel` permits an existing bid. No cash has moved. |
| 5 | Agent offline or slow | Misses the window. Correct market behaviour. |
| 6 | Document URI unreachable | Agent refuses to bid. Silence is a valid opinion. |
| 7 | Document bytes ≠ on-chain hash | Agent refuses to bid and flags it. §6.1 step 4 |
| 8 | Issuer replaces the document mid-auction | Bids remain bound to the `docHash` frozen at `open` |
| 9 | Prompt injection inside the prospectus | Agent may be fooled; mandate still bounds the bid; that underwriter alone bears the loss |
| 10 | Borrower repays one second late | Treated as default. Deliberate: a fixed date with no grace period is what removes ambiguity. |
| 11 | Borrower repays and lender is not whitelisted | Cash transfer reverts; borrower must coordinate. Known limit, §14 |
| 12 | Security is paused by its issuer | Transfers revert; positions freeze until unpaused. The issuer retains that power by design in ERC-1400. |
| 13 | Two agents submit an identical repayment | First wins; the second reverts `NotBetter`. Ties resolve by time. |
| 14 | Underwriter revokes their mandate mid-auction | Existing bid stands (capital already committed by allowance); no new bids accepted |

---

## 10. Threat model

### 10.1 What an attacker cannot do

| Attack | Why it fails |
|---|---|
| Forge a price to over-borrow (**the Bonzo attack**) | There is no price input. Nothing to forge. |
| Manipulate a thin pool to move valuation | Valuation is a competitive bid backed by capital, not an observation |
| Jailbreak an agent into lending everything | `Mandates` bounds every bid; the contract rejects it |
| Use one compromised agent key across many balance sheets | `_ownerOfAgent` binds a key to exactly one owner |
| Front-run the award to steal the deal | `award` is deterministic from stored state; the best bid is already recorded |
| Grief a borrower by locking collateral | Collateral is escrowed only by the borrower's own `open`, and returns on `cancel` |
| Drain the contract | It holds only escrowed collateral, released solely to borrower or lender by a state machine. It never holds cash. |

### 10.2 The economic backstop

Every remaining risk — a bad reading, a forged prospectus, a successful
injection — lands on **the underwriter that made the judgment**, because it
funded the deal with its own capital. This is Maple's and Goldfinch's mechanism,
and it is the layer that holds against attacks nobody has thought of yet.

### 10.3 What is deliberately trusted

Stating these plainly is part of the design, not an omission.

- **The issuer** controls its own security: it may pause, force-transfer if
  `isControllable`, and amend the control list. ERC-1400 gives issuers these
  powers on purpose; Rialto does not remove them and cannot.
- **The document's truth.** Rialto proves *which* document was read, never that
  it is true. §2.4.
- **The model provider**, for availability only. If it is down, agents do not
  bid; nothing is at risk.

---

## 11. Invariants

Asserted in tests; a violation is a bug.

1. Collateral held by the contract equals the sum of `collateralAmount` over
   requests in `Open` or `Funded`, and no other value.
2. The contract's cash balance is **always zero**, at every point in every flow.
3. `liveExposure[u]` equals the sum of `principal` over that underwriter's
   `Funded` requests.
4. `reservedExposure[u]` equals the sum of `principal` over requests where `u`
   holds the standing best bid and the request is still `Open`.
5. **`liveExposure[u] + reservedExposure[u] ≤ mandateOf(u).maxTotal` at all
   times**, including while several auctions are simultaneously live. Checking
   only `liveExposure` at bid time makes the limit checkable but not
   enforceable — see the commentary in `bid()`.
6. A request in `Funded` has exactly one of `repay` or `claim` available, decided
   only by `block.timestamp` against `dueAt`.
7. `repayAmount` is written once, at `award`, and never changes.
8. `bestBid[id].repayAmount` is strictly decreasing over the life of an auction.
9. No function reads any price, from any source.
10. Every status transition is one-way: `Open → {Funded, Cancelled}`,
    `Funded → {Repaid, Defaulted}`.
11. A bid that passes `bid()` satisfies every field of its underwriter's mandate.
12. A cancelled or resolved request leaves zero `reservedExposure` behind.

---

## 12. Test plan

### 12.1 Unit — Foundry, both 6 and 18 decimal cash

Running the whole suite at two decimal bases catches the truncation class of bug
that a single base hides.

- Rate maths: correct at 6dp and 18dp; a one-week fee never truncates to zero
- Auction: lowest bid wins; equal bid rejected; late bid rejected
- Mandate: each of the five limits rejects independently
- **Exposure: an underwriter holding the best bid on three simultaneous auctions is rejected on the bid that would breach `maxTotal`, not silently allowed through to award**
- Outbid underwriter's reservation is released; a failed bid restores it
- Agent binding: a key bound to one owner cannot bid for another
- Settlement: cash never rests in the contract, asserted after every call
- Repay at `dueAt` exactly succeeds; one second later fails
- `claim` before `dueAt` fails; after succeeds
- `cancel` only with zero bids and only after the deadline

### 12.2 Adversarial

Every test here is an attempt to take money or break the machine. A failure is a
finding.

- Jailbroken agent submits a bid at 0% → rejected by `minRateBps`
- Jailbroken agent bids beyond `maxPerDeal` and beyond `maxTotal` → both rejected
- Agent bids on an asset not in `allowedAssets` → rejected
- Reentrant token attempts re-entry on `award`, `repay`, `claim`
- Token returning `false` without reverting → `TransferFailed`
- Token returning nothing → accepted (HTS facade compatibility)
- Malicious borrower opens, gets funded, and attempts `cancel`
- Borrower cancels after the deadline with a winning bid standing; confirm the bidder's reservation is released and no cash moved
- Third party attempts `repay` for a borrower, and `claim` before `dueAt`
- Fuzz: no sequence of open/bid/award/repay/claim leaves the contract holding
  cash, or collateral not attributable to a live request

### 12.3 Integration — live Hedera testnet

1. Deploy a bond through the factory with a prospectus attached
2. Add `RialtoMarket` to the control list; confirm escrow now succeeds
3. Run three agents against one request; confirm three distinct HCS messages
   with consensus timestamps preceding the `Awarded` event
4. **Edit one clause of the prospectus** (senior → subordinated), re-issue, and
   confirm every bid moves
5. Embed a prompt injection in a prospectus; confirm the agent is fooled and the
   contract still rejects the bid
6. Full lifecycle to repayment; full lifecycle to default
7. **Scheduled settlement (§5.5):** award a short-term deal, do nothing at all,
   and confirm the network executes `claim` on its own — the `Defaulted` event
   with no corresponding user transaction is the proof. Then confirm `repay`
   deletes a pending schedule, and that a contract with zero HBAR still awards
   normally and still settles by manual `claim()`.

---

## 13. Build order

Nine days. Each day ends with something demonstrable.

| Day | Deliverable | Gate |
|---|---|---|
| **1** | Bond issued through the live factory with a document attached; hash verified on-chain | **If this fails, cut to a mock ERC-20 collateral and keep the mechanism.** Everything downstream is independent of ATS. |
| 2 | `Mandates` + `RialtoMarket` compiling, unit tests at both decimal bases |  |
| 3 | Full lifecycle on testnet: open → bid → award → repay, and → default |  |
| 4 | Control-list integration; escrow works against a real whitelisted security |  |
| 5 | One agent: reads the document, verifies the hash, reasons, publishes to HCS, bids |  |
| 6 | Three agents with different strategies; auction resolves between them |  |
| 7 | Web app: borrower flow, underwriter flow, **manual bidding path** |  |
| 8 | Adversarial suite; prompt-injection demo; clause-edit demo |  |
| 9 | Demo video, README, deployment addresses, submission |  |

### 13.1 Upstream contribution to ATS

Building this surfaces real defects in Asset Tokenization Studio, and the
credible way to show depth of use is to fix one. Ranked by "already evidenced,
mergeable, and useless to fake":

1. **The stale deployed-addresses documentation.** §3.2 establishes, with
   reproduction commands, that
   `docs/ats/developer-guides/contracts/deployed-addresses.md` still lists the
   v4.0.0 contracts from 2026-01-22 while the live factory answers the v8.0.0
   ABI and the repo's own `apps/ats/web/.env.example` carries the current
   addresses. Every new integrator hits this first. The PR is small, factual,
   and was found by using the system rather than reading about it. **This is the
   one to open, and it can be opened on day 1.**
2. **A worked ERC-1643 example.** The Documentation facet has no example showing
   the read path Rialto depends on — `getAllDocuments` → `getDocument` → fetch
   the URI → re-hash the bytes → compare. That five-line pattern is the whole
   basis of trusting a document on-chain (§2.6, §6.1) and is currently left as
   an exercise.

Open (1) as soon as day 1 confirms the addresses first-hand. Offer (2) if there
is slack after day 8. Neither is a submission deliverable; both are evidence
that the integration went deeper than the mint facet.

**Descope ladder, in the order things get cut:** three agents → one agent plus a
manual bidder; ATS security → mock ERC-20 with an ERC-1643 document facet;
web app → CLI plus HashScan links. The mechanism survives all three cuts.

---

## 14. Open items and known limits

1. **No write to the ATS factory has been performed by this project yet.** Reads
   are verified and a third-party deployment on 2026-09-02 succeeded at
   7,023,179 gas / 8.08 HBAR. Day 1 is the gate.
2. **Both sides of the market are simulated in the demo.** There are no organic
   borrowers or lenders on day one. Say so; do not imply traction.
3. **The lender must be whitelisted on the security before bidding**, or cannot
   receive collateral on default. Enforcing this at bid time is desirable and is
   not in v1.
4. **No partial fills and no partial repayment.** A deal is all-or-nothing.
5. **No secondary transfer of a live position.** A lender is committed until
   repayment or default.
6. **Tranching is deliberately out of scope.** Splitting a loan into a senior
   slice for passive capital and a junior slice for the underwriter is how this
   scales beyond the underwriter's own balance sheet — the Goldfinch structure —
   but it is a second mechanism and belongs in v2.
7. **The issuer retains pause and force-transfer powers** over its own security.
   Inherent to ERC-1400; disclose it rather than pretend otherwise.
8. **Chainlink Proof of Reserve is not available on Hedera, and Rialto does not
   claim it.** Proving that the off-chain asset behind a security actually
   exists is the obvious complement to §2.4, and PoR is the obvious tool. It was
   investigated and rejected on evidence, not taste:

   ```bash
   curl -s https://reference-data-directory.vercel.app/feeds-hedera-mainnet.json
   curl -s https://reference-data-directory.vercel.app/feeds-hedera-testnet.json
   ```

   Checked 2026-09-04: 27 mainnet feeds and 7 testnet feeds, **every one of them
   a price reference feed** (plus one exchange rate). There is no feed with
   `productSubType: Proof of Reserve` on either network. PoR feeds are
   commissioned per asset with Chainlink and a custodian — a procurement
   exercise measured in weeks, not a contract you point at. Writing "Rialto uses
   Chainlink PoR" into this document would have sent a builder at a feed that
   does not exist.

   The design does not need it. §2.4 is the argument that verification is the
   wrong goal and that first-loss capital is the mechanism: the underwriter that
   believes a false claim loses its own money. PoR would narrow one class of lie
   at the cost of a dependency Hedera cannot currently satisfy. If a PoR feed
   for a tokenized security ever ships on Hedera, it enters as one more input to
   the agent's opinion — never as a contract-level branch, which would
   reintroduce exactly the oracle §5.4 exists to keep out.
9. **ASSUMPTION:** that no open funding layer for ATS assets ships before
   2026-09-13.

---

## 15. Sources

Every external claim in this document, with where it came from.

**Hedera / ATS — verified directly against testnet or the v8.0.0 source, 2026-09-03**
- Factory `0.0.9213391`, Resolver `0.0.9212226`; 108 business logics; 8 configurations; BOND and EQUITY at version 1 — `eth_call` via `testnet.hashio.io`
- Deployment cost 7,023,179 gas / 8.08 HBAR — Mirror Node transaction record, 2026-09-02
- Stale docs page: `docs/ats/developer-guides/contracts/deployed-addresses.md` (v4.0.0, 2026-01-22) vs `apps/ats/web/.env.example` (current)
- Interfaces and role constants — `hashgraph/asset-tokenization-studio` v8.0.0 source
- Scheduled-transaction ceiling (`scheduling.maxExpirationFutureSeconds`) — HIP-423, and the default `5356800` in `SchedulingConfig.java`, `hiero-ledger/hiero-consensus-node`
- **HIP-1215 "Generalized Scheduled Contract Calls", status Final, node v0.68.0** — selectors `0x6f5bfde8` / `0xdfb4a999` / `0x72d42394` reproduced with `cast sig` and matched against the HIP's own table
- **HSS live at `0x…016b` on testnet *and* mainnet**, and the 62-day expiry ceiling measured directly — `eth_call` to `hasScheduleCapacity`, true at exactly 5,356,800s, false at 63 and 90 days, 2026-09-04 (§3.6)
- `ContractCall` present in the default `scheduling.whitelist`, `longTermEnabled=true` — `SchedulingConfig.java`
- HIP-755 (Final) gives contracts `signSchedule(address,bytes)` = `0x358eeb03` only; HIP-756 (Final) schedules token create/update only — neither can schedule an arbitrary call
- **No Chainlink Proof of Reserve feed exists on Hedera** (27 mainnet / 7 testnet feeds, all price references) — Chainlink reference-data-directory, 2026-09-04 (§14.8)

**Market facts**
- Bonzo Lend exploit, 11 July 2026, $9.05M, zeroed BLS signature accepted by Supra's verifier, Hedera TVL −40%, Bonzo TVL −77% — CoinDesk, Blockonomi, Bonzo incident report
- Lloyds / Aberdeen / Archax first UK tokenized-collateral FX trade on Hedera; tokenized gilts and money market fund; Archax Nest — Hedera case study, Lloyds Banking Group press release, Ledger Insights
- UK trades $5.4T/day in FX and interest-rate derivatives — Lloyds/Archax coverage
- Broadridge DLR: $351B/day, $7.4T/month, +457% YoY — Broadridge press releases, 2026
- Tri-party Treasury repo haircut ~2%; >60% of Treasury repo at zero haircut — US Office of Financial Research; New York Fed Teller Window
- Tokenized RWA ~$60B / 7,000+ products; tokenized Treasuries ~$9.6–15B, +120% YoY; $10B+ RWA settled on Hedera
- Maple pool delegates and Goldfinch backers post first-loss capital — protocol documentation and 2026 comparisons
- ERC-3643 compliance-versus-liquidity trade-off; LP contracts require an ONCHAINID and whitelisting — Tokeny / ERC-3643 documentation

**Prior-art checks performed**
- No DeFi or crypto protocol named "Rialto" — npm, GitHub code search, 2026 protocol listings
- Hedera has no open credit layer for ATS-issued assets; Archax Nest is permissioned collateral transfer, not funding

---

*Rialto. You cannot look it up. You have to find out what someone will pay.*
