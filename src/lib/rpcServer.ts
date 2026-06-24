import { NETWORKS } from './networks';

function uniqueUrls(urls: (string | undefined)[]): string[] {
  return [...new Set(urls.filter((u): u is string => Boolean(u)))];
}

/** Ordered upstream RPC URLs — primary first, then public fallbacks. */
export function getServerRpcUrls(chainId: number): string[] {
  if (chainId === 84532) {
    return uniqueUrls([
      process.env.BASE_SEPOLIA_RPC,
      process.env.BASE_RPC_URL,
      NETWORKS[84532].rpcUrl,
      'https://sepolia.base.org',
    ]);
  }
  if (chainId === 11155111) {
    return uniqueUrls([
      process.env.ETH_SEPOLIA_RPC,
      process.env.ETH_RPC_URL,
      NETWORKS[11155111].rpcUrl,
      'https://ethereum-sepolia-rpc.publicnode.com',
    ]);
  }
  throw new Error(`Unsupported chainId: ${chainId}`);
}

/** @deprecated Use getServerRpcUrls — returns primary only. */
export function getServerRpcUrl(chainId: number): string {
  return getServerRpcUrls(chainId)[0];
}
