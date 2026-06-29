import type { EvalVerdict } from "@veritrace/core";

/** A single AI decision to be judged for correctness. */
export interface Decision {
  action: string;
  model: string;
  input: unknown;
  output: unknown;
  /** Optional policy/spec the decision should comply with. */
  policy?: string;
}

/** The LLM call, injected so the scoring logic is testable without a live model.
 *  Any OpenAI-compatible endpoint (Ollama, vLLM on Nosana, OpenRouter) fits. */
export type Completion = (prompt: string) => Promise<string>;

const ASSESSMENTS = new Set(["correct", "incorrect", "inconclusive"]);

function buildPrompt(d: Decision): string {
  return [
    "You are a strict evaluator of AI agent decisions. Decide whether the action below was CORRECT.",
    d.policy ? `\nPolicy the decision must comply with:\n${d.policy}` : "",
    `\nAction: ${d.action}`,
    `Model: ${d.model}`,
    `\nInputs the agent saw:\n${JSON.stringify(d.input, null, 2)}`,
    `\nThe agent's output:\n${JSON.stringify(d.output, null, 2)}`,
    "\nRespond with ONLY a JSON object of the form:",
    '{"assessment": "correct" | "incorrect" | "inconclusive", "confidence": 0.0-1.0, "reasoning": "<one sentence>"}',
  ].join("\n");
}

/** Pull the first balanced JSON object out of arbitrary model text. */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const INCONCLUSIVE = (judge: string): EvalVerdict => ({
  assessment: "inconclusive",
  confidence: 0,
  judge,
});

/**
 * Score a decision by asking an LLM-as-judge and normalizing its answer into a
 * signed-ready EvalVerdict. Always returns a verdict — malformed output, an
 * unknown assessment, or a thrown model call all degrade to "inconclusive"
 * rather than throwing, so the pipeline never blocks on the judge.
 */
export async function evaluateDecision(
  decision: Decision,
  complete: Completion,
  judge = "llm-judge-v1",
): Promise<EvalVerdict> {
  let raw: string;
  try {
    raw = await complete(buildPrompt(decision));
  } catch {
    return INCONCLUSIVE(judge);
  }

  const parsed = extractJson(raw);
  if (!parsed) return INCONCLUSIVE(judge);

  const assessment = typeof parsed.assessment === "string" && ASSESSMENTS.has(parsed.assessment)
    ? (parsed.assessment as EvalVerdict["assessment"])
    : "inconclusive";

  const rawConf = typeof parsed.confidence === "number" ? parsed.confidence : 0;
  const confidence = Math.max(0, Math.min(1, rawConf));

  return { assessment, confidence, judge };
}
