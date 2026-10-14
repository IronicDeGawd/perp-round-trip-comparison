// Hyperliquid lane: a bot opens, then closes, a BTC perp as TWO separate
// signed API orders. Each order is a signed message POSTed to HL's API server;
// matching runs on HyperCore (HL's own order-book chain, not an EVM contract).
// "Settled" = the fill is included in a HyperCore block (the API returns it
// with a HyperCore tx hash). Two orders = two waits; they cannot be atomic.
import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { HL } from "./config.mjs";

const METHOD = "Signed message to the API server. Matching on HyperCore. Two separate orders (open, then close) — not atomic.";

function makeClients(privateKey) {
  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : "0x" + privateKey);
  const transport = new hl.HttpTransport({ isTestnet: HL.isTestnet });
  const info = new hl.InfoClient({ transport });
  const exch = new hl.ExchangeClient({ wallet: account, transport, isTestnet: HL.isTestnet });
  return { account, info, exch };
}

export async function ensureReady(privateKey, master) {
  const { info } = makeClients(privateKey);
  const st = await info.clearinghouseState({ user: master }).catch(() => null);
  return { master, reachable: !!st };
}

async function markPx(info) {
  const [, ctxs] = await info.metaAndAssetCtxs();
  return Number(ctxs[HL.btcAsset].markPx);
}

// Run open then close. Emits open_submit/open_settled/close_submit/close_settled.
export async function runHyperliquid({ privateKey, master, t0 = Date.now(), emit = () => {} }) {
  const { info, exch } = makeClients(privateKey);
  const events = [];
  const push = (step, label, extra = {}) => {
    const e = { lane: "hyperliquid", step, label, tMs: Date.now() - t0, ...extra };
    events.push(e); emit(e); return e;
  };

  const px = await markPx(info);
  const buyPx = (px * 1.02).toFixed(0);
  const sellPx = (px * 0.98).toFixed(0);

  // OPEN
  push("open_submit", "Submit open order");
  const o = await exch.order({ orders: [{ a: HL.btcAsset, b: true, p: buyPx, s: HL.size, r: false, t: { limit: { tif: "Ioc" } } }], grouping: "na" });
  const oStatus = o?.response?.data?.statuses?.[0];
  const oOid = oStatus?.filled?.oid;
  push("open_settled", "Open settled on HyperCore", { oid: oOid, avgPx: oStatus?.filled?.avgPx });

  // CLOSE
  push("close_submit", "Submit close order");
  const c = await exch.order({ orders: [{ a: HL.btcAsset, b: false, p: sellPx, s: HL.size, r: true, t: { limit: { tif: "Ioc" } } }], grouping: "na" });
  const cStatus = c?.response?.data?.statuses?.[0];
  const cOid = cStatus?.filled?.oid;
  const closeEv = push("close_settled", "Close settled on HyperCore", { oid: cOid, avgPx: cStatus?.filled?.avgPx });

  // resolve HyperCore tx hashes (post-settle, not part of timing)
  let txHashes = [];
  try {
    const fills = await info.userFills({ user: master });
    const byOid = new Map(fills.map((f) => [f.oid, f.hash]));
    txHashes = [oOid, cOid].map((id) => byOid.get(id)).filter(Boolean);
  } catch {}

  const ok = !!(oStatus?.filled && cStatus?.filled);
  return {
    venue: "hyperliquid",
    label: "Hyperliquid",
    method: METHOD,
    ok,
    finishMs: closeEv.tMs,
    txHashes,
    events,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dotenv = await import("dotenv"); dotenv.config();
  const pk = process.env.HL_AGENT_PRIVATE_KEY, master = process.env.HL_MASTER_ADDRESS;
  if (!pk || !master) { console.error("set HL_AGENT_PRIVATE_KEY and HL_MASTER_ADDRESS in .env"); process.exit(1); }
  const out = await runHyperliquid({ privateKey: pk, master, emit: (e) => console.error(`  ${e.tMs}ms ${e.step} ${e.label}`) });
  console.log(JSON.stringify(out, null, 2));
}
