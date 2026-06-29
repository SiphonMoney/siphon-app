'use client';

import { useState, useEffect, useCallback } from 'react';
import WalletSelector from './WalletSelector';
import { walletManager, WalletInfo } from './walletManager';
import { showAppToast } from '@/lib/appToast';
import { initializeWithProvider, deinit, TOKEN_MAP, refreshProvider, isInitialized } from '../../lib/nexus';
import { getSpendableVaultBalance } from '../../lib/zkHandler';
import { getSelectedChainId } from '../../lib/networks';

export default function ConnectButton({ className, onConnected }: { className?: string; onConnected?: (wallet: WalletInfo) => void }) {
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [shouldOpenSelector, setShouldOpenSelector] = useState(false);

  const syncConnectedWallet = useCallback(async () => {
    const restored = await walletManager.restorePersistedSession();
    const wallet = restored ?? walletManager.getPrimaryWallet() ?? null;
    setConnectedWallet(wallet);
    return wallet;
  }, []);
  
  useEffect(() => {
    void syncConnectedWallet();
  }, [syncConnectedWallet]);

  useEffect(() => {
    const handleWalletConnected = () => {
      void syncConnectedWallet();
    };

    const handleWalletDisconnected = () => {
      setConnectedWallet(null);
      setBalance(null);
    };

    const handleTriggerConnection = () => {
      if (!walletManager.hasActiveSession()) {
        setShouldOpenSelector(true);
      }
    };

    window.addEventListener('walletConnected', handleWalletConnected);
    window.addEventListener('walletDisconnected', handleWalletDisconnected);
    window.addEventListener('triggerWalletConnection', handleTriggerConnection);

    return () => {
      window.removeEventListener('walletConnected', handleWalletConnected);
      window.removeEventListener('walletDisconnected', handleWalletDisconnected);
      window.removeEventListener('triggerWalletConnection', handleTriggerConnection);
    };
  }, [syncConnectedWallet]);

  useEffect(() => {
    // Fetch private vault balance when wallet is connected
    const fetchBalance = async () => {
      if (connectedWallet && connectedWallet.id === 'metamask') {
        try {
          const VAULT_CHAIN_ID = getSelectedChainId();
          const { details } = await getSpendableVaultBalance(VAULT_CHAIN_ID, TOKEN_MAP);

          const ethKey = Object.keys(details).find(key => key.toUpperCase() === 'ETH');
          const ethBalance = ethKey ? details[ethKey] : 0;
          setBalance(ethBalance);
        } catch (error) {
          console.error('Failed to fetch private balance:', error);
          setBalance(0);
        }
      } else {
        setBalance(null);
      }
    };

    if (connectedWallet) {
      fetchBalance();
      // Refresh balance every 30 seconds (on-chain reconcile; leaf scan cached 3 min)
      const interval = setInterval(fetchBalance, 60_000);
      return () => clearInterval(interval);
    }
  }, [connectedWallet]);

  useEffect(() => {
    const onChainChanged = async () => {
      if (connectedWallet?.id !== 'metamask') return;
      const chainId = getSelectedChainId();
      try {
        if (window.ethereum) {
          if (isInitialized()) {
            await refreshProvider(window.ethereum);
          } else {
            await initializeWithProvider(window.ethereum);
          }
        }
        const { details } = await getSpendableVaultBalance(chainId, TOKEN_MAP);
        const ethKey = Object.keys(details).find((key) => key.toUpperCase() === 'ETH');
        setBalance(ethKey ? details[ethKey] : 0);
      } catch {
        setBalance(0);
      }
    };
    window.addEventListener('siphon:chainChanged', onChainChanged);
    window.addEventListener('siphon:walletChainChanged', onChainChanged);
    window.addEventListener('siphon:networkReady', onChainChanged);
    return () => {
      window.removeEventListener('siphon:chainChanged', onChainChanged);
      window.removeEventListener('siphon:walletChainChanged', onChainChanged);
      window.removeEventListener('siphon:networkReady', onChainChanged);
    };
  }, [connectedWallet]);



  const handleWalletSelect = async (walletId: string) => {
    try {
      console.log(`Attempting to connect ${walletId} wallet...`);
      const result = await walletManager.connectWallet(walletId);
      if (result.success && result.wallet) {
        console.log(`Successfully connected ${walletId} wallet:`, result.wallet);
        setConnectedWallet(result.wallet);
        onConnected?.(result.wallet);
        if (window.ethereum) {
          await initializeWithProvider(window.ethereum);
        }
        walletManager.persistWallet(result.wallet);
        window.dispatchEvent(new Event('walletConnected'));
      } else {
        console.error(`Failed to connect ${walletId} wallet:`, result.error);
        showAppToast(`MetaMask connection failed: ${result.error}`, 'error');
      }
    } catch (error: unknown) {
      console.error(`Connection error for ${walletId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showAppToast(`Connection error: ${errorMessage}`, 'error');
    }
  };

  const handleDashboardClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('userdash-view-change', { detail: 'userdash' }));
      window.dispatchEvent(new CustomEvent('pro-view-mode-change', { detail: 'userdash' }));
    }
  };

  if (connectedWallet) {
    return (
      <div className={`wallet-container ${className ?? ""}`}>
        <button 
          className="wallet-connected-button"
          onClick={handleDashboardClick}
          title="Open dashboard"
        >
          <div className="wallet-info-block">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12v-2a5 5 0 0 0-5-5H8a5 5 0 0 0-5 5v2" />
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6" />
            </svg>
            <span className="wallet-balance-text">
              {balance !== null ? `${balance.toFixed(4)} ETH` : `0.0000 ETH`}
            </span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <WalletSelector 
      className={className}
      onWalletSelect={handleWalletSelect}
      shouldOpen={shouldOpenSelector}
      onOpenChange={setShouldOpenSelector}
    />
  );
}
