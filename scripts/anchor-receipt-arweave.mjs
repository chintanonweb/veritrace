#!/usr/bin/env node
/**
 * Anchor a receipt to Arweave for real, for $0.
 *
 *   pnpm anchor:init                     # once — mint a wallet (no AR needed)
 *   pnpm anchor:arweave examples/out/receipt.json
 *
 * Reads a signed receipt, Merkle-batches it, publishes the root to Arweave via
 * Turbo (free under 105 KiB), writes the tx id back into the receipt file, and
 * prints the public URLs. Re-run `veritrace-verify` afterwards — `anchored`
 * will now be checked against a real transaction, not a local stub.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { anchorBatch, createAnchorBackend } from "../packages/anchor/src/index.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: pnpm anchor:arweave <receipt.json>");
  process.exit(2);
}

const record = JSON.parse(readFileSync(path, "utf8"));
const backend = await createAnchorBackend("turbo");

console.log(`\n  anchoring ${path}`);
console.log(`  backend: ${backend.name}`);

const [anchored] = await anchorBatch([record], backend);

writeFileSync(path, JSON.stringify(anchored, null, 2));

const txId = anchored.anchor.arweaveTxId;
console.log(`  merkleRoot: ${anchored.anchor.merkleRoot}`);
console.log(`  arweave tx: ${txId}`);
console.log(`  gateway:    https://arweave.net/${txId}`);
console.log(`  cache:      https://turbo-gateway.com/${txId}`);
console.log(`\n  Receipt updated in place. Verify with:`);
console.log(`  $ pnpm --filter @veritrace/verifier exec tsx bin/veritrace-verify.mjs ${path}\n`);
process.exit(0);
