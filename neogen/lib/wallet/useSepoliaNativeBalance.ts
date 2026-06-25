"use client";

import { useEffect, useState } from "react";
import {
  createPublicClient,
  defineChain,
  formatEther,
  http,
} from "viem";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/wallet/chains";

const defaultRpc =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.trim() ||
  "https://sepolia.base.org";

const baseSepolia = defineChain({
  id: BASE_SEPOLIA_CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [defaultRpc] } },
});

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(defaultRpc),
});

/** Best-effort native ETH balance on Base Sepolia for display. */
export function useSepoliaNativeBalance(
  address: string | null,
  chainId: number | null,
) {
  const [balanceEth, setBalanceEth] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || chainId !== BASE_SEPOLIA_CHAIN_ID) {
      setBalanceEth(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    client
      .getBalance({ address: address as `0x${string}` })
      .then((wei) => {
        if (!cancelled) setBalanceEth(formatEther(wei));
      })
      .catch(() => {
        if (!cancelled) setBalanceEth(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return { balanceEth, loading };
}
