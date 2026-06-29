#!/usr/bin/env node
/**
 * VeriTrace end-to-end demo — run with: pnpm demo
 *
 * Wraps a (fake) AI refund agent, produces a real signed receipt, verifies it,
 * then tampers one field and shows verification fail. No accounts, no network.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { VeriTrace, generateKeypair } from "../packages/sdk-ts/src/index.ts";
import { anchorBatch, LocalAnchorBackend } from "../packages/anchor/src/index.ts";
import { verifyRecord } from "../packages/verifier/src/index.ts";

const line = (s = "") => console.log(s);

// 1. An identity for the agent (in production this lives in your env/KMS).
const { privateKey } = generateKeypair();

// 2. A VeriTrace client. The default sink buffers receipts; we drain them below.
const vt = new VeriTrace({ privateKey, agent: "support-bot" });

// 3. A pretend AI refund agent. Swap this for a real LLM/agent call.
async function refundAgent(order) {
  // ...imagine an LLM deciding here...
  return { decision: "approved", amountUSD: order.amountUSD, reason: "within policy" };
}

// 4. Wrap it — three lines is the whole integration.
const approveRefund = vt.wrap(refundAgent, {
  action: "refund.approve",
  model: "gpt-4o",
  modelVersion: "gpt-4o-2026-05-01",
  traceId: "order-5500",
});

line("\n── VeriTrace demo: AI customer-support refund ──────────────────────\n");

const order = { id: 5500, amountUSD: 5000, customer: "acme-corp" };
const result = await approveRefund(order);
line(`  AI decision: ${result.decision} a $${result.amountUSD} refund for ${order.customer}`);

const [signed] = vt.drain();

// 5. Anchor it: Merkle-batch and publish the root. LocalAnchorBackend keeps the
//    demo offline; swap in the Arweave/chain backend for permanent public proof.
const [record] = await anchorBatch([signed], new LocalAnchorBackend());

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const genuinePath = new URL("./out/receipt.json", import.meta.url);
writeFileSync(genuinePath, JSON.stringify(record, null, 2));
line(`  Signed + anchored receipt written → examples/out/receipt.json`);
line(`  signature:   ${record.signature.slice(0, 32)}…  (Ed25519 over the whole receipt)`);
line(`  merkleRoot:  ${record.anchor.merkleRoot.slice(0, 32)}…  (batch root, ready for Arweave + chain)\n`);

// 6. Anyone verifies it — no VeriTrace account, no trust in us.
const good = verifyRecord(record);
line(`  $ veritrace-verify receipt.json`);
line(`  ${good.ok ? "✅ VERIFIED" : "❌ FAILED"} — signature ${good.checks.signature ? "ok" : "bad"}, anchored ${good.checks.anchored ? "ok" : "no"}\n`);

// 6. Now imagine someone edits the record to hide what happened.
const tampered = JSON.parse(JSON.stringify(record));
tampered.receipt.outputHash = "0".repeat(64); // pretend the refund was denied
const tamperedPath = new URL("./out/receipt.tampered.json", import.meta.url);
writeFileSync(tamperedPath, JSON.stringify(tampered, null, 2));

const bad = verifyRecord(tampered);
line(`  Someone alters the receipt to hide the approval…`);
line(`  $ veritrace-verify receipt.tampered.json`);
line(`  ${bad.ok ? "✅ VERIFIED" : "❌ FAILED"} — signature ${bad.checks.signature ? "ok" : "bad"}`);
line(`  → Tampering is mathematically detectable. The record can't be quietly rewritten.\n`);

line("── That's VeriTrace: a verifiable receipt for every AI decision. ────\n");

process.exit(bad.ok ? 1 : 0); // demo only "succeeds" if tampering was caught
