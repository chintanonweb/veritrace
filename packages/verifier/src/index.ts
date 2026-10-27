import {
  verifyReceipt,
  verifyMerkleProof,
  recordLeaf,
  verifyVerdict,
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
    /** true when a verdict is present and its judge signature checks out,
     *  false when present but bad, null when there is no verdict at all. */
    verdict: boolean | null;
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
      checks: { signature: false, anchored: false, verdict: null },
      error: "malformed receipt record",
    };
  }

  const signature = verifyReceipt(record.receipt, record.signature, record.publicKey);

  let anchored = false;
  if (record.anchor?.merkleRoot && Array.isArray(record.anchor.merkleProof)) {
    anchored = verifyMerkleProof(
      recordLeaf(record),
      record.anchor.merkleProof,
      record.anchor.merkleRoot,
    );
  }

  // A verdict must carry its own signature. A record that has a verdict but no
  // signature over it is a record whose judgment cannot be trusted — treat that
  // as a failure, not as "no verdict".
  let verdict: boolean | null = null;
  if (record.verdict) {
    verdict =
      typeof record.verdictSignature === "string" &&
      typeof record.verdictPublicKey === "string"
        ? verifyVerdict(record.receipt, record.verdict, record.verdictSignature, record.verdictPublicKey)
        : false;
  }

  const hasAnchor = Boolean(record.anchor);
  const ok = signature && (!hasAnchor || anchored) && verdict !== false;

  const error =
    hasAnchor && !anchored
      ? "anchor present but Merkle inclusion proof is invalid"
      : verdict === false
        ? "verdict signature missing or invalid — the assessment cannot be trusted"
        : undefined;

  return {
    ok,
    checks: { signature, anchored, verdict },
    ...(error ? { error } : {}),
  };
}
