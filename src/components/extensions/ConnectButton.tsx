'use client';

import { useState, useEffect, useRef } from 'react';
import WalletSelector from './WalletSelector';
import { walletManager, WalletInfo } from './walletManager';
import { formatEther } from 'viem';
import { initializeWithProvider, deinit } from '../../lib/nexus';

export default function ConnectButton({ className, onConnected }: { className?: string; onConnected?: (wallet: WalletInfo) => void }) {
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Check for existing connections on mount
    const wallets = walletManager.getConnectedWallets();
    if (wallets.length > 0) {
      const wallet = wallets[0];
      setConnectedWallet(wallet);
    }
  }, []);

  useEffect(() => {
    // Fetch balance when wallet is connected
    const fetchBalance = async () => {
      if (connectedWallet && connectedWallet.id === 'metamask') {
        // Fetch ETH balance
        try {
          const eth = (window as Window & { ethereum?: unknown })?.ethereum;
          if (eth) {
            const ethereum = eth as {
              request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
            };
            const balanceHex = await ethereum.request({
              method: 'eth_getBalance',
              params: [connectedWallet.address, 'latest'],
            }) as string;
            const balanceWei = BigInt(balanceHex);
            const balanceEth = parseFloat(formatEther(balanceWei));
            setBalance(balanceEth);
          } else {
            setBalance(0);
          }
        } catch (error) {
          console.error('Failed to fetch ETH balance:', error);
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
        window.dispatchEvent(new Event('walletConnected'));
        await initializeWithProvider((window as any).ethereum);
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

  const handleDisconnect = () => {
    if (connectedWallet) {
      console.log(`Disconnecting ${connectedWallet.id} wallet...`);
      walletManager.disconnectWallet(connectedWallet.id);
      setConnectedWallet(null);
      window.dispatchEvent(new Event('walletDisconnected'));
      deinit();
      // Clear persisted wallet connection
      localStorage.removeItem('siphon-connected-wallet');
    }
  };

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };


  const handleBalanceClick = () => {
    // Trigger view mode change to userdash
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('userdash-view-change', { detail: 'userdash' }));
    }
  };

  if (connectedWallet) {
    return (
      <div className={`wallet-container ${className}`} ref={menuRef}>
        <div className="wallet-content-row">
          {/* Balance Display - on the left, always shown, clickable for MetaMask */}
          <div 
            className="wallet-balance wallet-balance-clickable"
            onClick={handleBalanceClick}
            style={{ cursor: 'pointer' }}
          >
            {balance !== null ? `${balance.toFixed(4)} ETH` : `0.0000 ETH`}
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
