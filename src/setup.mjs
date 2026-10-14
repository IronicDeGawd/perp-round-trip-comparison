// One-time setup for the DreamDEX lane: give the pool's margin bank an
// allowance, deposit perp margin, and attach the wallet's EIP-7702 delegation
// to the already-deployed SessionDelegate batcher. Idempotent — safe to re-run.
// Hyperliquid needs no setup here (the agent is approved on the master account).
//   node src/setup.mjs [depositUSDso]
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";
import { DREAMDEX, chain, erc20Abi, marginBankAbi } from "./config.mjs";

dotenv.config();
const pk = process.env.DREAMDEX_PRIVATE_KEY;
if (!pk) { console.error("set DREAMDEX_PRIVATE_KEY in .env"); process.exit(1); }
const depositAmt = process.argv[2] || "5";

const account = privateKeyToAccount(pk.startsWith("0x") ? pk : "0x" + pk);
const pub = createPublicClient({ chain, transport: http(DREAMDEX.rpc) });
const wallet = createWalletClient({ account, chain, transport: http(DREAMDEX.rpc) });
const me = account.address;
const L = (...a) => console.log(...a);

L("wallet:", me);
L("STT gas:", formatUnits(await pub.getBalance({ address: me }), 18));

// 1. allowance
const token = getContract({ address: DREAMDEX.usdso, abi: erc20Abi, client: { public: pub, wallet } });
const allowance = await token.read.allowance([me, DREAMDEX.marginBank]);
L("USDso allowance -> marginBank:", formatUnits(allowance, 18));
if (allowance < parseUnits(depositAmt, 18)) {
  L("approving 100 USDso to marginBank ...");
  const h = await wallet.writeContract({ address: DREAMDEX.usdso, abi: erc20Abi, functionName: "approve", args: [DREAMDEX.marginBank, parseUnits("100", 18)] });
  await pub.waitForTransactionReceipt({ hash: h }); L("  approved", h);
}

// 2. deposit margin
L(`depositing ${depositAmt} USDso margin ...`);
const dh = await wallet.writeContract({ address: DREAMDEX.marginBank, abi: marginBankAbi, functionName: "deposit", args: [parseUnits(depositAmt, 18)] });
const dr = await pub.waitForTransactionReceipt({ hash: dh });
L("  deposit", dh, dr.status);

// 3. EIP-7702 delegation to the batcher
const code = await pub.getCode({ address: me });
if (code && code.startsWith("0xef0100")) {
  L("already delegated:", code);
} else {
  const delegateCode = await pub.getCode({ address: DREAMDEX.sessionDelegate });
  if (!delegateCode || delegateCode === "0x") {
    console.error(`SessionDelegate ${DREAMDEX.sessionDelegate} has no code on this chain. Deploy it first (see README).`);
    process.exit(1);
  }
  L("attaching EIP-7702 delegation ->", DREAMDEX.sessionDelegate, "...");
  const auth = await wallet.signAuthorization({ account, contractAddress: DREAMDEX.sessionDelegate, executor: "self" });
  const h = await wallet.sendTransaction({ to: me, data: "0x", authorizationList: [auth], gas: 2000000n });
  const r = await pub.waitForTransactionReceipt({ hash: h });
  L("  delegation tx", h, r.status);
  L("  account code now:", await pub.getCode({ address: me }));
}
L("setup done.");
