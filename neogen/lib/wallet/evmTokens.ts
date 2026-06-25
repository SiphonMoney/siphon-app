import {
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  type SupportedChainId,
} from "@/lib/wallet/chains";

export const NATIVE_ETH_PLACEHOLDER =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const BASE_MAINNET_TOKENS: Record<string, string> = {
  ETH: NATIVE_ETH_PLACEHOLDER,
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  DAI: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
};

const BASE_SEPOLIA_TOKENS: Record<string, string> = {
  ETH: NATIVE_ETH_PLACEHOLDER,
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export const EVM_TOKENS_BY_CHAIN: Record<SupportedChainId, Record<string, string>> =
  {
    [BASE_CHAIN_ID]: BASE_MAINNET_TOKENS,
    [BASE_SEPOLIA_CHAIN_ID]: BASE_SEPOLIA_TOKENS,
  };

export const TOKEN_DECIMALS_BY_SYMBOL: Record<string, number> = {
  ETH: 18,
  WETH: 18,
  USDC: 6,
  USDT: 6,
  DAI: 18,
};

export function isSupportedEvmChain(
  chainId: number | null | undefined,
): chainId is SupportedChainId {
  return chainId === BASE_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID;
}

export function resolveEvmChainId(
  chainId: number | null | undefined,
): SupportedChainId {
  return isSupportedEvmChain(chainId) ? chainId : BASE_CHAIN_ID;
}
