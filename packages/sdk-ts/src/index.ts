import {
  canonicalize,
  sha256Hex,
  signReceipt,
  generateKeypair,
  ed25519PublicKey,
  type Receipt,
  type ReceiptRecord,
} from "@veritrace/core";
import { randomUUID } from "node:crypto";

export type { ReceiptRecord };

/** Per-call metadata describing the AI action being wrapped. */
export interface CallMeta {
  action: string;
  model: string;
  modelVersion: string;
  traceId?: string;
  parentId?: string;
}

export type Sink = (record: ReceiptRecord) => void | Promise<void>;

export interface VeriTraceOptions {
  /** Ed25519 private key (hex). */
  privateKey: string;
  /** Logical name of the agent emitting receipts. */
  agent: string;
  /** Where signed receipts go. Defaults to an in-memory buffer (see `drain`). */
  sink?: Sink;
  /** Clock injection point (testability / determinism). */
  now?: () => string;
}

export class VeriTrace {
  readonly publicKey: string;
  private readonly privateKey: string;
  private readonly agent: string;
  private readonly sink: Sink;
  private readonly now: () => string;
  private readonly buffer: ReceiptRecord[] = [];

  constructor(opts: VeriTraceOptions) {
    this.privateKey = opts.privateKey;
    this.publicKey = ed25519PublicKey(opts.privateKey);
    this.agent = opts.agent;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.sink = opts.sink ?? ((record) => void this.buffer.push(record));
  }

  /** Receipts collected by the default in-memory sink (no-op if a sink was provided). */
  drain(): ReceiptRecord[] {
    return this.buffer.splice(0);
  }

  /**
   * Wrap any (async) function so each invocation emits a signed receipt of the
   * call. The wrapped function behaves identically to the original; on a thrown
   * error the error propagates and no success receipt is emitted.
   */
  wrap<A extends unknown[], R>(
    fn: (...args: A) => R | Promise<R>,
    meta: CallMeta,
  ): (...args: A) => Promise<R> {
    return async (...args: A): Promise<R> => {
      const result = await fn(...args);

      const receipt: Receipt = {
        agent: this.agent,
        traceId: meta.traceId ?? randomUUID(),
        ...(meta.parentId ? { parentId: meta.parentId } : {}),
        action: meta.action,
        model: meta.model,
        modelVersion: meta.modelVersion,
        inputHash: sha256Hex(canonicalize(args)),
        outputHash: sha256Hex(canonicalize(result)),
        createdAt: this.now(),
      };

      const signature = signReceipt(receipt, this.privateKey);
      await this.sink({ receipt, signature, publicKey: this.publicKey });

      return result;
    };
  }
}

/** Convenience for generating a signing identity. */
export { generateKeypair };
