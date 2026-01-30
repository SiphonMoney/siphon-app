'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletInfo } from '@/lib/walletManager';

export default function ConnectButton({ className, onConnected }: { className?: string; onConnected?: (wallet: WalletInfo) => void }) {
  const { publicKey, connected, wallet } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const [balance, setBalance] = useState<number | null>(null);
  const lastAddressRef = useRef<string | null>(null);

  // Fetch balance when connected
  useEffect(() => {
    const fetchBalance = async () => {
      if (publicKey && connection) {
        try {
          const balanceResult = await connection.getBalance(publicKey);
          const solBalance = balanceResult / LAMPORTS_PER_SOL;
          setBalance(solBalance);
        } catch (error) {
          console.error('Failed to fetch Solana balance:', error);
          setBalance(null);
        }
      } else {
        setBalance(null);
      }
    };

    if (connected && publicKey) {
      fetchBalance();
      // Refresh balance every 10 seconds
      const interval = setInterval(fetchBalance, 10000);
      return () => clearInterval(interval);
    }
  }, [connected, publicKey, connection]);

  // Notify parent when connected - only once per address change
  useEffect(() => {
    const currentAddress = publicKey?.toBase58() || null;

    // Only notify if we have a new address that we haven't notified about
    if (connected && publicKey && currentAddress && currentAddress !== lastAddressRef.current) {
      lastAddressRef.current = currentAddress;

      const walletInfo: WalletInfo = {
        id: wallet?.adapter.name.toLowerCase() || 'solana',
        name: wallet?.adapter.name || 'Solana',
        address: currentAddress,
        chain: 'Solana',
        connected: true
      };

      onConnected?.(walletInfo);
      window.dispatchEvent(new Event('walletConnected'));
      // Persist wallet connection
      localStorage.setItem('siphon-connected-wallet', JSON.stringify(walletInfo));
    }

    // Reset when disconnected
    if (!connected) {
      lastAddressRef.current = null;
    }
  }, [connected, publicKey, wallet]); // Remove onConnected from deps to prevent infinite loop

  const handleConnect = () => {
    setVisible(true);
  };

  const handleDashboardClick = () => {
    // Trigger view mode change to userdash
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('userdash-view-change', { detail: 'userdash' }));
    }
  };

  if (connected && publicKey) {
    return (
      <div className={`wallet-container ${className || ''}`}>
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
              {balance !== null ? `${balance.toFixed(4)} SOL` : '0.0000 SOL'}
            </span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className={`wallet-selector ${className || ''}`}>
      <button
        className="wallet-selector-trigger"
        onClick={handleConnect}
      >
        <span className="wallet-icon"></span>
        <span className="wallet-text">Connect Wallet</span>
      </button>
    </div>
  );
}


