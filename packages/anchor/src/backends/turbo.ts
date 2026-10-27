import type { AnchorBackend, AnchorRef } from "../index.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Publishes a Merkle root to Arweave through **Turbo** (ar.io / ArDrive), the
 * bundling service in front of the Arweave network.
 *
 * Why Turbo rather than raw `arweave.transactions.post`:
 *   - **Items up to 105 KiB upload free**, with no AR tokens and no top-up, up
 *     to a 10 MiB lifetime allowance per wallet. A Merkle root payload is a few
 *     hundred bytes, so anchoring is $0.
 *   - Turbo signs an ANS-104 data item, which is accepted by every gateway
 *     (arweave.net, ar-io.dev, turbo-gateway.com) like any other Arweave tx.
 *
 * The root lands on Arweave permanently either way — the payment path differs,
 * not the permanence.
 *
 * Env:
 *   VERITRACE_ARWEAVE_JWK       JSON string of an Arweave JWK
 *   VERITRACE_ARWEAVE_JWK_FILE  path to a JWK file (default: .veritrace/wallet.json)
 *   VERITRACE_ARWEAVE_GATEWAY   gateway used in the returned URL
 *
 * With neither env set, a throwaway JWK is generated once and persisted to
 * `.veritrace/wallet.json` so repeated anchors share one free-tier allowance.
 */
export class TurboAnchorBackend implements AnchorBackend {
  readonly name = "arweave-turbo";
  readonly gateway = process.env.VERITRACE_ARWEAVE_GATEWAY ?? "https://arweave.net";

  private readonly jwkJson = process.env.VERITRACE_ARWEAVE_JWK;
  private readonly jwkFile =
    process.env.VERITRACE_ARWEAVE_JWK_FILE ?? ".veritrace/wallet.json";

  private loadJwk(): unknown {
    if (this.jwkJson) return JSON.parse(this.jwkJson);
    if (existsSync(this.jwkFile)) return JSON.parse(readFileSync(this.jwkFile, "utf8"));

    // First run: mint a wallet and keep it, so the free allowance accrues to a
    // single address instead of a new one every invocation.
    throw new Error(
      `TurboAnchorBackend: no Arweave wallet at ${this.jwkFile}.\n` +
        `Run \`pnpm anchor:init\` first — it generates one (no AR needed).`,
    );
  }

  async publish(merkleRoot: string): Promise<AnchorRef> {
    const jwk = this.loadJwk();
    const { TurboFactory, ArweaveSigner } = await import("@ardrive/turbo-sdk");
    const { Readable } = await import("node:stream");

    const turbo = TurboFactory.authenticated({
      signer: new ArweaveSigner(jwk as never),
    });

    const payload = JSON.stringify(
      { veritraceMerkleRoot: merkleRoot, v: 1, anchoredAt: new Date().toISOString() },
      null,
      0,
    );

    const result = await turbo.uploadFile({
      fileStreamFactory: () => Readable.from(Buffer.from(payload)),
      fileSizeFactory: () => Buffer.byteLength(payload),
      dataItemOpts: {
        tags: [
          { name: "App-Name", value: "VeriTrace" },
          { name: "Content-Type", value: "application/json" },
          { name: "VeriTrace-Merkle-Root", value: merkleRoot },
          { name: "VeriTrace-Protocol", value: "v1" },
        ],
      },
    });

    return { backend: this.name, arweaveTxId: result.id };
  }

  /** Public URL for a transaction, for humans and for the verifier. */
  url(txId: string): string {
    return `${this.gateway.replace(/\/$/, "")}/${txId}`;
  }
}

/** Generate an Arweave JWK and persist it. No AR required — Turbo's free tier
 *  covers small uploads from any funded-or-not address. */
export async function initArweaveWallet(
  file = process.env.VERITRACE_ARWEAVE_JWK_FILE ?? ".veritrace/wallet.json",
): Promise<{ file: string; address: string }> {
  const Arweave = (await import("arweave")).default;
  const arweave = Arweave.init({});
  const jwk = await arweave.wallets.generate();
  const address = await arweave.wallets.jwkToAddress(jwk);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(jwk, null, 2), { mode: 0o600 });
  return { file, address };
}
