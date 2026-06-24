// Central EVM network registry — single source of truth for chain + contract config.
// Both supported chains run the SAME (9-signal) Siphon contracts, so one ABI + one circuit
// works everywhere; only addresses / RPC / chain id differ per network.

export interface NetworkConfig {
  chainId: number;
  hexChainId: string;
  name: string;
  shortName: string; // toggle label, e.g. "BASE" / "ETHEREUM"
  entrypoint: string;
  weth: string;
  usdc: string;
  swapRouter: string;
  rpcUrl: string;
  explorer: string;
  deployBlock: number; // earliest block to scan for LeafInserted events
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const NETWORKS: Record<number, NetworkConfig> = {
  11155111: {
    chainId: 11155111,
    hexChainId: '0xaa36a7',
    name: 'Ethereum Sepolia',
    shortName: 'ETHEREUM',
    entrypoint: '0x867e9C195eB85960c390D4a7A64F4e16905D6638',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    swapRouter: '0x5D49f98ea31bfa7B41473Bc034BCA56B659C11A3',
    rpcUrl:
      process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC ||
      process.env.NEXT_PUBLIC_ETH_RPC_URL ||
      'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    deployBlock: parseInt(process.env.NEXT_PUBLIC_ETH_SEPOLIA_DEPLOY_BLOCK || '11130700', 10),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  84532: {
    chainId: 84532,
    hexChainId: '0x14a34',
    name: 'Base Sepolia',
    shortName: 'BASE',
    entrypoint: '0xf7f2bEC39c3851012Ec722a6443F1979afEE4F9C',
    weth: '0x4200000000000000000000000000000000000006',
    usdc: '0x036CBD53842c5426634E7929741cc1538ff7178E',
    swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
    rpcUrl:
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC ||
      'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    deployBlock: parseInt(process.env.NEXT_PUBLIC_BASE_SEPOLIA_DEPLOY_BLOCK || '43273000', 10),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(NETWORKS).map(Number);
export const DEFAULT_CHAIN_ID = 84532; // Base Sepolia

const STORAGE_KEY = 'siphon.selectedChainId';

/** The chain the dapp is currently operating on (persisted in localStorage). */
export function getSelectedChainId(): number {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const id = parseInt(stored, 10);
      if (NETWORKS[id]) return id;
    }
  }
  return DEFAULT_CHAIN_ID;
}

/** Set the active chain. Returns the resolved config. Emits a `siphon:chainChanged` event. */
export function setSelectedChainId(chainId: number): NetworkConfig {
  const cfg = NETWORKS[chainId];
  if (!cfg) throw new Error(`Unsupported chainId: ${chainId}`);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, String(chainId));
    window.dispatchEvent(new CustomEvent('siphon:chainChanged', { detail: { chainId } }));
  }
  return cfg;
}

/** Resolve a network config; defaults to the currently-selected chain. */
export function getNetwork(chainId?: number): NetworkConfig {
  const id = chainId ?? getSelectedChainId();
  const cfg = NETWORKS[id];
  if (!cfg) throw new Error(`Unsupported chainId: ${id}`);
  return cfg;
}

/** Map a chain to its supported token set (symbol → {address, decimals}). */
export function getTokens(chainId?: number): Record<string, { address: string; decimals: number; symbol: string }> {
  const n = getNetwork(chainId);
  return {
    ETH: { address: NATIVE_TOKEN, decimals: 18, symbol: 'ETH' },
    USDC: { address: n.usdc, decimals: 6, symbol: 'USDC' },
  };
}

/** Params for wallet_addEthereumChain when the wallet doesn't have the network yet. */
export function addChainParams(chainId?: number) {
  const n = getNetwork(chainId);
  return {
    chainId: n.hexChainId,
    chainName: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: [n.rpcUrl],
    blockExplorerUrls: [n.explorer],
  };
}

/** Prompt the connected wallet to switch (adding the chain if missing). */
export async function switchWalletNetwork(
  ethereum: { request: (p: { method: string; params?: unknown[] }) => Promise<unknown> },
  chainId?: number,
): Promise<void> {
  const n = getNetwork(chainId);
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: n.hexChainId }] });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 4902) {
      await ethereum.request({ method: 'wallet_addEthereumChain', params: [addChainParams(chainId)] });
    } else {
      throw err;
    }
  }
}
