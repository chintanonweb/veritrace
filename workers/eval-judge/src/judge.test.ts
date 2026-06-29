import { describe, it, expect } from "vitest";
import { evaluateDecision, type Decision } from "./judge.js";

const decision: Decision = {
  action: "refund.approve",
  model: "gpt-4o",
  input: { orderId: 5500, amountUSD: 5000, policyMaxUSD: 2000 },
  output: { decision: "approved" },
  policy: "Refunds above $2000 require human approval.",
};

describe("evaluateDecision", () => {
  it("parses a clean JSON verdict from the model", async () => {
    const complete = async () =>
      JSON.stringify({ assessment: "incorrect", confidence: 0.92, reasoning: "exceeds policy cap" });
    const v = await evaluateDecision(decision, complete);
    expect(v.assessment).toBe("incorrect");
    expect(v.confidence).toBeCloseTo(0.92);
    expect(v.judge).toBe("llm-judge-v1");
  });

  it("extracts JSON even when wrapped in prose or code fences", async () => {
    const complete = async () =>
      "Here is my assessment:\n```json\n{ \"assessment\": \"correct\", \"confidence\": 0.8 }\n```\nDone.";
    const v = await evaluateDecision(decision, complete);
    expect(v.assessment).toBe("correct");
    expect(v.confidence).toBeCloseTo(0.8);
  });

  it("falls back to inconclusive when the model returns no parseable JSON", async () => {
    const v = await evaluateDecision(decision, async () => "I cannot determine this.");
    expect(v.assessment).toBe("inconclusive");
    expect(v.confidence).toBe(0);
  });

  it("clamps confidence into [0,1]", async () => {
    const hi = await evaluateDecision(decision, async () => JSON.stringify({ assessment: "correct", confidence: 5 }));
    const lo = await evaluateDecision(decision, async () => JSON.stringify({ assessment: "correct", confidence: -3 }));
    expect(hi.confidence).toBe(1);
    expect(lo.confidence).toBe(0);
  });

  it("maps an unknown assessment value to inconclusive", async () => {
    const v = await evaluateDecision(decision, async () => JSON.stringify({ assessment: "maybe", confidence: 0.7 }));
    expect(v.assessment).toBe("inconclusive");
  });

  it("includes the action, output, and policy in the prompt sent to the model", async () => {
    let seen = "";
    await evaluateDecision(decision, async (p) => {
      seen = p;
      return JSON.stringify({ assessment: "correct", confidence: 0.9 });
    });
    expect(seen).toContain("refund.approve");
    expect(seen).toContain("approved");
    expect(seen).toContain("human approval");
  });

  it("uses the provided judge name", async () => {
    const v = await evaluateDecision(decision, async () => JSON.stringify({ assessment: "correct", confidence: 0.9 }), "qwen2.5-7b-judge");
    expect(v.judge).toBe("qwen2.5-7b-judge");
  });

  it("is resilient to the model throwing — returns inconclusive", async () => {
    const v = await evaluateDecision(decision, async () => {
      throw new Error("model unreachable");
    });
    expect(v.assessment).toBe("inconclusive");
    expect(v.confidence).toBe(0);
  });
});
