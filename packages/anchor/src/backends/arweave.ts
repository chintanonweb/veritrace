import type { AnchorBackend, AnchorRef } from "../index.js";

/**
 * Publishes a Merkle root to Arweave for PERMANENT storage. Once mined, the
 * root is stored forever and is retrievable by anyone — the record outlives
 * VeriTrace itself, which is the whole point of using decentralized storage.
 *
 * Credential-gated: requires an Arweave JWK wallet. Not exercised in unit tests
 * (it touches the network). This is the literal Decentralize-AI sponsor (Arweave)
 * integration — real code, just needs a wallet + (free) credits to run.
 *
 * Env:
 *   VERITRACE_ARWEAVE_JWK   JSON string of an Arweave JWK wallet
 *   VERITRACE_ARWEAVE_HOST  (optional) gateway host, defaults to arweave.net
 */
export class ArweaveAnchorBackend implements AnchorBackend {
  readonly name = "arweave";
  constructor(
    private readonly jwkJson = process.env.VERITRACE_ARWEAVE_JWK,
    private readonly host = process.env.VERITRACE_ARWEAVE_HOST ?? "arweave.net",
  ) {}

  async publish(merkleRoot: string): Promise<AnchorRef> {
    if (!this.jwkJson) {
      throw new Error("ArweaveAnchorBackend needs VERITRACE_ARWEAVE_JWK (an Arweave JWK wallet)");
    }
    const ArweaveMod = (await import("arweave")).default;
    const arweave = ArweaveMod.init({ host: this.host, port: 443, protocol: "https" });
    const jwk = JSON.parse(this.jwkJson);

    const tx = await arweave.createTransaction(
      { data: JSON.stringify({ veritraceMerkleRoot: merkleRoot, v: 1 }) },
      jwk,
    );
    tx.addTag("App-Name", "VeriTrace");
    tx.addTag("Content-Type", "application/json");
    tx.addTag("VeriTrace-Merkle-Root", merkleRoot);

    await arweave.transactions.sign(tx, jwk);
    await arweave.transactions.post(tx);

    return { backend: this.name, arweaveTxId: tx.id };
  }
}
