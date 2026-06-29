import type { Completion } from "./judge.js";

/** Build an OpenAI-compatible chat completion. Works unchanged against:
 *  - Ollama        (http://localhost:11434/v1, model "qwen2.5:7b")
 *  - vLLM on Nosana (the deployed endpoint's /v1, model "Qwen/Qwen2.5-7B-Instruct")
 *  - OpenRouter / OpenAI
 *  Configured via env so the same image points at local or decentralized compute. */
export function createOpenAICompletion(opts?: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Completion {
  const baseUrl = (opts?.baseUrl ?? process.env.EVAL_LLM_BASE_URL ?? "http://localhost:11434/v1").replace(/\/$/, "");
  const model = opts?.model ?? process.env.EVAL_LLM_MODEL ?? "qwen2.5:7b";
  const apiKey = opts?.apiKey ?? process.env.EVAL_LLM_API_KEY ?? "";

  return async (prompt: string): Promise<string> => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM endpoint ${baseUrl} returned ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  };
}
