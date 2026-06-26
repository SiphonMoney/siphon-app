// BalanceDisplay.tsx - Display encrypted balance with client-side decryption
"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useBalance } from './useBalance';
import { getOrCreateUserKeys } from './encryption';
import { USDC_DECIMALS } from './constants';
import './darkpool.css';

interface BalanceDisplayProps {
  walletAddress: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  onRefresh?: () => void;
}

export default function BalanceDisplay({ 
  walletAddress, 
  signMessage,
  onRefresh 
}: BalanceDisplayProps) {
  const { balance, loading, error, refreshBalance } = useBalance(walletAddress);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const hasLoadedRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    try {
      // Get user's encryption keys
      const { privateKey } = await getOrCreateUserKeys(walletAddress, signMessage);
      
      // Refresh balance
      await refreshBalance(privateKey);
      setLastUpdate(new Date());
      
      onRefresh?.();
    } catch (err) {
      console.error('Failed to refresh balance:', err);
    }
  }, [walletAddress, signMessage, refreshBalance, onRefresh]);

  // Only load once when walletAddress is set
  useEffect(() => {
    if (!walletAddress) {
      hasLoadedRef.current = false;
      return;
    }
    
    // Only load if we haven't loaded for this wallet address yet
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      let mounted = true;
      const timeoutId = setTimeout(() => {
        if (mounted) {
          handleRefresh().catch(err => {
            console.error('Error in handleRefresh:', err);
            // Don't block the UI if refresh fails
          });
        }
      }, 100);
      
      return () => {
        mounted = false;
        clearTimeout(timeoutId);
      };
    }
    // Only depend on walletAddress to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const formatBalance = (amount: bigint, decimals: number = 9): string => {
    return (Number(amount) / Math.pow(10, decimals)).toFixed(4);
  };

  if (loading && !balance) {
    return (
      <div className="balance-card">
        <div className="loading-state">
          <div className="spinner"></div>
          <span>Loading balances...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="balance-card">
        <div className="error-state">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="balance-card">
        <div className="empty-state">
          No balance data available
        </div>
      </div>
    );
  }

  return (
    <div className="balance-card">
      <div className="balance-header">
        <h3>Your Private Balance</h3>
        <button 
          onClick={handleRefresh}
          className="refresh-btn"
          disabled={loading}
          title="Refresh balance"
        >
          {loading ? '⟳' : '⟳'}
        </button>
      </div>

      <div className="balance-items">
        <div className="balance-item">
          <div className="balance-item-header">
            <span className="token-name">SOL (Base Token)</span>
          </div>
          <div className="balance-amounts">
            <div className="balance-primary">
              <span className="label">Available</span>
              <span className="amount">{formatBalance(balance.base_available, 9)} SOL</span>
            </div>
            <div className="balance-secondary">
              <span className="label">Total (incl. locked)</span>
              <span className="amount">{formatBalance(balance.base_total, 9)} SOL</span>
            </div>
          </div>
        </div>

        <div className="balance-item">
          <div className="balance-item-header">
            <span className="token-name">USDC (Quote Token)</span>
          </div>
          <div className="balance-amounts">
            <div className="balance-primary">
              <span className="label">Available</span>
              <span className="amount">{formatBalance(balance.quote_available, USDC_DECIMALS)} USDC</span>
            </div>
            <div className="balance-secondary">
              <span className="label">Total (incl. locked)</span>
              <span className="amount">{formatBalance(balance.quote_total, USDC_DECIMALS)} USDC</span>
            </div>
          </div>
        </div>
      </div>

      <div className="balance-footer">
        <span className="last-update">
          Updated: {lastUpdate.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

