import { NextResponse } from "next/server";
import { verifyRecord } from "@veritrace/verifier";
import { computeLeaderboard } from "@veritrace/score";
import { getStore } from "../../../../lib/seed";

/** GET /api/v1/agents — the Verified AI Score leaderboard, computed live. */
export async function GET() {
  const store = await getStore();
  const records = store.list().map((s) => s.record);
  const board = computeLeaderboard(records, (r) => verifyRecord(r).ok);
  return NextResponse.json({ agents: board });
}
