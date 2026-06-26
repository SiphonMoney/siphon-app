// useBalance.ts - Hook for fetching encrypted balance
"use client";

import { useState, useCallback, useEffect } from 'react';

interface UseBalanceResult {
  balance: { 
    base_available: bigint;
    base_total: bigint;
    quote_available: bigint;
    quote_total: bigint;
  } | null;
  loading: boolean;
  error: string | null;
  refreshBalance: (privateKey: Uint8Array) => Promise<void>;
}

export function useBalance(_walletAddress: string): UseBalanceResult {
  const [balance, setBalance] = useState<{ 
    base_available: bigint;
    base_total: bigint;
    quote_available: bigint;
    quote_total: bigint;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async (_privateKey: Uint8Array) => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Fetch encrypted balance from backend and decrypt
      // For now, return mock balance
      setBalance({
        base_available: BigInt(0),
        base_total: BigInt(0),
        quote_available: BigInt(0),
        quote_total: BigInt(0)
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load - only once on mount
  useEffect(() => {
    refreshBalance(new Uint8Array(32));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    balance,
    loading,
    error,
    refreshBalance
  };
}
