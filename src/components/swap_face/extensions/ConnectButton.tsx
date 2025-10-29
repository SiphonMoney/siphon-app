'use client';

import { useState, useEffect } from 'react';
import WalletSelector from './WalletSelector';
import { walletManager, WalletInfo } from '../../../lib/walletManager';

export default function ConnectButton({ className, onConnected }: { className?: string; onConnected?: (wallet: WalletInfo) => void }) {
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);

  useEffect(() => {
    // Check for existing connections on mount
    const wallets = walletManager.getConnectedWallets();
    if (wallets.length > 0) {
      setConnectedWallet(wallets[0]);
    }
  }, []);

  const handleWalletSelect = async (walletId: string) => {
    try {
      console.log(`Attempting to connect ${walletId} wallet...`);
      const result = await walletManager.connectWallet(walletId);
      if (result.success && result.wallet) {
        console.log(`Successfully connected ${walletId} wallet:`, result.wallet);
        setConnectedWallet(result.wallet);
        onConnected?.(result.wallet);
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

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (connectedWallet) {
    return (
      <div className={`connected-wallet ${className}`}>
        <div className="wallet-info">
          <span className="wallet-icon">
            {connectedWallet.id === 'metamask' ? 'MM' : 
             connectedWallet.id === 'solana' ? 'SOL' :
             connectedWallet.id === 'phantom' ? 'PH' :
             connectedWallet.id === 'solflare' ? 'SF' :
             connectedWallet.id === 'bitcoin' ? 'BTC' : 'XMR'}
          </span>
          <div className="wallet-details">
            <span className="wallet-name">{connectedWallet.name}</span>
            <span className="wallet-address">{formatAddress(connectedWallet.address)}</span>
          </div>
        </div>
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
