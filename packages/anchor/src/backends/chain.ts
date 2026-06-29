import type { AnchorBackend, AnchorRef } from "../index.js";

/**
 * Publishes a Merkle root on an EVM L2 (default: Base Sepolia testnet) by
 * sending a 0-value self-transaction whose calldata IS the root. The root then
 * lives permanently in the chain's transaction history — anyone can read it
 * from a block explorer and check receipts against it.
 *
 * Credential-gated: requires a funded testnet key. Not exercised in unit tests
 * (it touches the network); wired so the sponsor integration is real, not faked.
 *
 * Env:
 *   VERITRACE_CHAIN_PRIVATE_KEY  0x-prefixed funded testnet key
 *   VERITRACE_CHAIN_RPC_URL      (optional) RPC override
 */
export class ChainAnchorBackend implements AnchorBackend {
  readonly name = "base-sepolia";
  constructor(
    private readonly privateKey = process.env.VERITRACE_CHAIN_PRIVATE_KEY,
    private readonly rpcUrl = process.env.VERITRACE_CHAIN_RPC_URL,
  ) {}

  async publish(merkleRoot: string): Promise<AnchorRef> {
    if (!this.privateKey) {
      throw new Error(
        "ChainAnchorBackend needs VERITRACE_CHAIN_PRIVATE_KEY (a funded Base Sepolia testnet key)",
      );
    }
    const { createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { baseSepolia } = await import("viem/chains");

    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(this.rpcUrl),
    });

    const chainTxHash = await client.sendTransaction({
      to: account.address,
      value: 0n,
      data: `0x${merkleRoot}`,
    });

    return { backend: this.name, chainTxHash };
  }
}
