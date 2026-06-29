import {
  verifyReceipt,
  verifyMerkleProof,
  receiptLeaf,
  type Receipt,
  type ReceiptRecord,
} from "@veritrace/core";

export type { ReceiptRecord };

export interface VerificationResult {
  ok: boolean;
  checks: {
    signature: boolean;
    /** true only when an anchor is present AND its Merkle inclusion proof checks out. */
    anchored: boolean;
  };
  error?: string;
}

const REQUIRED_RECEIPT_FIELDS: (keyof Receipt)[] = [
  "agent",
  "traceId",
  "action",
  "model",
  "modelVersion",
  "inputHash",
  "outputHash",
  "createdAt",
];

function isWellFormed(record: ReceiptRecord): boolean {
  if (!record || typeof record !== "object") return false;
  if (typeof record.signature !== "string" || typeof record.publicKey !== "string") return false;
  const r = record.receipt;
  if (!r || typeof r !== "object") return false;
  return REQUIRED_RECEIPT_FIELDS.every((f) => typeof r[f] === "string");
}

/**
 * Re-verify a receipt with zero trust in VeriTrace, locally:
 *  - `signature`: the receipt is authentically signed and untampered (Ed25519).
 *  - `anchored`:  the receipt is provably included in a published Merkle root.
 * If an anchor is present its inclusion proof MUST hold for the record to pass.
 */
export function verifyRecord(record: ReceiptRecord): VerificationResult {
  if (!isWellFormed(record)) {
    return {
      ok: false,
      checks: { signature: false, anchored: false },
      error: "malformed receipt record",
    };
  }

  const signature = verifyReceipt(record.receipt, record.signature, record.publicKey);

  let anchored = false;
  if (record.anchor?.merkleRoot && Array.isArray(record.anchor.merkleProof)) {
    anchored = verifyMerkleProof(
      receiptLeaf(record.receipt),
      record.anchor.merkleProof,
      record.anchor.merkleRoot,
    );
  }

  const hasAnchor = Boolean(record.anchor);
  const ok = signature && (!hasAnchor || anchored);

  return {
    ok,
    checks: { signature, anchored },
    ...(hasAnchor && !anchored ? { error: "anchor present but Merkle inclusion proof is invalid" } : {}),
  };
}
