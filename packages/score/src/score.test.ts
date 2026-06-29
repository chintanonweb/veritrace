import { describe, it, expect } from "vitest";
import type { ReceiptRecord, EvalVerdict, Receipt } from "@veritrace/core";
import { computeLeaderboard, scoreForAgent } from "./index.js";

let n = 0;
function rec(
  agent: string,
  opts: { verified?: boolean; verdict?: EvalVerdict; action?: string } = {},
): ReceiptRecord {
  const receipt: Receipt = {
    agent,
    traceId: `t${n++}`,
    action: opts.action ?? "refund.approve",
    model: "gpt-4o",
    modelVersion: "v1",
    inputHash: "00",
    outputHash: "00",
    createdAt: "2026-06-24T00:00:00.000Z",
  };
  // signature/publicKey are placeholders; verification is injected via isVerified.
  return { receipt, signature: opts.verified === false ? "bad" : "ok", publicKey: "pk", ...(opts.verdict ? { verdict: opts.verdict } : {}) };
}

// Test predicate: a record is "verified" unless its signature is the string "bad".
const isVerified = (r: ReceiptRecord) => r.signature !== "bad";

const V = (a: EvalVerdict["assessment"], confidence: number): EvalVerdict => ({
  assessment: a,
  confidence,
  judge: "llm-judge-v1",
});

describe("scoreForAgent", () => {
  it("counts verified vs total actions and computes integrity", () => {
    const s = scoreForAgent(
      "bot",
      [rec("bot"), rec("bot"), rec("bot", { verified: false })],
      isVerified,
    );
    expect(s.totalActions).toBe(3);
    expect(s.verifiedActions).toBe(2);
    expect(s.integrity).toBeCloseTo(2 / 3);
  });

  it("computes success rate and avg confidence from eval verdicts", () => {
    const s = scoreForAgent(
      "bot",
      [
        rec("bot", { verdict: V("correct", 0.9) }),
        rec("bot", { verdict: V("correct", 0.8) }),
        rec("bot", { verdict: V("incorrect", 0.7) }),
      ],
      isVerified,
    );
    expect(s.evaluated).toBe(3);
    expect(s.correct).toBe(2);
    expect(s.successRate).toBeCloseTo(2 / 3);
    expect(s.avgConfidence).toBeCloseTo((0.9 + 0.8 + 0.7) / 3);
  });

  it("returns null success metrics when nothing was evaluated", () => {
    const s = scoreForAgent("bot", [rec("bot"), rec("bot")], isVerified);
    expect(s.evaluated).toBe(0);
    expect(s.successRate).toBeNull();
    expect(s.avgConfidence).toBeNull();
  });

  it("breaks actions down by type", () => {
    const s = scoreForAgent(
      "bot",
      [rec("bot", { action: "refund.approve" }), rec("bot", { action: "trade.execute" }), rec("bot", { action: "refund.approve" })],
      isVerified,
    );
    expect(s.byAction).toEqual({ "refund.approve": 2, "trade.execute": 1 });
  });

  it("excludes unverified (tampered) receipts from success accounting", () => {
    const s = scoreForAgent(
      "bot",
      [rec("bot", { verdict: V("correct", 0.9) }), rec("bot", { verified: false, verdict: V("correct", 0.99) })],
      isVerified,
    );
    // the tampered receipt's verdict is not trusted
    expect(s.evaluated).toBe(1);
    expect(s.correct).toBe(1);
  });
});

describe("computeLeaderboard", () => {
  it("groups records by agent", () => {
    const board = computeLeaderboard([rec("a"), rec("b"), rec("a")], isVerified);
    expect(board).toHaveLength(2);
    expect(board.map((s) => s.agent).sort()).toEqual(["a", "b"]);
  });

  it("ranks by verified actions descending", () => {
    const board = computeLeaderboard([rec("a"), rec("a"), rec("a"), rec("b")], isVerified);
    expect(board[0].agent).toBe("a");
    expect(board[0].verifiedActions).toBe(3);
  });

  it("returns an empty board for no records", () => {
    expect(computeLeaderboard([], isVerified)).toEqual([]);
  });
});
