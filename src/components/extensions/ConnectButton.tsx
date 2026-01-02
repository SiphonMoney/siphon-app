'use client';

import { useState, useEffect, useRef } from 'react';
import WalletSelector from './WalletSelector';
import { walletManager, WalletInfo } from './walletManager';
import { initializeWithProvider, deinit, getSiphonVaultTotalBalance, TOKEN_MAP } from '../../lib/nexus';

export default function ConnectButton({ className, onConnected }: { className?: string; onConnected?: (wallet: WalletInfo) => void }) {
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [shouldOpenSelector, setShouldOpenSelector] = useState(false);
  
  useEffect(() => {
    // Check for existing connections on mount
    const wallets = walletManager.getConnectedWallets();
    if (wallets.length > 0) {
      const wallet = wallets[0];
      setConnectedWallet(wallet);
    } else {
      // Also check localStorage
      try {
        const storedWallet = localStorage.getItem('siphon-connected-wallet');
        if (storedWallet) {
          const wallet = JSON.parse(storedWallet);
          if (wallet && wallet.address) {
            setConnectedWallet(wallet);
          }
        }
      } catch (error) {
        console.error('Error reading wallet from localStorage:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Listen for wallet connection/disconnection events
    const handleWalletConnected = () => {
      const wallets = walletManager.getConnectedWallets();
      if (wallets.length > 0) {
        setConnectedWallet(wallets[0]);
      } else {
        // Check localStorage
        try {
          const storedWallet = localStorage.getItem('siphon-connected-wallet');
          if (storedWallet) {
            const wallet = JSON.parse(storedWallet);
            if (wallet && wallet.address) {
              setConnectedWallet(wallet);
            }
          }
        } catch (error) {
          console.error('Error reading wallet from localStorage:', error);
        }
      }
    };

    const handleWalletDisconnected = () => {
      setConnectedWallet(null);
      setBalance(null);
    };

    const handleTriggerConnection = () => {
      if (!connectedWallet) {
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
  }, [connectedWallet]);

  useEffect(() => {
    // Fetch Siphon Vault balance when wallet is connected
    const fetchBalance = () => {
      if (connectedWallet && connectedWallet.id === 'metamask') {
        try {
          const VAULT_CHAIN_ID = 11155111; // Sepolia id
          const { details } = getSiphonVaultTotalBalance(VAULT_CHAIN_ID, TOKEN_MAP);
          
          // Get ETH balance from Siphon Vault (case-insensitive lookup)
          const ethKey = Object.keys(details).find(key => key.toUpperCase() === 'ETH');
          const ethBalance = ethKey ? details[ethKey] : 0;
          setBalance(ethBalance);
        } catch (error) {
          console.error('Failed to fetch Siphon Vault balance:', error);
          setBalance(0);
        }
      } else {
        setBalance(null);
      }
    };

    if (connectedWallet) {
      fetchBalance();
      // Refresh balance every 10 seconds
      const interval = setInterval(fetchBalance, 10000);
      return () => clearInterval(interval);
    }
  }, [connectedWallet]);



  const handleWalletSelect = async (walletId: string) => {
    try {
      console.log(`Attempting to connect ${walletId} wallet...`);
      const result = await walletManager.connectWallet(walletId);
      if (result.success && result.wallet) {
        console.log(`Successfully connected ${walletId} wallet:`, result.wallet);
        setConnectedWallet(result.wallet);
        onConnected?.(result.wallet);
        window.dispatchEvent(new Event('walletConnected'));
        if (!window.ethereum) {
        throw new Error('No Ethereum provider found');
        }
        await initializeWithProvider(window.ethereum);
        // Persist wallet connection
        localStorage.setItem('siphon-connected-wallet', JSON.stringify(result.wallet));
      } else {
        console.error(`Failed to connect ${walletId} wallet:`, result.error);
        alert(`MetaMask connection failed: ${result.error}`);
      }
    } catch (error: unknown) {
      console.error(`Connection error for ${walletId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Connection error: ${errorMessage}`);
    }
  };

  const handleDashboardClick = () => {
    // Trigger view mode change to userdash
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('userdash-view-change', { detail: 'userdash' }));
    }
  };

  if (connectedWallet) {
    return (
      <div className={`wallet-container ${className}`}>
        <button 
          className="wallet-connected-button"
          onClick={handleDashboardClick}
          title="Open dashboard"
        >
          {/* Wallet Icon and Balance in the same block */}
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
