// useUserLedger.ts - Hook for user ledger state management
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, SOLANA_RPC, getUserLedgerAddress } from '@/lib/constants';

export interface UserLedgerState {
  exists: boolean;
  loading: boolean;
  error: string | null;
}

export function useUserLedger(walletAddress: string | null) {
  const [state, setState] = useState<UserLedgerState>({
    exists: false,
    loading: false,
    error: null,
  });

  const checkLedgerExists = useCallback(async () => {
    if (!walletAddress) {
      setState({ exists: false, loading: false, error: null });
      return false;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      const userPubkey = new PublicKey(walletAddress);
      const ledgerPDA = getUserLedgerAddress(userPubkey, PROGRAM_ID);

      const accountInfo = await connection.getAccountInfo(ledgerPDA);
      const exists = accountInfo !== null;

      setState({ exists, loading: false, error: null });
      return exists;
    } catch (error) {
      console.error('Failed to check ledger existence:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState({ exists: false, loading: false, error: errorMessage });
      return false;
    }
  }, [walletAddress]);

  useEffect(() => {
    checkLedgerExists();
  }, [checkLedgerExists]);

  return {
    ...state,
    checkLedgerExists,
  };
}

