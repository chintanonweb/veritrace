import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  signReceipt,
  sha256Hex,
  verifyMerkleProof,
  receiptLeaf,
  type Receipt,
  type ReceiptRecord,
} from "@veritrace/core";
import { anchorBatch, LocalAnchorBackend, type AnchorBackend } from "./index.js";

function record(i: number): ReceiptRecord {
  const { privateKey, publicKey } = generateKeypair();
  const receipt: Receipt = {
    agent: "support-bot",
    traceId: `t${i}`,
    action: "refund.approve",
    model: "gpt-4o",
    modelVersion: "gpt-4o-2026-05-01",
    inputHash: sha256Hex(`order ${i}`),
    outputHash: sha256Hex(`approved ${i}`),
    createdAt: "2026-06-24T00:00:00.000Z",
  };
  return { receipt, signature: signReceipt(receipt, privateKey), publicKey };
}

const local = new LocalAnchorBackend();

describe("anchorBatch", () => {
  it("returns one anchored record per input", async () => {
    const out = await anchorBatch([record(1), record(2), record(3)], local);
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.anchor !== undefined)).toBe(true);
  });

  it("gives every record in the batch the same Merkle root", async () => {
    const out = await anchorBatch([record(1), record(2), record(3)], local);
    const roots = new Set(out.map((r) => r.anchor!.merkleRoot));
    expect(roots.size).toBe(1);
  });

  it("produces a valid inclusion proof for every anchored receipt", async () => {
    const out = await anchorBatch([record(1), record(2), record(3), record(4)], local);
    for (const r of out) {
      const ok = verifyMerkleProof(receiptLeaf(r.receipt), r.anchor!.merkleProof, r.anchor!.merkleRoot);
      expect(ok).toBe(true);
    }
  });

  it("breaks the inclusion proof if a receipt is altered after anchoring", async () => {
    const [r] = await anchorBatch([record(1), record(2)], local);
    const tampered = { ...r.receipt, outputHash: sha256Hex("denied") };
    expect(verifyMerkleProof(receiptLeaf(tampered), r.anchor!.merkleProof, r.anchor!.merkleRoot)).toBe(false);
  });

  it("records which backend published the root", async () => {
    const out = await anchorBatch([record(1)], local);
    expect(out[0].anchor!.backend).toBe("local");
  });

  it("attaches backend references (e.g. tx ids) to every record", async () => {
    const fake: AnchorBackend = {
      name: "fake-chain",
      async publish(root) {
        return { backend: "fake-chain", arweaveTxId: `ar-${root.slice(0, 6)}`, chainTxHash: `0x${root.slice(0, 6)}` };
      },
    };
    const out = await anchorBatch([record(1), record(2)], fake);
    expect(out[0].anchor!.arweaveTxId).toBe(out[1].anchor!.arweaveTxId);
    expect(out[0].anchor!.chainTxHash).toMatch(/^0x/);
  });

  it("throws on an empty batch", async () => {
    await expect(anchorBatch([], local)).rejects.toThrow();
  });
});
