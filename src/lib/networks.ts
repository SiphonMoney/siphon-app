// Central EVM network registry — single source of truth for chain + contract config.
// Both supported chains run the SAME (9-signal) Siphon contracts, so one ABI + one circuit
// works everywhere; only addresses / RPC / chain id differ per network.

export interface NetworkConfig {
  chainId: number;
  hexChainId: string;
  name: string;
  shortName: string; // toggle label, e.g. "BASE" / "ETHEREUM"
  badgeLabel: string; // compact label for balance cards, e.g. "Sepolia" / "Base"
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
    badgeLabel: 'Sepolia',
    entrypoint: '0x867e9C195eB85960c390D4a7A64F4e16905D6638',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    swapRouter: '0x5D49f98ea31bfa7B41473Bc034BCA56B659C11A3',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    deployBlock: parseInt(process.env.NEXT_PUBLIC_ETH_SEPOLIA_DEPLOY_BLOCK || '11130700', 10),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  8453: {
    chainId: 8453,
    hexChainId: '0x2105',
    name: 'Base',
    shortName: 'BASE',
    badgeLabel: 'Base',
    entrypoint: '0x2f7d237977A86830708D9C872f5F4D3D7A980138',
    weth: '0x4200000000000000000000000000000000000006',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    deployBlock: parseInt(process.env.NEXT_PUBLIC_BASE_MAINNET_DEPLOY_BLOCK || '47815995', 10),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  84532: {
    chainId: 84532,
    hexChainId: '0x14a34',
    name: 'Base Sepolia',
    shortName: 'BASE-TEST',
    badgeLabel: 'Base Sepolia',
    entrypoint: '0xf7f2bEC39c3851012Ec722a6443F1979afEE4F9C',
    weth: '0x4200000000000000000000000000000000000006',
    usdc: '0x036CBD53842c5426634E7929741cc1538ff7178E',
    swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    deployBlock: parseInt(process.env.NEXT_PUBLIC_BASE_SEPOLIA_DEPLOY_BLOCK || '43273000', 10),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

// Base Mainnet first; Sepolia testnets available via toggle.
export const SUPPORTED_CHAIN_IDS = [8453, 84532, 11155111];
export const DEFAULT_CHAIN_ID = 8453; // Base Mainnet

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

/**
 * URL for read-only JsonRpcProvider calls.
 * Browser → same-origin /api/rpc proxy; SSR/server → public gateway (no secrets in bundle).
 */
export function getReadProviderRpcUrl(chainId?: number): string {
  const id = chainId ?? getSelectedChainId();
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/rpc?chainId=${id}`;
  }
  return getNetwork(id).rpcUrl;
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

type EthereumProvider = {
  request: (p: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function walletErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Failed to switch network in wallet';
}

/** Prompt the connected wallet to switch (adding the chain if missing). */
export async function switchWalletNetwork(
  ethereum: EthereumProvider,
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

export type SelectChainResult = { ok: true; chainId: number } | { ok: false; chainId: number; error: string };

/**
 * Switch the wallet to `chainId` (when available), then update dapp state.
 * If the wallet rejects the switch, dapp state is left unchanged.
 */
export async function selectChainAndSwitchWallet(chainId: number): Promise<SelectChainResult> {
  const cfg = NETWORKS[chainId];
  if (!cfg) return { ok: false, chainId: getSelectedChainId(), error: `Unsupported chainId: ${chainId}` };

  const current = getSelectedChainId();
  if (chainId === current) return { ok: true, chainId };

  const eth =
    typeof window !== 'undefined'
      ? (window as Window & { ethereum?: EthereumProvider }).ethereum
      : undefined;

  if (eth) {
    try {
      await switchWalletNetwork(eth, chainId);
    } catch (err: unknown) {
      return { ok: false, chainId: current, error: walletErrorMessage(err) };
    }
  }

  setSelectedChainId(chainId);
  return { ok: true, chainId };
}

let walletChainSyncInstalled = false;

/** Keep dapp selected chain in sync when the user switches networks in their wallet. */
export function installWalletChainSync(): void {
  if (typeof window === 'undefined' || walletChainSyncInstalled) return;
  const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!eth?.on) return;

  const onChainChanged = (hexChainId: unknown) => {
    const id = typeof hexChainId === 'string' ? parseInt(hexChainId, 16) : NaN;
    if (!NETWORKS[id] || id === getSelectedChainId()) return;
    setSelectedChainId(id);
    window.dispatchEvent(new CustomEvent('siphon:walletChainChanged', { detail: { chainId: id } }));
  };

  eth.on('chainChanged', onChainChanged);
  walletChainSyncInstalled = true;
}
