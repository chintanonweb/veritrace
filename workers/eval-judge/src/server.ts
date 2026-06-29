import { createServer } from "node:http";
import { evaluateDecision, type Decision } from "./judge.js";
import { createOpenAICompletion } from "./llm.js";

/** Minimal HTTP wrapper around the eval-judge so it can run as a service
 *  (e.g. alongside an LLM served on Nosana). POST /evaluate {decision} → verdict. */
const PORT = Number(process.env.PORT ?? 8088);
const JUDGE = process.env.EVAL_JUDGE_NAME ?? "qwen2.5-7b-judge";
const complete = createOpenAICompletion();

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, judge: JUDGE }));
    return;
  }
  if (req.method === "POST" && req.url === "/evaluate") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { decision } = JSON.parse(body) as { decision: Decision };
        const verdict = await evaluateDecision(decision, complete, JUDGE);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ verdict }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`VeriTrace eval-judge listening on :${PORT} (judge=${JUDGE})`);
});
