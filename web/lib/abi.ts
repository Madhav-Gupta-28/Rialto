export const marketAbi = [
  { type: "function", name: "requests", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
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
  { type: "function", name: "bidCount", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "liveExposure", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reservedExposure", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "settlementSchedule", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "rateBps",
    stateMutability: "pure",
    inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
    outputs: [{ type: "uint16" }],
  },
  { type: "function", name: "MAX_BID_WINDOW", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "MIN_BID_WINDOW", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "MAX_TERM", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  {
    type: "function",
    name: "open",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateral", type: "address" },
      { name: "collateralAmount", type: "uint256" },
      { name: "cash", type: "address" },
      { name: "principal", type: "uint256" },
      { name: "term", type: "uint64" },
      { name: "bidWindow", type: "uint64" },
      { name: "docName", type: "bytes32" },
      { name: "fallbackDocHash", type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bid",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
    outputs: [],
  },
  { type: "function", name: "award", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "repay", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "releaseBid", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;

export const mandatesAbi = [
  {
    type: "function",
    name: "mandateOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
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
  { type: "function", name: "assetAllowed", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "setMandate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "maxPerDeal", type: "uint256" },
      { name: "maxTotal", type: "uint256" },
      { name: "minRateBps", type: "uint16" },
      { name: "maxTerm", type: "uint64" },
    ],
    outputs: [],
  },
  { type: "function", name: "allowAsset", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "bool" }], outputs: [] },
  { type: "function", name: "revoke", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

export const securityAbi = [
  { type: "function", name: "getDocument", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "string" }, { type: "bytes32" }, { type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "isInControlList", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
] as const;

export const STATUS = ["Open", "Funded", "Repaid", "Defaulted", "Cancelled"] as const;
export type StatusName = (typeof STATUS)[number];
