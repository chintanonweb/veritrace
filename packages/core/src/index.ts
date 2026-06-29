import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

/**
 * The canonical, signable shape of a VeriTrace receipt. Additional fields
 * (anchoring, eval verdicts) are layered on top by the API but the signed
 * core is exactly these fields.
 */
export interface Receipt {
  agent: string;
  traceId: string;
  parentId?: string;
  action: string;
  model: string;
  modelVersion: string;
  inputHash: string;
  outputHash: string;
  createdAt: string;
}

export interface Keypair {
  privateKey: string; // hex
  publicKey: string; // hex
}

export interface MerkleStep {
  hash: string; // hex of sibling
  position: "left" | "right"; // sibling position relative to the running hash
}

export type MerkleProof = MerkleStep[];

/** Anchoring proof attached to a receipt once it has been Merkle-batched. */
export interface AnchorProof {
  merkleRoot: string;
  merkleProof: MerkleStep[];
  leafIndex: number;
  /** Where the root was published (set by the active anchor backend). */
  arweaveTxId?: string;
  chainTxHash?: string;
  backend?: string;
}

/** Automated assessment of whether an action was correct. Probabilistic by
 *  nature (an LLM-judge today) — a transparent, re-runnable signal, NOT ground
 *  truth. Confidence is 0..1. */
export interface EvalVerdict {
  assessment: "correct" | "incorrect" | "inconclusive";
  confidence: number;
  judge: string;
}

/** A signed receipt plus the public key to verify it, optionally anchored and
 *  optionally carrying an eval verdict. The independently-verifiable unit
 *  shared across SDK, anchor, verifier, and score. */
export interface ReceiptRecord {
  receipt: Receipt;
  signature: string;
  publicKey: string;
  anchor?: AnchorProof;
  verdict?: EvalVerdict;
}

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** sha256 of a string (or hex of arbitrary bytes), returned as lowercase hex. */
export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export function generateKeypair(): Keypair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey: bytesToHex(privateKey), publicKey: bytesToHex(publicKey) };
}

/** Derive the Ed25519 public key (hex) from a private key (hex). */
export function ed25519PublicKey(privateKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(privateKeyHex)));
}

export function signReceipt(receipt: Receipt, privateKeyHex: string): string {
  const msg = utf8ToBytes(canonicalize(receipt));
  return bytesToHex(ed25519.sign(msg, hexToBytes(privateKeyHex)));
}

export function verifyReceipt(
  receipt: Receipt,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  try {
    const msg = utf8ToBytes(canonicalize(receipt));
    return ed25519.verify(hexToBytes(signatureHex), msg, hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

/** Canonical Merkle leaf for a receipt: sha256 of its canonical form. */
export function receiptLeaf(receipt: Receipt): string {
  return sha256Hex(canonicalize(receipt));
}

/** sha256 of two concatenated hex nodes → hex. */
function hashPair(left: string, right: string): string {
  return bytesToHex(sha256(hexToBytes(left + right)));
}

/** Build the Merkle root of an array of hex leaves (odd nodes promote the last). */
export function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) throw new Error("cannot build a Merkle root of zero leaves");
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0];
}

/** Inclusion proof for the leaf at `index`. */
export function getMerkleProof(leaves: string[], index: number): MerkleProof {
  if (index < 0 || index >= leaves.length) throw new Error("leaf index out of range");
  const proof: MerkleProof = [];
  let level = [...leaves];
  let idx = index;
  while (level.length > 1) {
    const isRightNode = idx % 2 === 1;
    const siblingIdx = isRightNode ? idx - 1 : idx + 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx];
    proof.push({ hash: sibling, position: isRightNode ? "left" : "right" });

    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hashPair(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/** Recompute the root from a leaf + proof and compare to the expected root. */
export function verifyMerkleProof(
  leaf: string,
  proof: MerkleProof,
  root: string,
): boolean {
  let running = leaf;
  for (const step of proof) {
    running =
      step.position === "left"
        ? hashPair(step.hash, running)
        : hashPair(running, step.hash);
  }
  return running === root;
}
