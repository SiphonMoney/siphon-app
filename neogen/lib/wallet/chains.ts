/** Base mainnet chain id — default for wallet connect and in-chat execution. */
export const BASE_CHAIN_ID = 8453;
/** Default EVM chain when none is selected. */
export const DEFAULT_EVM_CHAIN_ID = BASE_CHAIN_ID;
/** Base Sepolia testnet — same L2 family as Base mainnet. */
export const BASE_SEPOLIA_CHAIN_ID = 84_532;

/** Synthetic ids for Solana clusters in wallet UI / balance widget `chain_id`. */
export const SOLANA_MAINNET_CHAIN_CODE = 9_001;
export const SOLANA_DEVNET_CHAIN_CODE = 9_002;

export type SolanaCluster = "mainnet-beta" | "devnet";

export function chainCodeToSolanaCluster(
  code: number | null | undefined,
): SolanaCluster | null {
  if (code === SOLANA_MAINNET_CHAIN_CODE) return "mainnet-beta";
  if (code === SOLANA_DEVNET_CHAIN_CODE) return "devnet";
  return null;
}

export function solanaClusterToChainCode(cluster: SolanaCluster): number {
  return cluster === "mainnet-beta"
    ? SOLANA_MAINNET_CHAIN_CODE
    : SOLANA_DEVNET_CHAIN_CODE;
}

export function isSolanaChainCode(code: number | null | undefined): boolean {
  return (
    code === SOLANA_MAINNET_CHAIN_CODE || code === SOLANA_DEVNET_CHAIN_CODE
  );
}

export const SOLANA_CLUSTER_LABEL: Record<SolanaCluster, string> = {
  "mainnet-beta": "Solana",
  devnet: "Solana Devnet",
};

export const SUPPORTED_CHAIN_IDS = [
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export type ChainMeta = {
  id: SupportedChainId;
  hexChainId: string;
  label: string;
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

export const CHAIN_META: Record<SupportedChainId, ChainMeta> = {
  [BASE_CHAIN_ID]: {
    id: BASE_CHAIN_ID,
    hexChainId: "0x2105",
    label: "Base",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  },
  [BASE_SEPOLIA_CHAIN_ID]: {
    id: BASE_SEPOLIA_CHAIN_ID,
    hexChainId: "0x14a34",
    label: "Base Sepolia",
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
  },
};
