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
import { signVerdict, ed25519PublicKey } from "../packages/core/src/index.ts";

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

// 5. Judge it. The judge is a SEPARATE identity from the agent and signs its own
//    verdict over the receipt, so a verdict can't be swapped for a friendlier one.
//    (In production this is an LLM on Nosana; the shape is identical.)
const judgeKey = generateKeypair();
const verdict = { assessment: "correct", confidence: 0.97, judge: "llm-judge-v1" };
const judged = {
  ...signed,
  verdict,
  verdictSignature: signVerdict(signed.receipt, verdict, judgeKey.privateKey),
  verdictPublicKey: ed25519PublicKey(judgeKey.privateKey),
};

// 6. Anchor it: Merkle-batch and publish the root. The leaf folds in the verdict,
//    so the anchored root commits to the judgment as well as the action.
const [record] = await anchorBatch([judged], new LocalAnchorBackend());

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const genuinePath = new URL("./out/receipt.json", import.meta.url);
writeFileSync(genuinePath, JSON.stringify(record, null, 2));
line(`  Signed + anchored receipt written → examples/out/receipt.json`);
line(`  signature:   ${record.signature.slice(0, 32)}…  (Ed25519 over the whole receipt)`);
line(`  merkleRoot:  ${record.anchor.merkleRoot.slice(0, 32)}…  (batch root, ready for Arweave + chain)\n`);

// 7. Anyone verifies it — no VeriTrace account, no trust in us.
const good = verifyRecord(record);
line(`  $ veritrace-verify receipt.json`);
line(`  ${good.ok ? "✅ VERIFIED" : "❌ FAILED"} — signature ${good.checks.signature ? "ok" : "bad"}, anchored ${good.checks.anchored ? "ok" : "no"}\n`);

// 8. Now imagine someone edits the receipt to hide what happened.
const tampered = JSON.parse(JSON.stringify(record));
tampered.receipt.outputHash = "0".repeat(64); // pretend the refund was denied
const tamperedPath = new URL("./out/receipt.tampered.json", import.meta.url);
writeFileSync(tamperedPath, JSON.stringify(tampered, null, 2));

const bad = verifyRecord(tampered);
line(`  Someone alters the receipt to hide the approval…`);
line(`  $ veritrace-verify receipt.tampered.json`);
line(`  ${bad.ok ? "✅ VERIFIED" : "❌ FAILED"} — signature ${bad.checks.signature ? "ok" : "bad"}`);
line(`  → Tampering is mathematically detectable. The record can't be quietly rewritten.\n`);

// 9. And now the interesting one: flip the verdict from `correct` to `incorrect`.
//    The receipt signature is untouched and the Merkle root still matches, so a
//    naive design would let this through. The judge's own signature catches it.
const flipped = JSON.parse(JSON.stringify(record));
flipped.verdict.assessment = "incorrect";
const flippedResult = verifyRecord(flipped);
line(`  Someone flips the verdict from "correct" to "incorrect"…`);
line(`  ${flippedResult.ok ? "✅ VERIFIED" : "❌ FAILED"} — verdict ${
  flippedResult.checks.verdict === false ? "signature invalid" : "ok"
}`);
line(`  → The judgment is signed separately, so it can't be rewritten either.\n`);

line("── That's VeriTrace: a verifiable receipt for every AI decision. ────\n");

process.exit(bad.ok || flippedResult.ok ? 1 : 0); // succeeds only if BOTH tampers were caught
