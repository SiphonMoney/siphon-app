import { NETWORKS } from './networks';

function uniqueUrls(urls: (string | undefined)[]): string[] {
  return [...new Set(urls.filter((u): u is string => Boolean(u)))];
}

/** Ordered upstream RPC URLs — primary first, then public fallbacks. */
export function getServerRpcUrls(chainId: number): string[] {
  if (chainId === 8453) {
    // Your configured RPC (a paid key) FIRST; reliable public nodes next; free-tier dRPC LAST —
    // its free tier times out even single-block eth_getLogs scans (`code 30`), which stalled
    // Base withdraws. The proxy also demotes drpc for getLogs, but keep it last here regardless.
    return uniqueUrls([
      process.env.BASE_MAINNET_RPC,
      process.env.BASE_RPC_URL,
      NETWORKS[8453].rpcUrl,
      'https://mainnet.base.org',
      'https://1rpc.io/base',
      'https://base.drpc.org',
    ]);
  }
  if (chainId === 84532) {
    return uniqueUrls([
      process.env.BASE_SEPOLIA_RPC,
      process.env.BASE_RPC_URL,
      NETWORKS[84532].rpcUrl,
      'https://sepolia.base.org',
    ]);
  }
  if (chainId === 11155111) {
    // High-limit public nodes FIRST; the env override (often Infura free-tier, which returns its
    // 429 as a JSON-RPC -32005 inside a 200 and throttles every read) is a fallback only.
    return uniqueUrls([
      NETWORKS[11155111].rpcUrl,                          // ethereum-sepolia-rpc.publicnode.com
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.drpc.org',
      'https://rpc.sepolia.org',
      process.env.ETH_SEPOLIA_RPC,
      process.env.ETH_RPC_URL,
    ]);
  }
  throw new Error(`Unsupported chainId: ${chainId}`);
}

/** @deprecated Use getServerRpcUrls — returns primary only. */
export function getServerRpcUrl(chainId: number): string {
  return getServerRpcUrls(chainId)[0];
}
