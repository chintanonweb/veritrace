#!/usr/bin/env node
/** Generate an Arweave wallet for Turbo anchoring. Costs nothing and needs no
 *  AR — Turbo's free tier covers data items under 105 KiB. Persisted to
 *  .veritrace/wallet.json (gitignored) so repeat anchors share one allowance. */
import { initArweaveWallet } from "../packages/anchor/src/backends/turbo.ts";

const { file, address } = await initArweaveWallet();

console.log(`\n  Arweave wallet created`);
console.log(`  address: ${address}`);
console.log(`  file:    ${file}   (keep this — it is the free-tier identity)`);
console.log(`\n  No AR tokens needed. Turbo anchors items under 105 KiB for free.`);
console.log(`  Next: pnpm anchor:arweave examples/out/receipt.json\n`);
