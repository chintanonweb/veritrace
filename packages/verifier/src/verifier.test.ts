import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  signReceipt,
  sha256Hex,
  buildMerkleRoot,
  getMerkleProof,
  receiptLeaf,
  type Receipt,
  type ReceiptRecord,
} from "@veritrace/core";
import { verifyRecord, type VerificationResult } from "./index.js";

/** Anchor a record against a one-leaf Merkle root, the way @veritrace/anchor does. */
function anchor(rec: ReturnType<typeof signedRecord>): ReceiptRecord {
  const leaves = [receiptLeaf(rec.receipt)];
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
