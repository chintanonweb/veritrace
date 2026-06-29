import type { ReceiptRecord } from "@veritrace/core";

export interface AgentScore {
  agent: string;
  /** Receipts that pass independent verification (authentic + untampered). */
  verifiedActions: number;
  totalActions: number;
  /** verifiedActions / totalActions — the share that is provably untampered. */
  integrity: number;
  /** Verified receipts that also carry an eval verdict. */
  evaluated: number;
  correct: number;
  /** correct / evaluated, or null when nothing was evaluated. */
  successRate: number | null;
  /** Mean verdict confidence over evaluated receipts, or null. */
  avgConfidence: number | null;
  byAction: Record<string, number>;
}

type IsVerified = (record: ReceiptRecord) => boolean;

/** Compute the Verified AI Score for one agent from its receipt records.
 *  Only independently-verified receipts contribute to success accounting —
 *  a tampered receipt's self-reported verdict is not trusted. */
export function scoreForAgent(
  agent: string,
  records: ReceiptRecord[],
  isVerified: IsVerified,
): AgentScore {
  let verifiedActions = 0;
  let evaluated = 0;
  let correct = 0;
  let confidenceSum = 0;
  const byAction: Record<string, number> = {};

  for (const r of records) {
    byAction[r.receipt.action] = (byAction[r.receipt.action] ?? 0) + 1;
    if (!isVerified(r)) continue;
    verifiedActions++;
    if (r.verdict) {
      evaluated++;
      confidenceSum += r.verdict.confidence;
      if (r.verdict.assessment === "correct") correct++;
    }
  }

  return {
    agent,
    verifiedActions,
    totalActions: records.length,
    integrity: records.length === 0 ? 0 : verifiedActions / records.length,
    evaluated,
    correct,
    successRate: evaluated === 0 ? null : correct / evaluated,
    avgConfidence: evaluated === 0 ? null : confidenceSum / evaluated,
    byAction,
  };
}

/** Build a leaderboard across all agents, ranked by verified actions desc. */
export function computeLeaderboard(
  records: ReceiptRecord[],
  isVerified: IsVerified,
): AgentScore[] {
  const byAgent = new Map<string, ReceiptRecord[]>();
  for (const r of records) {
    const list = byAgent.get(r.receipt.agent) ?? [];
    list.push(r);
    byAgent.set(r.receipt.agent, list);
  }
  return [...byAgent.entries()]
    .map(([agent, recs]) => scoreForAgent(agent, recs, isVerified))
    .sort((a, b) => b.verifiedActions - a.verifiedActions || a.agent.localeCompare(b.agent));
}
