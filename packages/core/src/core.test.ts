import { describe, it, expect } from "vitest";
import {
  canonicalize,
  sha256Hex,
  generateKeypair,
  ed25519PublicKey,
  signReceipt,
  verifyReceipt,
  buildMerkleRoot,
  getMerkleProof,
  verifyMerkleProof,
  receiptLeaf,
  recordLeaf,
  signVerdict,
  verifyVerdict,
  type Receipt,
} from "./index.js";

const sampleReceipt = (): Receipt => ({
  agent: "support-bot",
  traceId: "trace-1",
  action: "refund.approve",
  model: "gpt-4o",
  modelVersion: "gpt-4o-2026-05-01",
  inputHash: sha256Hex("order #123, amount $40"),
  outputHash: sha256Hex("approved"),
  createdAt: "2026-06-24T00:00:00.000Z",
});

describe("canonicalize", () => {
  it("produces identical output regardless of key order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("is stable across nested objects", () => {
    const a = canonicalize({ x: { p: 1, q: 2 }, y: [3, 1] });
    const b = canonicalize({ y: [3, 1], x: { q: 2, p: 1 } });
    expect(a).toBe(b);
  });
});

describe("sha256Hex", () => {
  it("is deterministic", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
  });

  it("changes when input changes by one byte", () => {
    expect(sha256Hex("hello")).not.toBe(sha256Hex("hellp"));
  });

  it("returns a 64-char hex string", () => {
    expect(sha256Hex("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("receipt signing", () => {
  it("verifies a genuine signed receipt", () => {
    const { privateKey, publicKey } = generateKeypair();
    const receipt = sampleReceipt();
    const sig = signReceipt(receipt, privateKey);
    expect(verifyReceipt(receipt, sig, publicKey)).toBe(true);
  });

  it("rejects a receipt tampered after signing", () => {
    const { privateKey, publicKey } = generateKeypair();
    const receipt = sampleReceipt();
    const sig = signReceipt(receipt, privateKey);
    const tampered = { ...receipt, outputHash: sha256Hex("denied") };
    expect(verifyReceipt(tampered, sig, publicKey)).toBe(false);
  });

  it("derives the same public key from a private key as generateKeypair", () => {
    const { privateKey, publicKey } = generateKeypair();
    expect(ed25519PublicKey(privateKey)).toBe(publicKey);
  });

  it("rejects a valid signature from the wrong key", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    const receipt = sampleReceipt();
    const sig = signReceipt(receipt, a.privateKey);
    expect(verifyReceipt(receipt, sig, b.publicKey)).toBe(false);
  });

  it("is independent of key order in the receipt object", () => {
    const { privateKey, publicKey } = generateKeypair();
    const receipt = sampleReceipt();
    const sig = signReceipt(receipt, privateKey);
    const reordered = {
      createdAt: receipt.createdAt,
      action: receipt.action,
      agent: receipt.agent,
      outputHash: receipt.outputHash,
      inputHash: receipt.inputHash,
      model: receipt.model,
      modelVersion: receipt.modelVersion,
      traceId: receipt.traceId,
    } as Receipt;
    expect(verifyReceipt(reordered, sig, publicKey)).toBe(true);
  });
});

describe("receiptLeaf", () => {
  it("is deterministic and order-independent for the same receipt", () => {
    const r = sampleReceipt();
    const reordered = {
      createdAt: r.createdAt,
      action: r.action,
      agent: r.agent,
      outputHash: r.outputHash,
      inputHash: r.inputHash,
      model: r.model,
      modelVersion: r.modelVersion,
      traceId: r.traceId,
    } as Receipt;
    expect(receiptLeaf(r)).toBe(receiptLeaf(reordered));
  });

  it("changes when any receipt field changes", () => {
    const r = sampleReceipt();
    expect(receiptLeaf(r)).not.toBe(receiptLeaf({ ...r, outputHash: sha256Hex("x") }));
  });
});

describe("merkle proofs", () => {
  const leaves = ["a", "b", "c", "d", "e"].map(sha256Hex);

  it("produces a stable root for the same leaves", () => {
    expect(buildMerkleRoot(leaves)).toBe(buildMerkleRoot([...leaves]));
  });

  it("verifies an inclusion proof for every leaf", () => {
    const root = buildMerkleRoot(leaves);
    leaves.forEach((leaf, i) => {
      const proof = getMerkleProof(leaves, i);
      expect(verifyMerkleProof(leaf, proof, root)).toBe(true);
    });
  });

  it("rejects a proof for a leaf that is not in the tree", () => {
    const root = buildMerkleRoot(leaves);
    const proof = getMerkleProof(leaves, 0);
    expect(verifyMerkleProof(sha256Hex("z"), proof, root)).toBe(false);
  });

  it("rejects a proof against the wrong root", () => {
    const proof = getMerkleProof(leaves, 2);
    const wrongRoot = buildMerkleRoot([...leaves, sha256Hex("f")]);
    expect(verifyMerkleProof(leaves[2], proof, wrongRoot)).toBe(false);
  });

  it("handles a single-leaf tree", () => {
    const one = [sha256Hex("solo")];
    const root = buildMerkleRoot(one);
    expect(verifyMerkleProof(one[0], getMerkleProof(one, 0), root)).toBe(true);
  });
});

describe("signed verdicts", () => {
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
  const verdict: EvalVerdict = { assessment: "incorrect", confidence: 0.94, judge: "qwen2.5-7b-judge" };

  it("verifies a verdict signed by the judge key", () => {
    const { privateKey, publicKey } = generateKeypair();
    const sig = signVerdict(receipt, verdict, privateKey);
    expect(verifyVerdict(receipt, verdict, sig, publicKey)).toBe(true);
  });

  it("rejects a verdict that was flipped from incorrect to correct", () => {
    const { privateKey, publicKey } = generateKeypair();
    const sig = signVerdict(receipt, verdict, privateKey);
    const flipped: EvalVerdict = { ...verdict, assessment: "correct" };
    expect(verifyVerdict(receipt, flipped, sig, publicKey)).toBe(false);
  });

  it("rejects a verdict whose confidence was nudged", () => {
    const { privateKey, publicKey } = generateKeypair();
    const sig = signVerdict(receipt, verdict, privateKey);
    expect(verifyVerdict(receipt, { ...verdict, confidence: 0.99 }, sig, publicKey)).toBe(false);
  });

  it("rejects a verdict replayed onto a different receipt", () => {
    const { privateKey, publicKey } = generateKeypair();
    const sig = signVerdict(receipt, verdict, privateKey);
    const other: Receipt = { ...receipt, outputHash: sha256Hex("denied") };
    expect(verifyVerdict(other, verdict, sig, publicKey)).toBe(false);
  });

  it("rejects a verdict signed by a different judge key", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    const sig = signVerdict(receipt, verdict, a.privateKey);
    expect(verifyVerdict(receipt, verdict, sig, b.publicKey)).toBe(false);
  });
});

describe("recordLeaf", () => {
  const receipt: Receipt = {
    agent: "support-bot",
    traceId: "t1",
    action: "refund.approve",
    model: "gpt-4o",
    modelVersion: "gpt-4o-2026-05-01",
    inputHash: sha256Hex("in"),
    outputHash: sha256Hex("out"),
    createdAt: "2026-06-24T00:00:00.000Z",
  };

  it("equals receiptLeaf when there is no verdict (existing roots unaffected)", () => {
    expect(recordLeaf({ receipt, signature: "s", publicKey: "p" })).toBe(receiptLeaf(receipt));
  });

  it("changes when the verdict changes, so a tampered verdict breaks inclusion", () => {
    const base = {
      receipt,
      signature: "s",
      publicKey: "p",
      verdict: { assessment: "incorrect", confidence: 0.9, judge: "j" } as EvalVerdict,
    };
    const flipped = { ...base, verdict: { ...base.verdict, assessment: "correct" } as EvalVerdict };
    expect(recordLeaf(base)).not.toBe(recordLeaf(flipped));
  });
});
