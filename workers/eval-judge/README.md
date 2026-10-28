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

`nosana_job.json` is a **three-operation** job. An earlier single-op version
started Ollama and pulled weights but never ran the judge at all — the service
had nothing to talk to. The ops are:

| Op | Role |
|---|---|
| `judge-llm` | Ollama on GPU, `expose: 11434`, health check on `/api/tags` |
| `model-pull` | Pulls `qwen2.5:7b` over HTTP; `depends_on: ["judge-llm"]` |
| `eval-judge` | This service, `EVAL_LLM_BASE_URL=http://judge-llm:11434/v1`, health check on `/health` |

Ops address each other by **op id as hostname**, and `execution.depends_on`
orders them, so the judge only starts once the model is actually resident.

To deploy:

1. Build and push the image first (`docker build -f workers/eval-judge/Dockerfile .`
   from the repo root, then push to your registry and update `image` in the JSON).
2. Post it at https://deploy.nosana.com/deployments/create — Deployment Strategy
   **Simple**, Replica Count **1**, a GPU market with ≥16 GB VRAM, and a low
   Container Timeout so credits aren't burned while idle.
3. On the resulting endpoint:
   ```bash
   curl https://<endpoint>/health
   curl -X POST https://<endpoint>/evaluate \
     -d '{"decision":{"action":"refund.approve","model":"gpt-4o","input":{"amountUSD":5000,"policyMaxUSD":2000},"output":{"decision":"approved"},"policy":"Refunds over $2000 need human approval."}}'
   ```

> ⚠️ `/evaluate` is unauthenticated. Put a shared-secret header in front of it
> before exposing it publicly, or a stranger's traffic will burn your credits.

Env: `EVAL_LLM_BASE_URL`, `EVAL_LLM_MODEL`, `EVAL_LLM_API_KEY` (optional), `PORT`, `EVAL_JUDGE_NAME`.

### The judge image is published by CI

`nosana_job.json` pulls `ghcr.io/chintanonweb/veritrace-eval-judge:latest`. The
workflow in `.github/workflows/publish-judge.yml` builds and pushes it on every
change to `workers/eval-judge/**` or `packages/core/**`, using the workflow's own
`GITHUB_TOKEN` — no registry secrets to store.

**One manual step, once:** GHCR packages are private by default. GitHub → your
profile → **Packages** → `veritrace-eval-judge` → **Package settings** →
**Change visibility** → **Public**. Until then Nosana cannot pull it and the third
op fails.

### If you would rather not build an image at all

Deploy `nosana_ollama.json` instead (below).

For a run that needs no image build at all, deploy **`nosana_ollama.json`** instead —
two ops, Ollama on GPU plus a model pull, nothing custom, ~8 GB VRAM — then point the
judge at the public endpoint from wherever it runs:

```bash
EVAL_LLM_BASE_URL=https://<your-endpoint>/v1 \
EVAL_LLM_MODEL=qwen2.5:7b \
pnpm judge:smoke
```

Be precise about what that proves: **the model inference ran on Nosana GPU**, and the
verdict it returned was signed into a receipt on the calling side. It does **not** prove
the judge *service* is hosted on Nosana — for that you need the image published and the
three-op job.

Cost note: Ollama pulling a 7B model takes a few minutes of GPU time. Use deployment
strategy **Simple** (not Infinite), Replica Count **1**, and a short container timeout,
then stop the deployment when you have your evidence. A 24 GB GPU market at ~$0.48/hr
left running for a month is ~$350; twenty minutes is a few cents.
