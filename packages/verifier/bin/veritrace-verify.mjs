#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { verifyRecord } from "../src/index.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: veritrace-verify <receipt.json>");
  process.exit(2);
}

let record;
try {
  record = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`✗ could not read/parse ${path}: ${e.message}`);
  process.exit(2);
}

const result = verifyRecord(record);
const mark = (b) => (b ? "✅" : "❌");

console.log("");
console.log(`  VeriTrace receipt verification — ${path}`);
console.log(`  ${mark(result.checks.signature)} signature  (Ed25519, tamper-proof)`);
console.log(
  `  ${result.checks.anchored ? "✅" : "⚪"} anchored   ${
    result.checks.anchored ? "(Arweave + on-chain root)" : "(not yet anchored)"
  }`,
);
if (record?.receipt) {
  const r = record.receipt;
  console.log("");
  console.log(`     agent:  ${r.agent}`);
  console.log(`     action: ${r.action}`);
  console.log(`     model:  ${r.model} @ ${r.modelVersion}`);
}
console.log("");
console.log(
  result.ok
    ? "  ✅ VERIFIED — this is exactly what the AI did. No trust in VeriTrace required."
    : `  ❌ FAILED — ${result.error ?? "signature does not match. This receipt was altered."}`,
);
console.log("");

process.exit(result.ok ? 0 : 1);
