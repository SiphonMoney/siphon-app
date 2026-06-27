'use client';
import { useState, useEffect, useCallback } from 'react';
import { walletManager, WalletInfo } from '../../extensions/walletManager';
import './UserDash.css';
import { deposit, withdraw } from "../../../lib/handler";
import { TOKEN_MAP, getUnifiedBalances, initializeWithProvider, isInitialized, deinit, getSigner } from '../../../lib/nexus';
import { getSpendableVaultBalance, invalidateLeafCache } from '../../../lib/zkHandler';
import { resolvePendingOutputNotes } from '../../../lib/outputNoteResolver';
import { exportNotes, importNotes } from '../../../lib/noteStore';
import {
  getNetwork,
  DEFAULT_CHAIN_ID,
  getSelectedChainId,
  SUPPORTED_CHAIN_IDS,
  selectChainAndSwitchWallet,
  installWalletChainSync,
} from '../../../lib/networks';
import { showAppToast } from '../../../lib/appToast';

interface UnifiedBalance {
  symbol: string;
  balance: string;
  decimals: number;
}

interface UserDashProps {
  isLoaded?: boolean;
  walletConnected: boolean;
}

export default function UserDash({ isLoaded = true, walletConnected }: UserDashProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletBalances, setWalletBalances] = useState<UnifiedBalance[] | null>(null);
  const [siphonVaultBalances, setSiphonVaultBalances] = useState<{ [token: string]: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDepositMode, setIsDepositMode] = useState(true);
  const [isNotesBusy, setIsNotesBusy] = useState(false);
  const [isVaultRefreshing, setIsVaultRefreshing] = useState(false);
  const [activeChainId, setActiveChainId] = useState<number>(DEFAULT_CHAIN_ID);
  const [switchingChain, setSwitchingChain] = useState(false);
  const activeNetwork = getNetwork(activeChainId);

  // Keep the dashboard in sync with the globally-selected EVM network + wallet chain changes.
  useEffect(() => {
    installWalletChainSync();
    setActiveChainId(getSelectedChainId());
    const onChain = (e: Event) => {
      const id = (e as CustomEvent<{ chainId: number }>).detail?.chainId;
      if (id) setActiveChainId(id);
    };
    window.addEventListener('siphon:chainChanged', onChain);
    window.addEventListener('siphon:walletChainChanged', onChain);
    window.addEventListener('siphon:networkReady', onChain);
    return () => {
      window.removeEventListener('siphon:chainChanged', onChain);
      window.removeEventListener('siphon:walletChainChanged', onChain);
      window.removeEventListener('siphon:networkReady', onChain);
    };
  }, []);

  const handleSelectChain = useCallback(async (id: number) => {
    if (id === activeChainId || switchingChain) return;
    setSwitchingChain(true);
    setSiphonVaultBalances(null);
    setWalletBalances(null);
    try {
      const result = await selectChainAndSwitchWallet(id);
      setActiveChainId(result.chainId);
      if (!result.ok) showAppToast(`Could not switch network: ${result.error}`, 'error');
    } finally {
      setSwitchingChain(false);
    }
  }, [activeChainId, switchingChain]);

  const fetchVaultBalances = useCallback(async () => {
    // Finalize any vault-mode swap outputs whose on-chain deposit has landed so they count
    // toward the vault balance below. No signer → localStorage-only (avoids a wallet popup).
    try { await resolvePendingOutputNotes(); } catch { /* best-effort */ }
    const { details } = await getSpendableVaultBalance(activeChainId, TOKEN_MAP);
    setSiphonVaultBalances(details);
    console.log("Siphon Vault spendable balances (on-chain reconciled):", details);
  }, [activeChainId]);

  // Manual refresh: bust the cached leaf scan first so a just-landed deposit is picked up
  // immediately instead of waiting out the cache TTL / 60s poll.
  const refreshVaultBalances = useCallback(async () => {
    setIsVaultRefreshing(true);
    try {
      invalidateLeafCache();
      await fetchVaultBalances();
    } finally {
      setIsVaultRefreshing(false);
    }
  }, [fetchVaultBalances]);

  useEffect(() => {
    fetchVaultBalances();
    const interval = setInterval(fetchVaultBalances, 60_000);
    return () => clearInterval(interval);
  }, [wallet, fetchVaultBalances]);

  // Refresh the (public) wallet balances whenever the wallet or selected chain changes.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        if (!isInitialized() && typeof window !== 'undefined' && window.ethereum) {
          try { await initializeWithProvider(window.ethereum); } catch (e) { console.error('init ethers failed', e); }
        }
        const balances = await getUnifiedBalances(activeChainId);
        if (!cancelled) setWalletBalances(balances);
      } catch (e) {
        console.error('Error fetching wallet balances:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, activeChainId]);

  const [transactionInput, setTransactionInput] = useState({
    token: "ETH",
    amount: "",
    recipient: ""
  });

  useEffect(() => {
    const checkWalletAndFetchBalances = async () => {
      try {
        // First check walletManager
        const wallets = walletManager.getConnectedWallets();
        let metamaskWallet = wallets.find(w => w.id === 'metamask');
        
        // If not found in walletManager, check localStorage
        if (!metamaskWallet) {
          try {
            const storedWallet = localStorage.getItem('siphon-connected-wallet');
            if (storedWallet) {
              const walletData = JSON.parse(storedWallet);
              if (walletData && walletData.address) {
                metamaskWallet = walletData;
              }
            }
          } catch (error) {
            console.error('Error reading wallet from localStorage:', error);
          }
        }
        
        if (metamaskWallet) {
          setWallet(metamaskWallet);
          setTransactionInput(prev => ({...prev, recipient: metamaskWallet!.address}));
          
          // Ensure ethers is initialized before fetching balances
          if (!isInitialized() && window.ethereum) {
            try {
              await initializeWithProvider(window.ethereum);
            } catch (error) {
              console.error('Failed to initialize ethers:', error);
            }
          }
          
        }
      } catch (error) {
        console.error('Error fetching wallet data:', error);
      }
    };

    checkWalletAndFetchBalances();
    
    // Listen for wallet connection/disconnection events
    const handleWalletConnected = () => {
      checkWalletAndFetchBalances();
    };

    const handleWalletDisconnected = () => {
      setWallet(null);
      setWalletBalances(null);
    };

    window.addEventListener('walletConnected', handleWalletConnected);
    window.addEventListener('walletDisconnected', handleWalletDisconnected);

    return () => {
      window.removeEventListener('walletConnected', handleWalletConnected);
      window.removeEventListener('walletDisconnected', handleWalletDisconnected);
    };
  }, []);

  // Separate effect for balance refresh
  useEffect(() => {
    if (!wallet) return;
    
    const interval = setInterval(async () => {
      try {
        // Ensure ethers is initialized before fetching balances
        if (!isInitialized() && window.ethereum) {
          try {
            await initializeWithProvider(window.ethereum);
          } catch (error) {
            console.error('Failed to initialize ethers:', error);
            return;
          }
        }
        
        const balances = await getUnifiedBalances(activeChainId);
        setWalletBalances(balances);
      } catch (error) {
        console.error('Error refreshing wallet balances:', error);
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [wallet, activeChainId]);

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleLogout = () => {
    if (wallet) {
      console.log(`Disconnecting ${wallet.id} wallet...`);
      walletManager.disconnectWallet(wallet.id);
      setWallet(null);
      window.dispatchEvent(new Event('walletDisconnected'));
      deinit();
      // Clear persisted wallet connection
      localStorage.removeItem('siphon-connected-wallet');
      // Navigate back to discover view
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('userdash-view-change', { detail: 'blueprint' }));
        window.dispatchEvent(new CustomEvent('pro-view-mode-change', { detail: 'blueprint' }));
      }
    }
  };

  const handleConfirm = async () => {
    if (isProcessing) return;

    if (!walletConnected) {
      showAppToast('Please connect wallet first', 'error');
      return;
    }

    // Validate inputs
    if (!transactionInput.amount || parseFloat(transactionInput.amount) <= 0) {
      showAppToast('Please enter a valid amount', 'error');
      return;
    }
    if (!transactionInput.token) {
      showAppToast('Please select a token', 'error');
      return;
    }
    if (!isDepositMode && !transactionInput.recipient) {
      showAppToast('Please enter a recipient address', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      if (isDepositMode) {
        console.log('Depositing to Siphon Vault');
        const result = await deposit(transactionInput.token, transactionInput.amount);
        
        if (result.success) {
          showAppToast(`Deposited ${transactionInput.amount} ${transactionInput.token}`, 'success');
          setTransactionInput(prev => ({...prev, amount: ""}));
        } else {
          showAppToast(`Deposit failed: ${result.error}`, 'error');
        }
      } else {
        console.log('Withdrawing from Siphon Vault');
        const result = await withdraw(transactionInput.token, transactionInput.amount, transactionInput.recipient);
        
        if (result.success) {
          showAppToast(`Withdrew ${transactionInput.amount} ${transactionInput.token}`, 'success');
          setTransactionInput(prev => ({...prev, amount: ""}));
        } else {
          showAppToast(`Withdraw failed: ${result.error}`, 'error');
        }
      }
    } catch (error: unknown) {
      console.error('Transaction failed:', error);
      showAppToast(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }

    setIsProcessing(false);
  };

  const handleExportNotes = async () => {
    const signer = getSigner();
    if (!signer) {
      showAppToast('Please connect wallet first', 'error');
      return;
    }
    setIsNotesBusy(true);
    try {
      await exportNotes(signer);
    } catch (error) {
      console.error('Failed to export notes:', error);
      showAppToast('Failed to export notes', 'error');
    } finally {
      setIsNotesBusy(false);
    }
  };

  const handleImportNotes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const signer = getSigner();
    if (!signer) {
      showAppToast('Please connect wallet first', 'error');
      return;
    }
    setIsNotesBusy(true);
    try {
      await importNotes(signer, file);
      showAppToast('Notes imported successfully', 'success');
    } catch (error) {
      console.error('Failed to import notes:', error);
      showAppToast('Failed to import notes', 'error');
    } finally {
      setIsNotesBusy(false);
      e.target.value = '';
    }
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
          <div className="userdash-header-top">
            <h1 className="userdash-title">User Dashboard</h1>
            <button
              className="userdash-logout-button"
              onClick={handleLogout}
              title="Disconnect wallet"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
          <div className="userdash-network-toggle" role="group" aria-label="EVM network">
            {SUPPORTED_CHAIN_IDS.map((id) => {
              const net = getNetwork(id);
              const active = id === activeChainId;
              return (
                <button
                  key={id}
                  type="button"
                  className={`userdash-network-btn${active ? ' active' : ''}`}
                  onClick={() => handleSelectChain(id)}
                  disabled={switchingChain}
                  title={net.name}
                >
                  {net.name}
                </button>
              );
            })}
          </div>
          <div className="userdash-address">
            <span className="userdash-address-label">Address:</span>
            <span className="userdash-address-value">{formatAddress(wallet.address)}</span>
            <button
              className="userdash-copy-button"
              onClick={() => {
                navigator.clipboard.writeText(wallet.address);
                showAppToast('Address copied to clipboard', 'success');
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
              <span className="userdash-balance-network">{activeNetwork.badgeLabel}</span>
            </div>
            <div className="userdash-balance-content-multi">
              {walletBalances !== null && walletBalances.length > 0 ? (
                // Sort and filter balances to show ETH then USDC
                walletBalances
                  .filter(bal => bal.symbol === 'ETH' || bal.symbol === 'USDC')
                  .sort((a, b) => {
                    if (a.symbol === 'ETH') return -1;
                    if (b.symbol === 'ETH') return 1;
                    return 0;
                  })
                  .map((bal, index) => (
                    <div key={index} className="userdash-balance-item-multi">
                      <div className="userdash-balance-amount">
                        {parseFloat(bal.balance).toFixed(6)}
                      </div>
                      <div className="userdash-balance-currency">{bal.symbol}</div>
                    </div>
                  ))
              ) : (
                <div className="userdash-balance-loading">Loading...</div>
              )}
            </div>
            <div className="userdash-balance-description">
              Your ETH balance on {activeNetwork.name}
            </div>
          </div>

          <div className="userdash-balance-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">Siphon Vault Balance</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={refreshVaultBalances}
                  disabled={isVaultRefreshing}
                  title="Refresh vault balance"
                  aria-label="Refresh vault balance"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: isVaultRefreshing ? 'default' : 'pointer',
                    opacity: isVaultRefreshing ? 0.5 : 0.8,
                    fontSize: 13,
                    padding: 0,
                    lineHeight: 1,
                    display: 'inline-flex',
                  }}
                >
                  <span style={{ display: 'inline-block', animation: isVaultRefreshing ? 'spin 0.8s linear infinite' : 'none' }}>↻</span>
                </button>
                <span className="userdash-balance-network">{activeNetwork.badgeLabel}</span>
              </div>
            </div>
            <div className="userdash-balance-content-multi">
              {siphonVaultBalances !== null && Object.keys(siphonVaultBalances).length > 0 ? (
                // Sort and filter balances to show ETH then USDC
                Object.entries(siphonVaultBalances)
                  .filter(([symbol]) => symbol === 'ETH' || symbol === 'USDC')
                  .sort(([symbolA], [symbolB]) => {
                    if (symbolA === 'ETH') return -1;
                    if (symbolB === 'ETH') return 1;
                    return 0;
                  })
                  .map(([tokenSymbol, amount], index) => (
                    <div key={index} className="userdash-balance-item-multi">
                      <div className="userdash-balance-amount">
                        {amount.toFixed(6)}
                      </div>
                      <div className="userdash-balance-currency">{tokenSymbol}</div>
                    </div>
                  ))
              ) : (
                <div className="userdash-balance-loading">No funds detected</div>
              )}
            </div>
            <div className="userdash-balance-description">
              Your aggregated balance across all Siphon Vault deposits
            </div>
          </div>

          <div className="userdash-balance-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">
                <span 
                  className={`userdash-mode-toggle ${isDepositMode ? 'active' : ''}`}
                  onClick={() => setIsDepositMode(true)}
                >
                  Deposit
                </span>
                {' / '}
                <span 
                  className={`userdash-mode-toggle ${!isDepositMode ? 'active' : ''}`}
                  onClick={() => setIsDepositMode(false)}
                >
                  Withdraw
                </span>
              </h2>
            </div>
            <div className="userdash-transaction-content">
              <div className="userdash-input-group">
                <input
                  type="number"
                  placeholder="Amount"
                  value={transactionInput.amount}
                  onChange={(e) => {
                    setTransactionInput(prev => ({...prev, amount: e.target.value}));
                  }}
                  className="userdash-input"
                />
                <select
                  value={transactionInput.token}
                  onChange={(e) => {
                    setTransactionInput(prev => ({...prev, token: e.target.value}));
                  }}
                  className="userdash-select"
                >
                  {Object.keys(TOKEN_MAP)
                    .filter(tokenSymbol => tokenSymbol === 'ETH' || tokenSymbol === 'USDC')
                    .map((tokenSymbol) => (
                      <option key={tokenSymbol} value={tokenSymbol} style={{ fontSize: '0.8em' }}>
                        {tokenSymbol}
                      </option>
                    ))}
                </select>
              </div>
              {!isDepositMode && (
                <div className="userdash-input-group">
                  <input
                    type="text"
                    placeholder="Recipient Address"
                    value={transactionInput.recipient}
                    onChange={(e) => {
                      setTransactionInput(prev => ({...prev, recipient: e.target.value}));
                    }}
                    className="userdash-input"
                  />
                </div>
              )}
            </div>
            <button
              className="userdash-confirm-button"
              onClick={handleConfirm}
              disabled={isProcessing}
            >
              {isProcessing ? (
                isDepositMode ? 'Depositing...' : 'Withdrawing...'
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        </div>

        <div className="userdash-notes-card">
          <div className="userdash-balance-header">
            <h2 className="userdash-balance-title">Private Notes Backup</h2>
          </div>
          <p className="userdash-notes-description">
            Export or import encrypted ZK deposit receipts tied to your wallet. Use this to back up notes or restore them on another device.
          </p>
          <div className="userdash-notes-actions">
            <button
              type="button"
              className="userdash-notes-button userdash-notes-button--primary"
              onClick={handleExportNotes}
              disabled={isNotesBusy}
            >
              {isNotesBusy ? 'Working...' : 'Export Notes'}
            </button>
            <input
              type="file"
              accept=".json"
              onChange={handleImportNotes}
              className="userdash-notes-file-input"
              id="userdash-import-notes"
              disabled={isNotesBusy}
            />
            <label
              htmlFor="userdash-import-notes"
              className={`userdash-notes-button userdash-notes-button--secondary${isNotesBusy ? ' userdash-notes-button--disabled' : ''}`}
            >
              Import Notes
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

