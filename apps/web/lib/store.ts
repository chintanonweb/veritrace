import { sha256Hex, receiptLeaf, type ReceiptRecord } from "@veritrace/core";

/** Content-addressed id: derived from the receipt + signature, so the URL
 *  itself can't be repointed at a different receipt. */
export function receiptId(record: ReceiptRecord): string {
  return "rcpt_" + sha256Hex(receiptLeaf(record.receipt) + record.signature).slice(0, 16);
}

export interface StoredReceipt {
  id: string;
  record: ReceiptRecord;
  receivedAt: string;
}

/** Minimal in-memory receipt store. Swappable for Prisma/Postgres later; kept
 *  in-memory so the app runs with zero external services for the demo. */
export class ReceiptStore {
  private readonly byId = new Map<string, StoredReceipt>();
  private readonly order = new Map<string, number>();
  private seq = 0;

  add(record: ReceiptRecord, receivedAt = "1970-01-01T00:00:00.000Z"): string {
    const id = receiptId(record);
    if (!this.byId.has(id)) {
      this.byId.set(id, { id, record, receivedAt });
      this.order.set(id, this.seq++);
    }
    return id;
  }

  get(id: string): ReceiptRecord | undefined {
    return this.byId.get(id)?.record;
  }

  getStored(id: string): StoredReceipt | undefined {
    return this.byId.get(id);
  }

  list(): StoredReceipt[] {
    return [...this.byId.values()].sort(
      (a, b) => (this.order.get(b.id) ?? 0) - (this.order.get(a.id) ?? 0),
    );
  }
}
