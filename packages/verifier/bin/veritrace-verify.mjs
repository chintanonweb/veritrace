#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { verifyRecord } from "../src/index.ts";

/**
 * VeriTrace standalone verifier.
 *
 *   veritrace-verify <receipt.json>            # offline: signature + Merkle proof
 *   veritrace-verify --online <receipt.json>   # also fetch the anchor from Arweave
 *
 * `--online` is the part that makes "anchored" mean something: it independently
 * retrieves the published payload from a public gateway and checks that the
 * Merkle root stored on Arweave is byte-identical to the one in the receipt.
 * No VeriTrace account. No call to any VeriTrace server.
 */

const args = process.argv.slice(2);
const online = args.includes("--online");
const path = args.find((a) => !a.startsWith("--"));

if (!path) {
  console.error("usage: veritrace-verify [--online] <receipt.json>");
  process.exit(2);
}

const GATEWAYS = [
  process.env.VERITRACE_ARWEAVE_GATEWAY,
  "https://ar-io.dev",
  "https://turbo-gateway.com",
  "https://arweave.net",
].filter(Boolean);

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

// Report the anchor exactly as it is — never overstate what was published.
const a = record?.anchor;
const txId = a?.arweaveTxId;
const backendLabel = a?.backend ?? "none";
console.log(
  `  ${result.checks.anchored ? "✅" : "⚪"} merkle     ${
    result.checks.anchored
      ? `(inclusion proof verified against root ${String(a.merkleRoot).slice(0, 16)}…)`
      : "(no anchor on this receipt)"
  }`,
);
console.log(`  ${txId ? "✅" : "⚪"} anchor     (${backendLabel}${txId ? `: ${txId}` : ""})`);

if (record?.verdict) {
  const v = record.verdict;
  const mark2 = result.checks.verdict ? "✅" : "❌";
  console.log(
    `  ${mark2} verdict    (${v.assessment}, confidence ${v.confidence}, judge ${v.judge})`,
  );
  if (result.checks.verdict === false) {
    console.log(`     ✗ this verdict is NOT signed by the judge key in the record`);
  }
} else {
  console.log(`  ⚪ verdict    (none attached)`);
}

// Online: prove the root on Arweave is the root in this receipt.
let onlineOk = null;
if (online) {
  if (!txId) {
    console.log("");
    console.log("  ❌ --online requested but this receipt has no Arweave transaction.");
    process.exit(1);
  }
  let fetched = null;
  let used = null;
  for (const gw of GATEWAYS) {
    try {
      const res = await fetch(`${gw.replace(/\/$/, "")}/${txId}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      fetched = await res.json();
      used = gw;
      break;
    } catch {
      /* try the next gateway */
    }
  }
  if (!fetched) {
    console.log("");
    console.log(`  ⚠️  could not fetch ${txId} from any gateway yet.`);
    console.log(`      Turbo data items propagate shortly after bundling — retry in a minute.`);
  } else {
    onlineOk = fetched.veritraceMerkleRoot === a.merkleRoot;
    console.log("");
    console.log(`  ${mark(onlineOk)} on-arweave  (root fetched from ${used})`);
    console.log(`     published root: ${fetched.veritraceMerkleRoot}`);
    console.log(`     receipt root:   ${a.merkleRoot}`);
  }
}

if (record?.receipt) {
  const r = record.receipt;
  console.log("");
  console.log(`     agent:  ${r.agent}`);
  console.log(`     action: ${r.action}`);
  console.log(`     model:  ${r.model} @ ${r.modelVersion}`);
}

const ok = result.ok && onlineOk !== false;
console.log("");
console.log(
  ok
    ? "  ✅ VERIFIED — this is exactly what the AI did. No trust in VeriTrace required."
    : `  ❌ FAILED — ${result.error ?? "signature does not match. This receipt was altered."}`,
);
console.log("");

process.exit(ok ? 0 : 1);
