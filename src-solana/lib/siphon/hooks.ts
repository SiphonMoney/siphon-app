'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { SiphonClient, VaultInfo, ConfigInfo } from './client';
import { SUPPORTED_TOKENS } from './constants';

interface UseSiphonState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  config: ConfigInfo | null;
  vaults: Map<string, VaultInfo>;
}

interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export function useSiphon() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();

  const [state, setState] = useState<UseSiphonState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    config: null,
    vaults: new Map(),
  });

  // Create client
  const client = useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    return new SiphonClient(provider);
  }, [connection, wallet]);

  // Initialize and fetch config
  useEffect(() => {
    const init = async () => {
      if (!client || !connected) {
        setState((prev) => ({ ...prev, isInitialized: false }));
        return;
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        const config = await client.getConfig();
        setState((prev) => ({
          ...prev,
          isInitialized: true,
          isLoading: false,
          config,
        }));
      } catch (error) {
        console.error('Failed to initialize Siphon client:', error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to initialize',
        }));
      }
    };

    init();
  }, [client, connected]);

  // Fetch vault for a specific token
  const fetchVault = useCallback(
    async (assetMint: PublicKey): Promise<VaultInfo | null> => {
      if (!client || !publicKey) return null;

      try {
        const vault = await client.getVault(publicKey, assetMint);
        if (vault) {
          setState((prev) => {
            const newVaults = new Map(prev.vaults);
            newVaults.set(assetMint.toBase58(), vault);
            return { ...prev, vaults: newVaults };
          });
        }
        return vault;
      } catch (error) {
        console.error('Failed to fetch vault:', error);
        return null;
      }
    },
    [client, publicKey]
  );

  // Refresh all vaults
  const refreshVaults = useCallback(async () => {
    if (!client || !publicKey) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const newVaults = new Map<string, VaultInfo>();

      for (const token of Object.values(SUPPORTED_TOKENS)) {
        const vault = await client.getVault(publicKey, token.mint);
        if (vault) {
          newVaults.set(token.mint.toBase58(), vault);
        }
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        vaults: newVaults,
      }));
    } catch (error) {
      console.error('Failed to refresh vaults:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh',
      }));
    }
  }, [client, publicKey]);

  // Create vault
  const createVault = useCallback(
    async (assetMint: PublicKey): Promise<TransactionResult> => {
      if (!client) {
        return { success: false, error: 'Client not initialized' };
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        const signature = await client.createVault(assetMint);
        await fetchVault(assetMint);
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: true, signature };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Create vault failed';
        setState((prev) => ({ ...prev, isLoading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },
    [client, fetchVault]
  );

  // Deposit
  const deposit = useCallback(
    async (assetMint: PublicKey, amount: number): Promise<TransactionResult> => {
      if (!client) {
        return { success: false, error: 'Client not initialized' };
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Find token decimals
        const token = Object.values(SUPPORTED_TOKENS).find(
          (t) => t.mint.equals(assetMint)
        );
        const decimals = token?.decimals ?? 9;

        // Convert to lamports/smallest unit
        const amountBN = new BN(amount * Math.pow(10, decimals));

        const signature = await client.deposit(assetMint, amountBN);
        await fetchVault(assetMint);
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: true, signature };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Deposit failed';
        setState((prev) => ({ ...prev, isLoading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },
    [client, fetchVault]
  );

  // Withdraw (direct)
  const withdraw = useCallback(
    async (assetMint: PublicKey, amount: number): Promise<TransactionResult> => {
      if (!client) {
        return { success: false, error: 'Client not initialized' };
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Find token decimals
        const token = Object.values(SUPPORTED_TOKENS).find(
          (t) => t.mint.equals(assetMint)
        );
        const decimals = token?.decimals ?? 9;

        // Convert to lamports/smallest unit
        const amountBN = new BN(amount * Math.pow(10, decimals));

        const signature = await client.withdrawDirect(assetMint, amountBN);
        await fetchVault(assetMint);
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: true, signature };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Withdraw failed';
        setState((prev) => ({ ...prev, isLoading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },
    [client, fetchVault]
  );

  // Get vault balance for a token
  const getVaultBalance = useCallback(
    (assetMint: PublicKey): number => {
      const vault = state.vaults.get(assetMint.toBase58());
      if (!vault) return 0;

      const token = Object.values(SUPPORTED_TOKENS).find(
        (t) => t.mint.equals(assetMint)
      );
      const decimals = token?.decimals ?? 9;

      return vault.amount.toNumber() / Math.pow(10, decimals);
    },
    [state.vaults]
  );

  return {
    // State
    isInitialized: state.isInitialized,
    isLoading: state.isLoading,
    error: state.error,
    config: state.config,
    vaults: state.vaults,
    client,

    // Actions
    refreshVaults,
    fetchVault,
    createVault,
    deposit,
    withdraw,
    getVaultBalance,
  };
}

// Hook for just vault balances
export function useSiphonBalances() {
  const { vaults, refreshVaults, isLoading, getVaultBalance } = useSiphon();

  return {
    vaults,
    refreshVaults,
    isLoading,
    getVaultBalance,
  };
}
