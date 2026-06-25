"use client";

import { useEffect, useState } from "react";
import {
  chainCodeToSolanaCluster,
  isSolanaChainCode,
} from "@/lib/wallet/chains";
import { fetchUsdcUiAmount } from "@/lib/wallet/solanaBalances";

/** USDC UI amount as string for `WalletBalancePanel`, or null. */
export function useSolanaSplUsdc(
  address: string | null,
  chainId: number | null,
): string | null {
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!address || chainId == null || !isSolanaChainCode(chainId)) {
      setBalance(null);
      return;
    }
    const cluster = chainCodeToSolanaCluster(chainId);
    if (!cluster) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void fetchUsdcUiAmount(address, cluster).then((v) => {
      if (cancelled) return;
      if (v == null || !Number.isFinite(v)) setBalance(null);
      else setBalance(String(v));
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return balance;
}
