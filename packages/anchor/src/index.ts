import {
  buildMerkleRoot,
  getMerkleProof,
  receiptLeaf,
  type ReceiptRecord,
} from "@veritrace/core";

/** Where a Merkle root gets published. The crypto (root + proofs) is identical
 *  regardless of backend; the backend only decides where the root is anchored. */
export interface AnchorRef {
  backend: string;
  arweaveTxId?: string;
  chainTxHash?: string;
}

export interface AnchorBackend {
  name: string;
  publish(merkleRoot: string): Promise<AnchorRef>;
}

/** Offline backend: the root "is" the reference. Fully deterministic — used by
 *  tests and the local demo. Real permanence comes from the Arweave/chain backends. */
export class LocalAnchorBackend implements AnchorBackend {
  readonly name = "local";
  async publish(merkleRoot: string): Promise<AnchorRef> {
    return { backend: this.name };
  }
}

/**
 * Merkle-batch a set of signed receipts and publish the single root via the
 * given backend. Returns each record with an `anchor` carrying its inclusion
 * proof and the backend reference, so any verifier can prove membership.
 */
export async function anchorBatch(
  records: ReceiptRecord[],
  backend: AnchorBackend,
): Promise<ReceiptRecord[]> {
  if (records.length === 0) throw new Error("cannot anchor an empty batch");

  const leaves = records.map((r) => receiptLeaf(r.receipt));
  const merkleRoot = buildMerkleRoot(leaves);
  const ref = await backend.publish(merkleRoot);

  return records.map((r, i) => ({
    ...r,
    anchor: {
      merkleRoot,
      merkleProof: getMerkleProof(leaves, i),
      leafIndex: i,
      backend: ref.backend,
      ...(ref.arweaveTxId ? { arweaveTxId: ref.arweaveTxId } : {}),
      ...(ref.chainTxHash ? { chainTxHash: ref.chainTxHash } : {}),
    },
  }));
}

export type AnchorKind = "local" | "arweave" | "chain";

/**
 * Select an anchor backend by name (defaults to env `VERITRACE_ANCHOR`, else
 * "local"). The real backends are loaded lazily so the offline path never
 * requires network libraries or credentials.
 */
export async function createAnchorBackend(
  kind: AnchorKind = (process.env.VERITRACE_ANCHOR as AnchorKind) || "local",
): Promise<AnchorBackend> {
  switch (kind) {
    case "arweave": {
      const { ArweaveAnchorBackend } = await import("./backends/arweave");
      return new ArweaveAnchorBackend();
    }
    case "chain": {
      const { ChainAnchorBackend } = await import("./backends/chain");
      return new ChainAnchorBackend();
    }
    case "local":
    default:
      return new LocalAnchorBackend();
  }
}
