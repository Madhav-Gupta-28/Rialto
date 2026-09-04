/** Only what the agent actually calls. A smaller ABI is a smaller surface. */

export const marketAbi = [
  {
    type: "function",
    name: "requests",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "borrower", type: "address" },
          { name: "term", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "collateral", type: "address" },
          { name: "bidDeadline", type: "uint64" },
          { name: "docFromChain", type: "bool" },
          { name: "cash", type: "address" },
          { name: "dueAt", type: "uint64" },
          { name: "lender", type: "address" },
          { name: "collateralAmount", type: "uint256" },
          { name: "principal", type: "uint256" },
          { name: "repayAmount", type: "uint256" },
          { name: "docName", type: "bytes32" },
          { name: "docHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "bid",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "repayAmount", type: "uint256" },
      { name: "reasoningRef", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "bestBid",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "underwriter", type: "address" },
      { name: "submitter", type: "address" },
      { name: "repayAmount", type: "uint256" },
      { name: "reasoningRef", type: "bytes32" },
    ],
  },
  { type: "function", name: "liveExposure", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reservedExposure", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "Requested",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "borrower", type: "address", indexed: true },
      { name: "collateral", type: "address", indexed: false },
      { name: "collateralAmount", type: "uint256", indexed: false },
      { name: "principal", type: "uint256", indexed: false },
      { name: "term", type: "uint64", indexed: false },
      { name: "docName", type: "bytes32", indexed: false },
      { name: "docHash", type: "bytes32", indexed: false },
      { name: "docFromChain", type: "bool", indexed: false },
    ],
  },
] as const;

export const mandatesAbi = [
  {
    type: "function",
    name: "mandateOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agent", type: "address" },
          { name: "maxPerDeal", type: "uint256" },
          { name: "maxTotal", type: "uint256" },
          { name: "minRateBps", type: "uint16" },
          { name: "maxTerm", type: "uint64" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  { type: "function", name: "ownerOfAgent", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "assetAllowed",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

/** The ERC-1643 read path on an ATS security. */
export const documentationAbi = [
  {
    type: "function",
    name: "getDocument",
    stateMutability: "view",
    inputs: [{ name: "name", type: "bytes32" }],
    outputs: [{ type: "string" }, { type: "bytes32" }, { type: "uint256" }],
  },
  { type: "function", name: "getAllDocuments", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32[]" }] },
] as const;

/** Request.status, matching RialtoTypes.sol. */
export enum Status {
  Open = 0,
  Funded = 1,
  Repaid = 2,
  Defaulted = 3,
  Cancelled = 4,
}
