'use client';

import { useState, useCallback, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';

import {
  PrivateBalance,
  PrivateBalanceSPL,
  TransactionResult,
  TOKEN_MINTS,
} from './types';

interface NoirZkState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  solBalance: PrivateBalance;
  usdcBalance: PrivateBalanceSPL | null;
}

// Main hook for Noir ZK privacy operations
// Uses Next.js API routes which coordinate with the Noir relayer server-side
export function useNoirZk() {
  const [state, setState] = useState<NoirZkState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    solBalance: { lamports: 0 },
    usdcBalance: null,
  });

  // Check if API is available on mount
  useEffect(() => {
    const checkInitialization = async () => {
      try {
        const res = await fetch('/api/noir-zk/balance?tokenType=SOL');
        if (res.ok) {
          setState(prev => ({ ...prev, isInitialized: true, error: null }));
        }
      } catch {
        // API not ready yet, will initialize on first call
      }
    };
    checkInitialization();
  }, []);

  const refreshBalances = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch('/api/noir-zk/balance?tokenType=all');
      const data = await res.json();

      if (data.success && data.balances) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isInitialized: true,
          error: null,
          solBalance: { lamports: data.balances.SOL.lamports },
          usdcBalance: data.balances.USDC ? {
            amount: data.balances.USDC.amount,
            mintAddress: TOKEN_MINTS.USDC,
          } : null,
        }));
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: data.error || 'Failed to fetch balances',
        }));
      }
    } catch (error) {
      console.error('[Noir ZK] Failed to refresh balances:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balances',
      }));
    }
  }, []);

  const depositSOL = useCallback(
    async (lamports: number): Promise<TransactionResult> => {
      console.log('[Noir ZK] Depositing SOL via API:', lamports);
      try {
        const res = await fetch('/api/noir-zk/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenType: 'SOL', amount: lamports }),
        });
        const result = await res.json();
        if (result.success) {
          refreshBalances();
        }
        return result;
      } catch (error) {
        console.error('[Noir ZK] Deposit SOL error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Deposit failed',
        };
      }
    },
    [refreshBalances]
  );

  const withdrawSOL = useCallback(
    async (lamports: number, recipientAddress: string): Promise<TransactionResult> => {
      console.log('[Noir ZK] Withdrawing SOL via API:', lamports, 'to', recipientAddress);
      try {
        const res = await fetch('/api/noir-zk/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenType: 'SOL', amount: lamports, recipientAddress }),
        });
        const result = await res.json();
        if (result.success) {
          refreshBalances();
        }
        return result;
      } catch (error) {
        console.error('[Noir ZK] Withdraw SOL error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Withdraw failed',
        };
      }
    },
    [refreshBalances]
  );

  const depositSPL = useCallback(
    async (amount: number, mintAddress: PublicKey): Promise<TransactionResult> => {
      let tokenType: string;
      if (mintAddress.equals(TOKEN_MINTS.USDC)) {
        tokenType = 'USDC';
      } else if (mintAddress.equals(TOKEN_MINTS.USDT)) {
        tokenType = 'USDT';
      } else {
        return { success: false, error: 'Unsupported token mint' };
      }

      console.log(`[Noir ZK] Depositing ${tokenType} via API:`, amount);
      try {
        const res = await fetch('/api/noir-zk/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenType, amount }),
        });
        const result = await res.json();
        if (result.success) {
          refreshBalances();
        }
        return result;
      } catch (error) {
        console.error(`[Noir ZK] Deposit ${tokenType} error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Deposit failed',
        };
      }
    },
    [refreshBalances]
  );

  const withdrawSPL = useCallback(
    async (
      amount: number,
      mintAddress: PublicKey,
      recipientAddress: string
    ): Promise<TransactionResult> => {
      let tokenType: string;
      if (mintAddress.equals(TOKEN_MINTS.USDC)) {
        tokenType = 'USDC';
      } else if (mintAddress.equals(TOKEN_MINTS.USDT)) {
        tokenType = 'USDT';
      } else {
        return { success: false, error: 'Unsupported token mint' };
      }

      console.log(`[Noir ZK] Withdrawing ${tokenType} via API:`, amount, 'to', recipientAddress);
      try {
        const res = await fetch('/api/noir-zk/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenType, amount, recipientAddress }),
        });
        const result = await res.json();
        if (result.success) {
          refreshBalances();
        }
        return result;
      } catch (error) {
        console.error(`[Noir ZK] Withdraw ${tokenType} error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Withdraw failed',
        };
      }
    },
    [refreshBalances]
  );

  const depositUSDC = useCallback(
    (amount: number) => depositSPL(amount, TOKEN_MINTS.USDC),
    [depositSPL]
  );

  const withdrawUSDC = useCallback(
    (amount: number, recipientAddress: string) =>
      withdrawSPL(amount, TOKEN_MINTS.USDC, recipientAddress),
    [withdrawSPL]
  );

  return {
    isInitialized: state.isInitialized,
    isLoading: state.isLoading,
    error: state.error,
    solBalance: state.solBalance,
    usdcBalance: state.usdcBalance,

    refreshBalances,
    depositSOL,
    withdrawSOL,
    depositSPL,
    withdrawSPL,
    depositUSDC,
    withdrawUSDC,
  };
}

export function usePrivateBalances() {
  const { solBalance, usdcBalance, refreshBalances, isLoading } = useNoirZk();
  return {
    solBalance,
    usdcBalance,
    refreshBalances,
    isLoading,
  };
}
