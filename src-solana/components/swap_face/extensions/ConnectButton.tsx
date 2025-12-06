'use client';

import { useState, useEffect, useRef } from 'react';
import WalletSelector from './WalletSelector';
import { walletManager, WalletInfo } from '../../../lib/walletManager';
import { Connection, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC } from '../../../lib/constants';

export default function ConnectButton({ className, onConnected }: { className?: string; onConnected?: (wallet: WalletInfo) => void }) {
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [currencyIndex, setCurrencyIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const currencies = ['SOL', 'ETH', 'BTC'];

  useEffect(() => {
    // Check for existing connections on mount
    const wallets = walletManager.getConnectedWallets();
    if (wallets.length > 0) {
      setConnectedWallet(wallets[0]);
    }
  }, []);

  useEffect(() => {
    // Fetch balance when wallet is connected
    const fetchBalance = async () => {
      if (connectedWallet && (connectedWallet.chain === 'Solana' || connectedWallet.id === 'phantom' || connectedWallet.id === 'solflare')) {
        try {
          const connection = new Connection(SOLANA_RPC, 'confirmed');
          const publicKey = new PublicKey(connectedWallet.address);
          const balance = await connection.getBalance(publicKey);
          setBalance(balance / 1e9); // Convert lamports to SOL
        } catch (error) {
          console.error('Failed to fetch balance:', error);
          setBalance(null);
        }
      } else if (connectedWallet && (connectedWallet.chain === 'EVM' || connectedWallet.id === 'metamask')) {
        // For MetaMask/EVM wallets, set a default balance to enable currency rotation
        // In the future, this could fetch actual ETH balance
        setBalance(0); // Set to 0 to enable rotation, or fetch actual balance
      } else {
        setBalance(null);
      }
    };

    if (connectedWallet) {
      fetchBalance();
      // Refresh balance every 10 seconds (only for Solana wallets)
      if (connectedWallet.chain === 'Solana' || connectedWallet.id === 'phantom' || connectedWallet.id === 'solflare') {
        const interval = setInterval(fetchBalance, 10000);
        return () => clearInterval(interval);
      }
    }
  }, [connectedWallet]);

  // Rotate currency every 3 seconds (works for all wallets)
  useEffect(() => {
    if (connectedWallet) {
      const interval = setInterval(() => {
        setCurrencyIndex((prev) => (prev + 1) % currencies.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [connectedWallet, currencies.length]);

  useEffect(() => {
    // Close menu when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleWalletSelect = async (walletId: string) => {
    try {
      console.log(`Attempting to connect ${walletId} wallet...`);
      const result = await walletManager.connectWallet(walletId);
      if (result.success && result.wallet) {
        console.log(`Successfully connected ${walletId} wallet:`, result.wallet);
        setConnectedWallet(result.wallet);
        onConnected?.(result.wallet);
        // Persist wallet connection
        localStorage.setItem('siphon-connected-wallet', JSON.stringify(result.wallet));
      } else {
        console.error(`Failed to connect ${walletId} wallet:`, result.error);
        // Show wallet-specific error message
        const walletName = walletId === 'phantom' ? 'Phantom' : 
                          walletId === 'solflare' ? 'Solflare' : 
                          walletId === 'metamask' ? 'MetaMask' : walletId;
        alert(`${walletName} connection failed: ${result.error}`);
      }
    } catch (error: unknown) {
      console.error(`Connection error for ${walletId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Connection error: ${errorMessage}`);
    }
  };

  const handleDisconnect = () => {
    if (connectedWallet) {
      console.log(`Disconnecting ${connectedWallet.id} wallet...`);
      walletManager.disconnectWallet(connectedWallet.id);
      setConnectedWallet(null);
      // Clear persisted wallet connection
      localStorage.removeItem('siphon-connected-wallet');
    }
  };

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };


  if (connectedWallet) {
    const currentCurrency = currencies[currencyIndex];
    return (
      <div className={`wallet-container ${className}`} ref={menuRef}>
        <div className="wallet-content-row">
          {/* Balance Display - on the left, always shown */}
          <div className="wallet-balance">
            {balance !== null ? `${balance.toFixed(4)} ${currentCurrency}` : `0.0000 ${currentCurrency}`}
          </div>
          
          {/* Profile Icon Button - on the right */}
          <button 
            className="wallet-profile-button"
            onClick={() => setShowMenu(!showMenu)}
            title="View wallet details"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="wallet-menu">
            <div className="wallet-menu-item">
              <span className="wallet-menu-label">Address</span>
              <span className="wallet-menu-value">{formatAddress(connectedWallet.address)}</span>
            </div>
            <div className="wallet-menu-divider"></div>
            <button 
              className="wallet-menu-item wallet-menu-disconnect"
              onClick={handleDisconnect}
            >
              <span className="disconnect-text">disconnect</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <WalletSelector 
      className={className}
      onWalletSelect={handleWalletSelect}
    />
  );
}
