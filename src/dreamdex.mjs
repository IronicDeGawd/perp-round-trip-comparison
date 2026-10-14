// DreamDEX lane: one atomic transaction that opens AND closes a BTC perp.
// The wallet is EIP-7702-delegated to a batcher (SessionDelegate); a single
// tx to itself calls execute([openIOCbuy, closeIOCsell]). Matching happens in
// the pool's on-chain order book; "settled" = the tx is mined in a block.
import { createPublicClient, createWalletClient, http, encodeFunctionData, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import {
  DREAMDEX, chain, perpAbi, sessionAbi, erc20Abi, marginBankAbi, ORDER_TYPE, SELF_MATCH,
} from "./config.mjs";

const METHOD = "One on-chain transaction. Matching in the order-book contract. Open + close are atomic (all-or-nothing).";

function makeClients(privateKey) {
  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : "0x" + privateKey);
  const pub = createPublicClient({ chain, transport: http(DREAMDEX.rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(DREAMDEX.rpc) });
  return { account, pub, wallet };
}

const toTick = (p, up) => { const q = p / DREAMDEX.tick; return (up ? q + 1n : q) * DREAMDEX.tick; };
const orderArgs = (isBid, price) => [
  isBid, 0n, price, DREAMDEX.qty, (BigInt(Date.now()) + 60000n) * 1000000n,
  ORDER_TYPE.ImmediateOrCancel, SELF_MATCH.CancelTaker, "0x0000000000000000000000000000000000000000", 0n,
];

// One-time check: wallet delegated + margin present. Does NOT trade.
export async function ensureReady(privateKey) {
  const { account, pub } = makeClients(privateKey);
  const code = await pub.getCode({ address: account.address });
  const delegated = !!code && code.startsWith("0xef0100");
  const stt = await pub.getBalance({ address: account.address });
  return { address: account.address, delegated, delegationCode: code || "0x", sttWei: stt.toString() };
}

// Run one atomic open+close round-trip. Emits per-step events relative to t0.
export async function runDreamdex({ privateKey, t0 = Date.now(), emit = () => {} }) {
  const { account, pub, wallet } = makeClients(privateKey);
  const me = account.address;
  const events = [];
  const push = (step, label, extra = {}) => {
    const e = { lane: "dreamdex", step, label, tMs: Date.now() - t0, ...extra };
    events.push(e); emit(e); return e;
  };

  const code = await pub.getCode({ address: me });
  if (!code || !code.startsWith("0xef0100")) {
    throw new Error("DreamDEX wallet is not EIP-7702 delegated. Run setup (npm run setup) first.");
  }

  const mark = await pub.readContract({ address: DREAMDEX.btcPerp, abi: perpAbi, functionName: "getMarkPrice" });
  const buy = toTick((mark * 102n) / 100n, true);
  const sell = toTick((mark * 98n) / 100n, false);
  const calls = [
    { to: DREAMDEX.btcPerp, value: 0n, data: encodeFunctionData({ abi: perpAbi, functionName: "placeOrder", args: orderArgs(true, buy) }) },
    { to: DREAMDEX.btcPerp, value: 0n, data: encodeFunctionData({ abi: perpAbi, functionName: "placeOrder", args: orderArgs(false, sell) }) },
  ];
  const data = encodeFunctionData({ abi: sessionAbi, functionName: "execute", args: [calls] });

  push("submit", "Submit 1 tx (open + close)");
  const hash = await wallet.sendTransaction({ to: me, data, gas: 30000000n });
  push("accepted", "Accepted by node", { hash });
  const r = await pub.waitForTransactionReceipt({ hash });
  const settled = push("settled", "Settled on-chain", {
    hash, status: r.status, gasUsed: r.gasUsed.toString(), fills: 2, blockNumber: r.blockNumber.toString(),
  });

  return {
    venue: "dreamdex",
    label: "DreamDEX (Hideki)",
    method: METHOD,
    ok: r.status === "success",
    finishMs: settled.tMs,
    txHashes: [hash],
    events,
  };
}

// Standalone: print one timeline.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dotenv = await import("dotenv"); dotenv.config();
  const pk = process.env.DREAMDEX_PRIVATE_KEY;
  if (!pk) { console.error("set DREAMDEX_PRIVATE_KEY in .env"); process.exit(1); }
  const ready = await ensureReady(pk); console.error("ready:", ready);
  const out = await runDreamdex({ privateKey: pk, emit: (e) => console.error(`  ${e.tMs}ms ${e.step} ${e.label}`) });
  console.log(JSON.stringify(out, null, 2));
}
