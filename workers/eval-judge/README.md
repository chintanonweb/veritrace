# @veritrace/eval-judge

The **eval-judge** scores each AI decision for correctness and returns a verdict
(`{ assessment, confidence, judge }`) that VeriTrace signs and attaches to the
receipt. It's an LLM-as-judge designed to run on **Nosana** decentralized GPU
compute — so even the *"was it correct?"* assessment runs on infrastructure no
single party controls.

## Why this is the decentralized-compute piece

VeriTrace anchors receipts on Arweave (decentralized storage). The eval-judge is
the matching **decentralized inference** half: the judge model is served on the
Nosana GPU network, not a centralized API.

## How it fits together

```
decision ──▶ eval-judge (LLM on Nosana) ──▶ {assessment, confidence} ──▶ signed onto the receipt
```

- `judge.ts` — `evaluateDecision(decision, complete, judge)` builds the prompt,
  parses the model's answer, and degrades safely to `inconclusive` on any bad
  output. The LLM call is injected, so the logic is fully unit-tested (8 tests).
- `llm.ts` — `createOpenAICompletion()` speaks the OpenAI chat API, so the same
  code targets Ollama, vLLM-on-Nosana, or OpenRouter via env vars.
- `server.ts` — `POST /evaluate { decision }` → `{ verdict }`, `GET /health`.

## Run locally (Ollama)

```bash
ollama pull qwen2.5:7b
EVAL_LLM_BASE_URL=http://localhost:11434/v1 EVAL_LLM_MODEL=qwen2.5:7b pnpm start
curl -s localhost:8088/evaluate -d '{"decision":{"action":"refund.approve","model":"gpt-4o","input":{"amountUSD":5000,"policyMaxUSD":2000},"output":{"decision":"approved"},"policy":"Refunds over $2000 need human approval."}}'
```

## Deploy the judge model on Nosana

1. Deploy `nosana_job.json` at https://deploy.nosana.com/deployments/create
   (Deployment Strategy: **Simple**, Replica Count **1**, pick a GPU market with ≥16 GB VRAM; keep Container Timeout low to stretch the $70 credits).
2. Take the exposed endpoint URL and point the service at it:
   ```bash
   EVAL_LLM_BASE_URL=https://<your-nosana-endpoint>/v1 \
   EVAL_LLM_MODEL=qwen2.5:7b \
   pnpm start
   ```

Env: `EVAL_LLM_BASE_URL`, `EVAL_LLM_MODEL`, `EVAL_LLM_API_KEY` (optional), `PORT`, `EVAL_JUDGE_NAME`.
