import { VeriTrace, generateKeypair } from "@veritrace/sdk";
import { anchorBatch, LocalAnchorBackend } from "@veritrace/anchor";
import { sha256Hex, type EvalVerdict, type ReceiptRecord } from "@veritrace/core";
import { ReceiptStore } from "./store";

/**
 * Seeds an in-memory store with real, signed + anchored receipts across several
 * agents — each with an automated eval verdict — so the ledger and the Verified
 * AI Score leaderboard have substantial, genuine data. Includes one deliberately
 * ALTERED receipt to demonstrate that tampering is detectable. Cached on
 * globalThis so it survives dev hot-reloads and is shared across route modules.
 */
interface AgentSpec {
  agent: string;
  action: string;
  model: string;
  modelVersion: string;
  count: number;
  /** every Nth receipt gets an "incorrect" verdict (0 = always correct) */
  incorrectEvery: number;
}

const SPECS: AgentSpec[] = [
  { agent: "support-bot", action: "refund.approve", model: "gpt-4o", modelVersion: "gpt-4o-2026-05-01", count: 48, incorrectEvery: 14 },
  { agent: "trade-exec", action: "trade.execute", model: "claude-opus-4-8", modelVersion: "claude-opus-4-8-2026-05", count: 33, incorrectEvery: 0 },
  { agent: "deploy-bot", action: "code.deploy", model: "claude-opus-4-8", modelVersion: "claude-opus-4-8-2026-05", count: 21, incorrectEvery: 6 },
  { agent: "kyc-agent", action: "identity.verify", model: "gpt-4o", modelVersion: "gpt-4o-2026-05-01", count: 12, incorrectEvery: 4 },
];

function verdictFor(i: number, incorrectEvery: number): EvalVerdict {
  const incorrect = incorrectEvery > 0 && i % incorrectEvery === incorrectEvery - 1;
  return {
    assessment: incorrect ? "incorrect" : "correct",
    confidence: incorrect ? 0.72 + (i % 5) * 0.02 : 0.93 + (i % 6) * 0.01,
    judge: "llm-judge-v1",
  };
}

async function build(): Promise<ReceiptStore> {
  const store = new ReceiptStore();
  const signed: ReceiptRecord[] = [];

  for (const spec of SPECS) {
    const { privateKey } = generateKeypair();
    const vt = new VeriTrace({ privateKey, agent: spec.agent, now: () => "2026-06-24T09:31:00.000Z" });
    const run = vt.wrap(async (i: number) => ({ ok: true, seq: i }), {
      action: spec.action,
      model: spec.model,
      modelVersion: spec.modelVersion,
      traceId: `${spec.agent}-run`,
    });
    for (let i = 0; i < spec.count; i++) await run(i);
    vt.drain().forEach((r, i) => signed.push({ ...r, verdict: verdictFor(i, spec.incorrectEvery) }));
  }

  const anchored = await anchorBatch(signed, new LocalAnchorBackend());
  anchored.forEach((r) => store.add(r, "2026-06-24T09:31:04.000Z"));

  // One ALTERED receipt: clone a genuine one and rewrite the output. Its
  // signature no longer matches — verification will fail loudly.
  const tampered: ReceiptRecord = JSON.parse(JSON.stringify(anchored[0]));
  tampered.receipt.outputHash = sha256Hex("DENIED — quietly changed after the fact");
  store.add(tampered, "2026-06-24T09:34:30.000Z");

  return store;
}

const g = globalThis as unknown as { __veritraceStore?: Promise<ReceiptStore> };

export function getStore(): Promise<ReceiptStore> {
  if (!g.__veritraceStore) g.__veritraceStore = build();
  return g.__veritraceStore;
}
