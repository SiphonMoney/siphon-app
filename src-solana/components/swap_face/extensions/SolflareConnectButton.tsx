'use client';

import { useState, useEffect } from 'react';
import { walletManager, WalletInfo } from '../../../lib/walletManager';

interface SolflareConnectButtonProps {
  onWalletConnected?: (wallet: WalletInfo) => void;
  className?: string;
}

export default function SolflareConnectButton({ onWalletConnected, className }: SolflareConnectButtonProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if wallet is already connected
    const connectedWallet = walletManager.getWallet('solflare');
    if (connectedWallet) {
      setIsConnected(true);
      setWalletInfo(connectedWallet);
    }
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const result = await walletManager.connectWallet('solflare');
      
      if (result.success && result.wallet) {
        setIsConnected(true);
        setWalletInfo(result.wallet);
        onWalletConnected?.(result.wallet);
      } else {
        setError(result.error || 'Failed to connect wallet');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    walletManager.disconnectWallet('solflare');
    setIsConnected(false);
    setWalletInfo(null);
    setError(null);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <div className={`solflare-connect-button ${className}`}>
      {!isConnected ? (
        <button 
          className="connect-btn"
          onClick={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <div className="loading-content">
              <div className="spinner"></div>
              <span>Connecting...</span>
            </div>
          ) : (
            <>
              <span className="wallet-icon">🔥</span>
              <span>Connect Solflare</span>
            </>
          )}
        </button>
      ) : (
        <div className="connected-wallet">
          <div className="wallet-info">
            <span className="wallet-icon">🔥</span>
            <div className="wallet-details">
              <span className="wallet-name">Solflare</span>
              <span className="wallet-address">
                {walletInfo ? formatAddress(walletInfo.address) : ''}
              </span>
            </div>
          </div>
          <button 
            className="disconnect-btn"
            onClick={handleDisconnect}
            title="Disconnect wallet"
          >
            ✕
          </button>
        </div>
      )}
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
}
