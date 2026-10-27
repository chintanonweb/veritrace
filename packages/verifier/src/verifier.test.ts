import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  signReceipt,
  sha256Hex,
  buildMerkleRoot,
  getMerkleProof,
  recordLeaf,
  signVerdict,
  type Receipt,
  type ReceiptRecord,
} from "@veritrace/core";
import { verifyRecord, type VerificationResult } from "./index.js";

/** Anchor a record against a one-leaf Merkle root, the way @veritrace/anchor does. */
function anchor(rec: ReturnType<typeof signedRecord>): ReceiptRecord {
  const leaves = [recordLeaf(rec)];
  return {
    ...rec,
    anchor: { merkleRoot: buildMerkleRoot(leaves), merkleProof: getMerkleProof(leaves, 0), leafIndex: 0 },
  };
}

function signedRecord() {
  const { privateKey, publicKey } = generateKeypair();
  const receipt: Receipt = {
    agent: "support-bot",
    traceId: "t1",
    action: "refund.approve",
    model: "gpt-4o",
    modelVersion: "gpt-4o-2026-05-01",
    inputHash: sha256Hex("order #123"),
    outputHash: sha256Hex("approved"),
    createdAt: "2026-06-24T00:00:00.000Z",
  };
  const signature = signReceipt(receipt, privateKey);
  return { receipt, signature, publicKey };
}

describe("verifyRecord", () => {
  it("accepts a genuine signed record", () => {
    const result: VerificationResult = verifyRecord(signedRecord());
    expect(result.ok).toBe(true);
    expect(result.checks.signature).toBe(true);
  });

  it("rejects a record whose receipt was tampered after signing", () => {
    const rec = signedRecord();
    rec.receipt.outputHash = sha256Hex("denied");
    const result = verifyRecord(rec);
    expect(result.ok).toBe(false);
    expect(result.checks.signature).toBe(false);
  });

  it("rejects a record whose signature was swapped for another", () => {
    const a = signedRecord();
    const b = signedRecord();
    const result = verifyRecord({ ...a, signature: b.signature });
    expect(result.ok).toBe(false);
  });

  it("reports a structural error for a malformed record", () => {
    const result = verifyRecord({ nonsense: true } as unknown as Parameters<typeof verifyRecord>[0]);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("reports anchoring as not-yet-anchored when no anchor is present", () => {
    const result = verifyRecord(signedRecord());
    expect(result.checks.anchored).toBe(false);
  });

  it("accepts an anchored record with a valid Merkle inclusion proof", () => {
    const result = verifyRecord(anchor(signedRecord()));
    expect(result.ok).toBe(true);
    expect(result.checks.anchored).toBe(true);
  });

  it("rejects an anchored record whose receipt was altered after anchoring", () => {
    const anchored = anchor(signedRecord());
    anchored.receipt.outputHash = sha256Hex("denied");
    const result = verifyRecord(anchored);
    expect(result.ok).toBe(false);
    expect(result.checks.anchored).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects an anchored record pointing at the wrong root", () => {
    const anchored = anchor(signedRecord());
    anchored.anchor!.merkleRoot = sha256Hex("some other batch");
    const result = verifyRecord(anchored);
    expect(result.ok).toBe(false);
    expect(result.checks.anchored).toBe(false);
  });
});

describe("verifyRecord — signed verdicts", () => {
  const judge = generateKeypair();

  function recordWithVerdict(assessment: "correct" | "incorrect" = "incorrect") {
    const rec = signedRecord();
    const verdict = { assessment, confidence: 0.93, judge: "qwen2.5-7b-judge" } as const;
    return {
      ...rec,
      verdict,
      verdictSignature: signVerdict(rec.receipt, verdict, judge.privateKey),
      verdictPublicKey: judge.publicKey,
    };
  }

  it("accepts a record whose verdict signature checks out", () => {
    const result = verifyRecord(recordWithVerdict());
    expect(result.checks.verdict).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("rejects a record whose verdict was flipped after the fact", () => {
    const rec = recordWithVerdict("incorrect");
    const flipped = { ...rec, verdict: { ...rec.verdict, assessment: "correct" as const } };
    const result = verifyRecord(flipped);
    expect(result.checks.verdict).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("verdict signature");
  });

  it("rejects a record carrying a verdict with no signature at all", () => {
    const rec = recordWithVerdict();
    const { verdictSignature, verdictPublicKey, ...unsigned } = rec;
    const result = verifyRecord(unsigned as ReceiptRecord);
    expect(result.checks.verdict).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("reports verdict: null when there is simply no verdict", () => {
    const result = verifyRecord(anchored_signed());
    expect(result.checks.verdict).toBeNull();
  });
});

function anchored_signed() {
  const rec = signedRecord();
  const leaves = [recordLeaf(rec)];
  return {
    ...rec,
    anchor: { merkleRoot: buildMerkleRoot(leaves), merkleProof: getMerkleProof(leaves, 0), leafIndex: 0 },
  };
}
