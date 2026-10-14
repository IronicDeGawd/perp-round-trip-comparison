// The race server. Serves the UI and runs both lanes in parallel on one
// "Run both" press, streaming every event live over Server-Sent Events. Each
// run is saved as a JSON timeline under runs/. No secrets reach the browser —
// keys stay here, the UI only ever receives events.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import dotenv from "dotenv";
import { runDreamdex, ensureReady as ddReady } from "./dreamdex.mjs";
import { runHyperliquid, ensureReady as hlReady } from "./hyperliquid.mjs";

dotenv.config();
const __dir = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dir, "..", "public");
const RUNS = join(__dir, "..", "runs");
const PORT = Number(process.env.PORT || 8800);

const DD_KEY = process.env.DREAMDEX_PRIVATE_KEY;
const HL_KEY = process.env.HL_AGENT_PRIVATE_KEY;
const HL_MASTER = process.env.HL_MASTER_ADDRESS;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };

function sse(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream", "cache-control": "no-cache",
    connection: "keep-alive", "access-control-allow-origin": "*",
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleRace(req, res) {
  const send = sse(res);
  const t0 = Date.now();
  send("start", { t0 });

  const safe = (fn, lane) => fn().catch((err) => {
    send("error", { lane, message: String(err?.message || err) });
    return { venue: lane, error: String(err?.message || err), ok: false, events: [], txHashes: [] };
  });

  const emit = (e) => send("tick", e);
  const [dd, hl] = await Promise.all([
    safe(() => runDreamdex({ privateKey: DD_KEY, t0, emit }), "dreamdex"),
    safe(() => runHyperliquid({ privateKey: HL_KEY, master: HL_MASTER, t0, emit }), "hyperliquid"),
  ]);

  const race = { t0, date: new Date(t0).toISOString(), dreamdex: dd, hyperliquid: hl };
  // winner by finishMs
  if (dd.ok && hl.ok) {
    race.winner = dd.finishMs <= hl.finishMs ? "dreamdex" : "hyperliquid";
    race.speedup = +(Math.max(dd.finishMs, hl.finishMs) / Math.min(dd.finishMs, hl.finishMs)).toFixed(1);
  }
  send("done", race);
  res.end();

  // persist (best effort)
  try {
    await mkdir(RUNS, { recursive: true });
    await writeFile(join(RUNS, `race-${t0}.json`), JSON.stringify(race, null, 2));
  } catch {}
}

async function handleReady(res) {
  const out = { dreamdex: null, hyperliquid: null };
  try { out.dreamdex = DD_KEY ? await ddReady(DD_KEY) : { error: "no DREAMDEX_PRIVATE_KEY" }; } catch (e) { out.dreamdex = { error: String(e.message) }; }
  try { out.hyperliquid = HL_KEY && HL_MASTER ? await hlReady(HL_KEY, HL_MASTER) : { error: "no HL keys" }; } catch (e) { out.hyperliquid = { error: String(e.message) }; }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(out));
}

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") path = "/index.html";
  // saved run timelines live outside public/ — serve them so the UI's
  // ?replay=/runs/<file>.json deterministic replay works against this server.
  const base = path.startsWith("/runs/") ? RUNS : PUBLIC;
  const rel = path.startsWith("/runs/") ? path.slice("/runs".length) : path;
  try {
    const file = join(base, rel);
    if (!file.startsWith(base)) throw new Error("bad path");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  if (pathname === "/api/race") return handleRace(req, res);
  if (pathname === "/api/ready") return handleReady(res);
  return serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`race server on http://localhost:${PORT}`);
  console.log(`  UI        http://localhost:${PORT}/`);
  console.log(`  readiness http://localhost:${PORT}/api/ready`);
});
