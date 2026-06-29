import { NextResponse } from "next/server";
import { verifyRecord } from "@veritrace/verifier";
import { getStore } from "../../../../../lib/seed";

/** GET /api/v1/receipts/:id — fetch one record plus its live verification result. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const record = store.get(id);
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id, record, verification: verifyRecord(record) });
}
