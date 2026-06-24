import { NETWORKS } from './networks';

/** Server-only upstream RPC URLs (Alchemy keys stay off the client bundle). */
export function getServerRpcUrl(chainId: number): string {
  if (chainId === 84532) {
    return (
      process.env.BASE_SEPOLIA_RPC ||
      process.env.BASE_RPC_URL ||
      NETWORKS[84532].rpcUrl
    );
  }
  if (chainId === 11155111) {
    return (
      process.env.ETH_SEPOLIA_RPC ||
      process.env.ETH_RPC_URL ||
      NETWORKS[11155111].rpcUrl
    );
  }
  throw new Error(`Unsupported chainId: ${chainId}`);
}
