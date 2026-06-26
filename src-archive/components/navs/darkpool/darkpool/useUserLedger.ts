// useUserLedger.ts - Hook for checking if user ledger exists
"use client";

import { useState, useEffect, useCallback } from 'react';

interface UseUserLedgerResult {
  exists: boolean;
  loading: boolean;
  checkLedgerExists: () => void;
}

export function useUserLedger(walletAddress: string | null): UseUserLedgerResult {
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkLedgerExists = useCallback(async () => {
    if (!walletAddress) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // TODO: Check if ledger exists on-chain
      // For now, check localStorage as a simple check
      const ledgerKey = `darkpool-ledger-${walletAddress}`;
      const stored = localStorage.getItem(ledgerKey);
      setExists(!!stored);
    } catch (error) {
      console.error('Error checking ledger:', error);
      setExists(false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    checkLedgerExists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]); // Only check when walletAddress changes

  return {
    exists,
    loading,
    checkLedgerExists
  };
}
