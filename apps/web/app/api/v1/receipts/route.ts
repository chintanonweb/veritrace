import { NextResponse } from "next/server";
import { verifyRecord } from "@veritrace/verifier";
import { getStore } from "../../../../lib/seed";

/** POST /api/v1/receipts — ingest a signed receipt record. Rejects bad signatures. */
export async function POST(req: Request) {
  let record;
  try {
    record = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const result = verifyRecord(record);
  if (!result.checks.signature) {
    return NextResponse.json(
      { error: "signature verification failed", checks: result.checks },
      { status: 422 },
    );
  }

  const store = await getStore();
  const id = store.add(record, new Date().toISOString());
  return NextResponse.json({ id, status: "stored", verify: `/r/${id}` }, { status: 201 });
}

/** GET /api/v1/receipts — list stored receipts with their live verdicts. */
export async function GET() {
  const store = await getStore();
  const items = store.list().map((s) => ({
    id: s.id,
    action: s.record.receipt.action,
    agent: s.record.receipt.agent,
    verdict: verifyRecord(s.record).ok ? "verified" : "altered",
  }));
  return NextResponse.json({ items });
}
