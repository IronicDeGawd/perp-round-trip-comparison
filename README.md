# DreamDEX vs Hyperliquid — one-button round-trip race

A bot opens **and** closes a BTC perpetual on two venues, and we time each to
**on-chain settlement**. Press one button; both run in parallel; you see which
finishes first and the method each used.

- **DreamDEX (on Somnia's Hideki chain):** the open and the close go in **one
  atomic on-chain transaction** — the wallet is EIP-7702-delegated to a small
  batcher contract, and a single transaction places both orders against the
  pool's on-chain order book. Settled in one block.
- **Hyperliquid:** the open and the close are **two separate signed orders**.
  Each is a signed message sent to Hyperliquid's API server, matched on
  HyperCore (Hyperliquid's own order-book chain). Settled when the fill lands in
  a HyperCore block.

## What we measured

Both sides measured the same way, from the same cloud box in **AWS Tokyo
(`ap-northeast-1`)** — the region hosting both venues' infrastructure — timed to
on-chain settlement, not to an API acknowledgement.

| | DreamDEX (Hideki) | Hyperliquid |
|---|---|---|
| Open + close | **one atomic tx** | two separate orders |
| Submit → accepted | ~15 ms | — |
| Full round-trip, settled on-chain | **~240 ms** (best 33 ms same-block) | **~1.45 s** (~700 ms per order, twice) |
| Atomic (all-or-nothing)? | yes | no |

DreamDEX settles the whole round-trip roughly **6× faster**, and does it as one
transaction a smart-contract bot can't replicate on Hyperliquid.

## Honest notes

- **This is a capability story, not a gas story.** On Somnia the EIP-7702
  authorization costs ~1.57M gas (far more than on Ethereum), so the atomic
  batch saves nothing on gas versus two transactions. The point is **atomicity**
  (one all-or-nothing transaction) and **self-custody**, not cost.
- **Hyperliquid's ~700 ms is real on-chain settlement**, not an off-chain trick.
  A read from the same box was ~9 ms, so the ~700 ms is genuine HyperCore
  consensus for a write. The honest distinction is *shape*: Hyperliquid has no
  single atomic on-chain open-and-close — orders settle as separate steps, and
  the path a contract would use (CoreWriter) settles asynchronously.
- **Location matters.** The same DreamDEX round-trip measured from a laptop over
  the public internet read ~1.4 s — all network round-trip. Numbers here are
  from a server next to the venues; reproduce from there or expect inflation.

## How it works

```
public/index.html   the race UI (one button, two lanes, live timers)
src/race-server.mjs  runs both lanes in parallel, streams events (SSE), saves runs/*.json
src/dreamdex.mjs     one atomic open+close via the EIP-7702 batcher
src/hyperliquid.mjs  open then close, two signed API orders
src/setup.mjs        one-time: approve margin, deposit, attach the 7702 delegation
src/config.mjs       public addresses and constants (no secrets)
```

A local backend holds the keys (in a gitignored `.env`) and does the trades; the
browser only ever receives events, never a key.

## Run it

Testnet only. You need a funded DreamDEX throwaway wallet (STT for gas + USDso
for margin) and a Hyperliquid testnet agent wallet approved on a funded account.

```bash
npm install
cp .env.example .env         # fill in the three testnet credentials
npm run setup                # DreamDEX: approve margin, deposit, attach 7702 delegation
npm run race                 # serves the UI at http://localhost:8800
```

Open `http://localhost:8800`, press **Run both**. Each run is saved to
`runs/race-<timestamp>.json` (submit, accepted, open fill, close fill, settled,
with tx hashes), which the UI can also replay deterministically:
`http://localhost:8800/?replay=runs/race-<timestamp>.json`.

Query params: `?bg=transparent` (drop the page background, keep the card),
`?max=<ms>` (time-ruler span, default 1600).

### Reproduce the honest numbers

Run the backend on a small box in `ap-northeast-1` (Tokyo) and open the UI
against it, so timing reflects the venues, not your distance from them.

## Order details

- **DreamDEX:** BTC-PERP pool, IOC buy then IOC sell, 0.00013 BTC (~$11, the
  market minimum), margin in USDso via the pool's MarginBank.
- **Hyperliquid:** BTC perp, IOC buy then reduce-only IOC sell, 0.0002 BTC.

## Safety

No private keys, tokens, or `.env` values are committed. Keys live only in your
local `.env` (gitignored). All credentials used are testnet throwaways.

## License

MIT
