// One DreamDEX round trip from the command line: open + close in one atomic
// transaction, printed as a timeline (submit, accepted, settled) plus the hash.
//   node --env-file=.env.local scripts/dreamdex-measure.mjs
import { runDreamdex, ensureReady } from "../src/dreamdex.mjs";

const pk = process.env.DREAMDEX_PRIVATE_KEY;
if (!pk) { console.error("set DREAMDEX_PRIVATE_KEY in .env.local"); process.exit(1); }
console.error("ready:", await ensureReady(pk));
const out = await runDreamdex({ privateKey: pk, emit: (e) => console.error(`  ${e.tMs}ms ${e.step} ${e.label}`) });
console.log(JSON.stringify(out, null, 2));
