// One Hyperliquid round trip from the command line: an open order, then a
// reduce-only close, printed as a timeline with both HyperCore hashes.
//   node --env-file=.env.local scripts/hyperliquid-measure.mjs
import { runHyperliquid } from "../src/hyperliquid.mjs";

const pk = process.env.HL_AGENT_PRIVATE_KEY, master = process.env.HL_MASTER_ADDRESS;
if (!pk || !master) { console.error("set HL_AGENT_PRIVATE_KEY and HL_MASTER_ADDRESS in .env.local"); process.exit(1); }
const out = await runHyperliquid({ privateKey: pk, master, emit: (e) => console.error(`  ${e.tMs}ms ${e.step} ${e.label}`) });
console.log(JSON.stringify(out, null, 2));
