# Containerizes the eval-judge HTTP service. Point EVAL_LLM_BASE_URL at the
# LLM served on Nosana (see nosana_job.json) or at a local Ollama for dev.
FROM node:20-slim
WORKDIR /app

RUN npm install -g pnpm@10

# workspace context is the repo root: docker build -f workers/eval-judge/Dockerfile .
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core ./packages/core
COPY workers/eval-judge ./workers/eval-judge
RUN pnpm install --filter @veritrace/eval-judge... --prod=false

ENV PORT=8088
EXPOSE 8088
WORKDIR /app/workers/eval-judge
CMD ["pnpm", "start"]
