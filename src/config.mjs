// Public constants only — no secrets. Addresses are public testnet contracts.

export const DREAMDEX = {
  rpc: "https://api.hideki2.infra.testnet.somnia.network",
  chainId: 50383,
  usdso: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",     // perp margin, 18dp
  marginBank: "0x478769E1177C0773c43A593DCCc4Ad15F15F1394",
  btcPerp: "0x4181dd08E73BbCdd1Ba3E615A18f6abD941b94C0",   // BTC-PERP pool
  tick: 100000000000000000n,  // 1e17 price units
  qty: 13000n,                // 0.00013 BTC (~$11, market minimum), lot-aligned
  // SessionDelegate (EIP-7702 batcher) — deployed once, reused via standing
  // delegation. Set after deploy; the engine deploys+attaches if absent.
  sessionDelegate: "0xc5536f7d7b263e69866bd87a82935f8e8934d843",
};

export const HL = {
  isTestnet: true,
  btcAsset: 3,       // BTC perp index on HL testnet
  size: "0.0002",    // ~$16 notional (> $10 min)
};

// OrderType enum (DreamDEX order book)
export const ORDER_TYPE = { NormalOrder: 0, FillOrKill: 1, ImmediateOrCancel: 2, PostOnly: 3 };
export const SELF_MATCH = { CancelTaker: 0, CancelMaker: 1 };

export const perpAbi = [
  { type: "function", name: "getMarkPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "placeOrder", stateMutability: "payable", inputs: [
    { name: "isBid", type: "bool" }, { name: "userData", type: "uint64" }, { name: "price", type: "uint256" },
    { name: "quantity", type: "uint256" }, { name: "expireTimestampNs", type: "uint64" }, { name: "orderType", type: "uint8" },
    { name: "selfMatchingOption", type: "uint8" }, { name: "builder", type: "address" }, { name: "builderFeeBpsTimes1k", type: "uint96" },
  ], outputs: [{ type: "bool" }, { type: "uint128" }] },
];

// SessionDelegate.execute(Call[]{to,value,data}) — the EIP-7702 batcher
export const sessionAbi = [
  { type: "function", name: "execute", stateMutability: "payable", inputs: [
    { name: "calls", type: "tuple[]", components: [
      { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
    ] },
  ], outputs: [] },
];

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
];

export const marginBankAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
];

export const chain = {
  id: DREAMDEX.chainId,
  name: "hideki",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [DREAMDEX.rpc] } },
};
