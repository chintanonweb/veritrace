import { describe, it, expect, beforeEach } from "vitest";
import {
  verifyReceipt,
  sha256Hex,
  canonicalize,
  generateKeypair,
} from "@veritrace/core";
import { VeriTrace, type ReceiptRecord } from "./index.js";

const FIXED_NOW = "2026-06-24T00:00:00.000Z";

function makeClient() {
  const { privateKey } = generateKeypair();
  const emitted: ReceiptRecord[] = [];
  const vt = new VeriTrace({
    privateKey,
    agent: "support-bot",
    now: () => FIXED_NOW,
    sink: (record) => {
      emitted.push(record);
    },
  });
  return { vt, emitted };
}

describe("VeriTrace.wrap", () => {
  let vt: VeriTrace;
  let emitted: ReceiptRecord[];

  beforeEach(() => {
    ({ vt, emitted } = makeClient());
  });

  it("returns the wrapped function's result unchanged", async () => {
    const wrapped = vt.wrap(async (order: { id: number }) => `approved:${order.id}`, {
      action: "refund.approve",
      model: "gpt-4o",
      modelVersion: "gpt-4o-2026-05-01",
      traceId: "t1",
    });
    expect(await wrapped({ id: 123 })).toBe("approved:123");
  });

  it("emits exactly one receipt per call", async () => {
    const wrapped = vt.wrap(async () => "ok", {
      action: "a",
      model: "m",
      modelVersion: "v",
      traceId: "t1",
    });
    await wrapped();
    await wrapped();
    expect(emitted).toHaveLength(2);
  });

  it("emits a receipt that verifies against the client public key", async () => {
    const wrapped = vt.wrap(async (x: number) => x * 2, {
      action: "double",
      model: "m",
      modelVersion: "v",
      traceId: "t1",
    });
    await wrapped(21);
    const { receipt, signature, publicKey } = emitted[0];
    expect(publicKey).toBe(vt.publicKey);
    expect(verifyReceipt(receipt, signature, publicKey)).toBe(true);
  });

  it("hashes the inputs and outputs into the receipt", async () => {
    const wrapped = vt.wrap(async (a: number, b: number) => a + b, {
      action: "add",
      model: "m",
      modelVersion: "v",
      traceId: "t1",
    });
    await wrapped(2, 3);
    const { receipt } = emitted[0];
    expect(receipt.inputHash).toBe(sha256Hex(canonicalize([2, 3])));
    expect(receipt.outputHash).toBe(sha256Hex(canonicalize(5)));
  });

  it("populates receipt metadata from the client and call", async () => {
    const wrapped = vt.wrap(async () => "ok", {
      action: "refund.approve",
      model: "gpt-4o",
      modelVersion: "gpt-4o-2026-05-01",
      traceId: "trace-xyz",
    });
    await wrapped();
    const { receipt } = emitted[0];
    expect(receipt).toMatchObject({
      agent: "support-bot",
      action: "refund.approve",
      model: "gpt-4o",
      modelVersion: "gpt-4o-2026-05-01",
      traceId: "trace-xyz",
      createdAt: FIXED_NOW,
    });
  });

  it("a tampered emitted receipt no longer verifies", async () => {
    const wrapped = vt.wrap(async () => "approved", {
      action: "refund.approve",
      model: "m",
      modelVersion: "v",
      traceId: "t1",
    });
    await wrapped();
    const { receipt, signature, publicKey } = emitted[0];
    const tampered = { ...receipt, outputHash: sha256Hex("denied") };
    expect(verifyReceipt(tampered, signature, publicKey)).toBe(false);
  });

  it("propagates errors and does not emit a success receipt on throw", async () => {
    const wrapped = vt.wrap(
      async () => {
        throw new Error("boom");
      },
      { action: "a", model: "m", modelVersion: "v", traceId: "t1" },
    );
    await expect(wrapped()).rejects.toThrow("boom");
    expect(emitted).toHaveLength(0);
  });

  it("generates a traceId when none is provided", async () => {
    const wrapped = vt.wrap(async () => "ok", {
      action: "a",
      model: "m",
      modelVersion: "v",
    });
    await wrapped();
    expect(emitted[0].receipt.traceId).toMatch(/.+/);
  });
});
