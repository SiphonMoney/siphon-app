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
  uniswapV3Factory?: string; // for resolving the swap pool (TWAP/grid leg SwapBinding)
  rpcUrl: string;
  explorer: string;
  deployBlock: number; // earliest block to scan for LeafInserted events
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const NETWORKS: Record<number, NetworkConfig> = {
  8453: {
    chainId: 8453,
    hexChainId: '0x2105',
    name: 'Base',
    shortName: 'BASE',
    badgeLabel: 'Base',
    entrypoint:
      process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS?.trim() ||
      '0xE0bbD38d9d15336CD9C971d96eB5C91254D76D12', // multi-note+split deploy 2026-06-30 (old single-note: 0x2f7d2379…)
    weth: '0x4200000000000000000000000000000000000006',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
    uniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    deployBlock: parseInt(process.env.NEXT_PUBLIC_BASE_MAINNET_DEPLOY_BLOCK || '48021000', 10),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  11155111: {
    chainId: 11155111,
    hexChainId: '0xaa36a7',
    name: 'Ethereum Sepolia',
    shortName: 'ETHEREUM',
    badgeLabel: 'Sepolia',
    entrypoint: '0x342326835884b65C27c00249506dA440590FFb6f',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    swapRouter: '0x5D49f98ea31bfa7B41473Bc034BCA56B659C11A3',
    uniswapV3Factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    deployBlock: parseInt(process.env.NEXT_PUBLIC_ETH_SEPOLIA_DEPLOY_BLOCK || '11168257', 10),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  // Legacy — not in the chain toggle; kept so saved scenes / localStorage still resolve.
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

// Base mainnet + Ethereum Sepolia (toggle reads BASE | ETHEREUM left-to-right).
export const SUPPORTED_CHAIN_IDS = [8453, 11155111];
export const DEFAULT_CHAIN_ID = 8453;

/** Hot-wallet addresses that pull funds from the vault during server-side execution. */
const EXECUTOR_ADDRESSES: Record<number, string> = {
  8453:
    process.env.NEXT_PUBLIC_BASE_EXECUTOR_ADDRESS?.trim() ||
    '0x5830A431E6866B8F8a605625b0713D8190FB06bA',
  11155111:
    process.env.NEXT_PUBLIC_ETH_SEPOLIA_EXECUTOR_ADDRESS?.trim() ||
    '0xc5b7b574EE84A9B59B475FE32Eaf908C246d3859',
};

/**
 * Recipient bound in the ZK withdraw proof for Pay & Run / builder strategies.
 * Must match the trade-executor wallet on that chain (funds land there, then swap → user).
 */
export function getZkWithdrawRecipient(chainId: number): string {
  const addr = EXECUTOR_ADDRESSES[chainId];
  if (!addr) {
    throw new Error(`No executor address configured for chain ${chainId}`);
  }
  return addr;
}

/** Labels for Pay & Run deposit / withdraw chain dropdowns. */
export const RUN_MODE_CHAIN_LABELS: string[] = [
  NETWORKS[11155111].name,
  NETWORKS[8453].name,
];

const RUN_MODE_CHAIN_ALIASES: Record<string, number> = {
  base: 8453,
  'ethereum sepolia': 11155111,
  sepolia: 11155111,
  ethereum: 11155111,
};

export function getRunModeChainLabel(chainId?: number): string {
  return getNetwork(chainId).name;
}

export function resolveRunModeChainId(label: string): number | null {
  const key = label.trim().toLowerCase();
  if (!key) return null;
  if (RUN_MODE_CHAIN_ALIASES[key] != null) return RUN_MODE_CHAIN_ALIASES[key];
  for (const id of SUPPORTED_CHAIN_IDS) {
    if (NETWORKS[id].name.toLowerCase() === key) return id;
  }
  return null;
}

/** Map builder / legacy labels (e.g. "Sepolia") to canonical run-mode names. */
export function normalizeRunModeChainLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return getRunModeChainLabel(getSelectedChainId());
  const id = resolveRunModeChainId(trimmed);
  return id != null ? NETWORKS[id].name : trimmed;
}

/** Run-summary label — clarifies mainnet vs testnet (e.g. Base → Base Mainnet). */
export function getRunModeChainDisplayLabel(label: string): string {
  const normalized = normalizeRunModeChainLabel(label);
  const id = resolveRunModeChainId(normalized);
  if (id === 8453) return "Base Mainnet";
  if (id === 11155111) return "Ethereum Sepolia";
  if (id === 84532) return "Base Sepolia";
  return normalized;
}

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
