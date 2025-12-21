import { Connection } from "@solana/web3.js";

/**
 * Creates a Solana Connection instance using the secure RPC proxy endpoint.
 * This ensures the Helius API key is never exposed to the client.
 */
export function createSolanaConnection(): Connection {
  const proxyUrl = `${window.location.origin}/api/solana/rpc`;
  return new Connection(proxyUrl, "confirmed");
}

