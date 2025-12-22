'use client';

import { useState, useEffect } from 'react';
import { walletManager, WalletInfo } from '../../extensions/walletManager';
import { formatEther } from 'viem';
import './UserDash.css';

interface UserDashProps {
  isLoaded?: boolean;
}

export default function UserDash({ isLoaded = true }: UserDashProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [siphonBalance] = useState<number>(0); // Placeholder for now

  useEffect(() => {
    const checkWallet = async () => {
      try {
        const wallets = walletManager.getConnectedWallets();
        const metamaskWallet = wallets.find(w => w.id === 'metamask');
        
        if (metamaskWallet) {
          setWallet(metamaskWallet);
          
          // Fetch wallet balance
          const eth = (window as Window & { ethereum?: unknown })?.ethereum;
          if (eth) {
            const ethereum = eth as {
              request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
            };
            const balanceHex = await ethereum.request({
              method: 'eth_getBalance',
              params: [metamaskWallet.address, 'latest'],
            }) as string;
            const balanceWei = BigInt(balanceHex);
            const balanceEth = parseFloat(formatEther(balanceWei));
            setWalletBalance(balanceEth);
          }
        }
      } catch (error) {
        console.error('Error fetching wallet data:', error);
      }
    };

    checkWallet();
    
    // Refresh wallet balance every 10 seconds
    const interval = setInterval(async () => {
      if (wallet) {
        try {
          const eth = (window as Window & { ethereum?: unknown })?.ethereum;
          if (eth) {
            const ethereum = eth as {
              request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
            };
            const balanceHex = await ethereum.request({
              method: 'eth_getBalance',
              params: [wallet.address, 'latest'],
            }) as string;
            const balanceWei = BigInt(balanceHex);
            const balanceEth = parseFloat(formatEther(balanceWei));
            setWalletBalance(balanceEth);
          }
        } catch (error) {
          console.error('Error refreshing balance:', error);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [wallet]);

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleDeposit = () => {
    // Mock action - will be implemented later
    alert('Deposit functionality coming soon! Funds will be sent to Siphon contract.');
  };

  const handleWithdraw = () => {
    // Mock action - will be implemented later
    alert('Withdraw functionality coming soon!');
  };

  if (!wallet) {
    return (
      <div className={`userdash-view ${isLoaded ? 'loaded' : ''}`}>
        <div className="userdash-content-wrapper">
          <div className="userdash-empty-state">
            <h2>No MetaMask Wallet Connected</h2>
            <p>Please connect your MetaMask wallet to view your dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`userdash-view ${isLoaded ? 'loaded' : ''}`}>
      <div className="userdash-content-wrapper">
        <div className="userdash-header">
          <h1 className="userdash-title">User Dashboard</h1>
          <div className="userdash-address">
            <span className="userdash-address-label">Address:</span>
            <span className="userdash-address-value">{formatAddress(wallet.address)}</span>
            <button
              className="userdash-copy-button"
              onClick={() => {
                navigator.clipboard.writeText(wallet.address);
                alert('Address copied to clipboard!');
              }}
              title="Copy address"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>

        <div className="userdash-balances">
          <div className="userdash-balance-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">Wallet Balance</h2>
              <span className="userdash-balance-network">Sepolia</span>
            </div>
            <div className="userdash-balance-content">
              {walletBalance !== null ? (
                <>
                  <div className="userdash-balance-amount">
                    {walletBalance.toFixed(6)}
                  </div>
                  <div className="userdash-balance-currency">ETH</div>
                </>
              ) : (
                <div className="userdash-balance-loading">Loading...</div>
              )}
            </div>
            <div className="userdash-balance-description">
              Your ETH balance on Sepolia network
            </div>
          </div>

          <div className="userdash-balance-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">Siphon Balance</h2>
              <span className="userdash-balance-network">Sepolia</span>
            </div>
            <div className="userdash-balance-content">
              <div className="userdash-balance-amount">
                {siphonBalance.toFixed(6)}
              </div>
              <div className="userdash-balance-currency">ETH</div>
            </div>
            <div className="userdash-balance-description">
              Funds deposited to Siphon contract
            </div>
          </div>
        </div>

        <div className="userdash-actions">
          <button
            className="userdash-action-button"
            onClick={handleDeposit}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7-7 7 7" />
            </svg>
            Deposit
          </button>
          <button
            className="userdash-action-button"
            onClick={handleWithdraw}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7 7 7-7" />
            </svg>
            Withdraw
          </button>
        </div>
      </div>
    </div>
  );
}

