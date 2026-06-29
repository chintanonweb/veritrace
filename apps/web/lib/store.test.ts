import { describe, it, expect } from "vitest";
import { generateKeypair, signReceipt, sha256Hex, type Receipt, type ReceiptRecord } from "@veritrace/core";
import { receiptId, ReceiptStore } from "./store.js";

function rec(action = "refund.approve"): ReceiptRecord {
  const { privateKey, publicKey } = generateKeypair();
  const receipt: Receipt = {
    agent: "support-bot",
    traceId: "t1",
    action,
    model: "gpt-4o",
    modelVersion: "gpt-4o-2026-05-01",
    inputHash: sha256Hex("in"),
    outputHash: sha256Hex("out"),
    createdAt: "2026-06-24T00:00:00.000Z",
  };
  return { receipt, signature: signReceipt(receipt, privateKey), publicKey };
}

describe("receiptId", () => {
  it("is deterministic for the same record", () => {
    const r = rec();
    expect(receiptId(r)).toBe(receiptId(r));
  });

  it("differs for different records", () => {
    expect(receiptId(rec("a"))).not.toBe(receiptId(rec("b")));
  });

  it("is content-addressed: editing the receipt changes the id", () => {
    const r = rec();
    const id1 = receiptId(r);
    const id2 = receiptId({ ...r, receipt: { ...r.receipt, outputHash: sha256Hex("denied") } });
    expect(id1).not.toBe(id2);
  });

  it("has the rcpt_ prefix", () => {
    expect(receiptId(rec())).toMatch(/^rcpt_[0-9a-f]+$/);
  });
});

describe("ReceiptStore", () => {
  it("stores and retrieves a record by its id", () => {
    const store = new ReceiptStore();
    const r = rec();
    const id = store.add(r);
    expect(store.get(id)).toEqual(r);
  });

  it("returns undefined for an unknown id", () => {
    expect(new ReceiptStore().get("rcpt_nope")).toBeUndefined();
  });

  it("lists records most-recent-first", () => {
    const store = new ReceiptStore();
    const a = rec("a");
    const b = rec("b");
    store.add(a);
    store.add(b);
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0].record.receipt.action).toBe("b");
  });

  it("is idempotent: adding the same record twice yields one entry", () => {
    const store = new ReceiptStore();
    const r = rec();
    const id1 = store.add(r);
    const id2 = store.add(r);
    expect(id1).toBe(id2);
    expect(store.list()).toHaveLength(1);
  });
});
