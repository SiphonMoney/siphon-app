"use client";

import { useState, useEffect, useCallback } from "react";
import { indexTransactions, loadTransactions, IndexedTransaction, clearTransactions, reindexFromBeginning } from "@/lib/transactionIndexer";
import { getProvider, isInitialized, initializeWithProvider } from "@/lib/nexus";
import "./Run.css";

interface TransactionHistoryProps {
  isLoaded?: boolean;
}

export default function TransactionHistory({ isLoaded = true }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<IndexedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL' | 'SWAP' | 'FEE_PAYMENT'>('ALL');
  const [providerError, setProviderError] = useState<string | null>(null);

  // Initialize provider and load transactions
  useEffect(() => {
    const initializeAndIndex = async () => {
      // Load existing transactions first
      const loaded = loadTransactions();
      setTransactions(loaded);
      
      // Check if provider is available
      let provider = getProvider();
      
      // If not initialized, try to initialize from window.ethereum
      if (!provider && typeof window !== 'undefined' && window.ethereum) {
        try {
          await initializeWithProvider(window.ethereum);
          provider = getProvider();
        } catch (error) {
          console.warn('Could not initialize provider for indexing:', error);
          setProviderError('Provider not available. Connect wallet or refresh to index transactions.');
          return;
        }
      }
      
      // If still no provider, show error but allow viewing cached transactions
      if (!provider) {
        setProviderError('Provider not available. Showing cached transactions only.');
        return;
      }
      
      // Auto-index on mount (in background)
      setIsIndexing(true);
      setProviderError(null);
      
      try {
        const indexed = await indexTransactions();
        setTransactions(indexed);
      } catch (error) {
        console.error('Error indexing transactions:', error);
        setProviderError('Error indexing transactions. Showing cached data.');
      } finally {
        setIsIndexing(false);
      }
    };

    initializeAndIndex();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setProviderError(null);
    
    // Check if provider is available
    let provider = getProvider();
    
    // If not initialized, try to initialize from window.ethereum
    if (!provider && typeof window !== 'undefined' && window.ethereum) {
      try {
        await initializeWithProvider(window.ethereum);
        provider = getProvider();
      } catch (error) {
        console.warn('Could not initialize provider:', error);
        setProviderError('Provider not available. Please connect your wallet.');
        setIsLoading(false);
        return;
      }
    }
    
    if (!provider) {
      setProviderError('Provider not available. Please connect your wallet.');
      setIsLoading(false);
      return;
    }
    
    try {
      const indexed = await indexTransactions();
      setTransactions(indexed);
      setProviderError(null);
    } catch (error) {
      console.error('Error refreshing transactions:', error);
      setProviderError('Error refreshing transactions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    if (confirm('Clear all indexed transactions? This will remove local history but can be re-indexed.')) {
      clearTransactions();
      setTransactions([]);
    }
  }, []);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatAddress = (address: string): string => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatHash = (hash: string): string => {
    if (!hash) return 'N/A';
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
        );
      case 'WITHDRAWAL':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19V5M5 12l7 7 7-7" />
          </svg>
        );
      case 'SWAP':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        );
      case 'FEE_PAYMENT':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'DEPOSIT':
        return 'var(--tx-deposit-color, #10b981)';
      case 'WITHDRAWAL':
        return 'var(--tx-withdrawal-color, #ef4444)';
      case 'SWAP':
        return 'var(--tx-swap-color, #3b82f6)';
      case 'FEE_PAYMENT':
        return 'var(--tx-fee-color, #f59e0b)';
      default:
        return 'rgba(255, 255, 255, 0.5)';
    }
  };

  const filteredTransactions = transactions.filter(tx => 
    filterType === 'ALL' || tx.type === filterType
  );

  return (
    <div className={`transaction-history-view ${isLoaded ? 'loaded' : ''}`}>
      <div className="transaction-history-header">
        <div className="transaction-history-header-content">
          <div>
            <h2 className="transaction-history-title">Transaction History</h2>
            <p className="transaction-history-subtitle">All vault transactions indexed from the blockchain</p>
          </div>
          <div className="transaction-history-actions">
            <button
              className="transaction-history-refresh-btn"
              onClick={handleRefresh}
              disabled={isLoading || isIndexing}
              title="Refresh transactions"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {isLoading || isIndexing ? 'Indexing...' : 'Refresh'}
            </button>
            <button
              className="transaction-history-clear-btn"
              onClick={handleClear}
              title="Clear history"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <button
              className="transaction-history-refresh-btn"
              onClick={async () => {
                setIsLoading(true);
                setIsIndexing(true);
                setProviderError(null);
                
                // Check if provider is available
                let provider = getProvider();
                
                // If not initialized, try to initialize from window.ethereum
                if (!provider && typeof window !== 'undefined' && window.ethereum) {
                  try {
                    await initializeWithProvider(window.ethereum);
                    provider = getProvider();
                  } catch (error) {
                    console.warn('Could not initialize provider:', error);
                    setProviderError('Provider not available. Please connect your wallet.');
                    setIsLoading(false);
                    setIsIndexing(false);
                    return;
                  }
                }
                
                if (!provider) {
                  setProviderError('Provider not available. Please connect your wallet.');
                  setIsLoading(false);
                  setIsIndexing(false);
                  return;
                }
                
                try {
                  const indexed = await reindexFromBeginning();
                  setTransactions(indexed);
                  setProviderError(null);
                } catch (error) {
                  console.error('Error re-indexing:', error);
                  setProviderError('Error re-indexing. Please try again.');
                } finally {
                  setIsLoading(false);
                  setIsIndexing(false);
                }
              }}
              disabled={isLoading || isIndexing}
              title="Re-index from beginning"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
              Re-index
            </button>
          </div>
        </div>
        
        <div className="transaction-history-filters">
          {(['ALL', 'DEPOSIT', 'WITHDRAWAL', 'SWAP', 'FEE_PAYMENT'] as const).map((type) => (
            <button
              key={type}
              className={`transaction-history-filter-btn ${filterType === type ? 'active' : ''}`}
              onClick={() => setFilterType(type)}
            >
              {type === 'ALL' ? 'All' : type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {providerError && (
        <div className="transaction-history-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{providerError}</span>
        </div>
      )}

      <div className="transaction-history-list">
        {filteredTransactions.length === 0 ? (
          <div className="transaction-history-empty">
            <p className="transaction-history-empty-title">
              {isIndexing ? 'Indexing transactions...' : 'No transactions found'}
            </p>
            <p className="transaction-history-empty-hint">
              {isIndexing 
                ? 'Fetching events from the blockchain...' 
                : providerError
                ? providerError
                : 'Transactions will appear here once indexed from the blockchain'}
            </p>
          </div>
        ) : (
          filteredTransactions.map((tx) => (
            <div key={tx.id} className="transaction-history-card">
              <div className="transaction-history-card-icon" style={{ color: getTypeColor(tx.type) }}>
                {getTypeIcon(tx.type)}
              </div>
              <div className="transaction-history-card-content">
                <div className="transaction-history-card-header">
                  <div className="transaction-history-card-type">
                    <span className="transaction-type-badge" style={{ backgroundColor: getTypeColor(tx.type) + '20', color: getTypeColor(tx.type) }}>
                      {tx.type.replace('_', ' ')}
                    </span>
                    {tx.tokenSymbol && (
                      <span className="transaction-token-badge">{tx.tokenSymbol}</span>
                    )}
                  </div>
                  <span className="transaction-history-card-time">{formatDate(tx.timestamp)}</span>
                </div>
                
                <div className="transaction-history-card-details">
                  {tx.amountFormatted && (
                    <div className="transaction-detail-row">
                      <span className="transaction-detail-label">Amount</span>
                      <span className="transaction-detail-value">
                        {tx.amountFormatted} {tx.tokenSymbol}
                      </span>
                    </div>
                  )}
                  
                  {tx.depositor && (
                    <div className="transaction-detail-row">
                      <span className="transaction-detail-label">Depositor</span>
                      <span className="transaction-detail-value">{formatAddress(tx.depositor)}</span>
                    </div>
                  )}
                  
                  {tx.recipient && (
                    <div className="transaction-detail-row">
                      <span className="transaction-detail-label">Recipient</span>
                      <span className="transaction-detail-value">{formatAddress(tx.recipient)}</span>
                    </div>
                  )}
                  
                  {tx.srcToken && tx.dstToken && (
                    <div className="transaction-detail-row">
                      <span className="transaction-detail-label">Swap</span>
                      <span className="transaction-detail-value">
                        {getTokenSymbolFromAddress(tx.srcToken)} → {getTokenSymbolFromAddress(tx.dstToken)}
                      </span>
                    </div>
                  )}
                  
                  {tx.commitment && (
                    <div className="transaction-detail-row">
                      <span className="transaction-detail-label">Commitment</span>
                      <span className="transaction-detail-value code">{formatHash(tx.commitment)}</span>
                    </div>
                  )}
                  
                  {tx.nullifier && (
                    <div className="transaction-detail-row">
                      <span className="transaction-detail-label">Nullifier</span>
                      <span className="transaction-detail-value code">{formatHash(tx.nullifier)}</span>
                    </div>
                  )}
                  
                  <div className="transaction-detail-row">
                    <span className="transaction-detail-label">Block</span>
                    <span className="transaction-detail-value">#{tx.blockNumber}</span>
                  </div>
                  
                  <div className="transaction-detail-row">
                    <span className="transaction-detail-label">Transaction</span>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transaction-detail-link"
                    >
                      {formatHash(tx.txHash)}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Helper function to get token symbol from address
function getTokenSymbolFromAddress(address: string): string {
  if (!address) return 'N/A';
  if (address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') return 'ETH';
  // You can add more token mappings here
  return address.slice(0, 6) + '...' + address.slice(-4);
}

