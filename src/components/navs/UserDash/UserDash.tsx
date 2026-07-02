'use client';
import { useState, useEffect, useCallback } from 'react';
import { walletManager, WalletInfo } from '../../extensions/walletManager';
import './UserDash.css';
import { deposit, withdraw } from "../../../lib/handler";
import { TOKEN_MAP, getUnifiedBalances, initializeWithProvider, isInitialized, deinit, getSigner } from '../../../lib/nexus';
import { getSpendableVaultBalance, invalidateLeafCache, getLocalVaultNoteTotals } from '../../../lib/zkHandler';
import { resolvePendingOutputNotes } from '../../../lib/outputNoteResolver';
import { syncWalletNotesFromServer } from '../../../lib/syncWalletNotes';
import { exportNotes, importNotes } from '../../../lib/noteStore';
import ActivityLog from './ActivityLog';
import { exportCommitments } from '../../../lib/commitmentStore';
import {
  getNetwork,
  DEFAULT_CHAIN_ID,
  getSelectedChainId,
  SUPPORTED_CHAIN_IDS,
  selectChainAndSwitchWallet,
  installWalletChainSync,
} from '../../../lib/networks';
import { showAppToast } from '../../../lib/appToast';
import { getStoredClientKey } from '../../../lib/fhe';
import {
  getFheKeyState,
  getCachedServerKey,
  warmFheKeys,
  FHE_KEYS_EVENT,
  type FheKeyState,
} from '../../../lib/fheKeyWarmup';

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
  // true = balance confirmed against the chain; false = shown from encrypted backup because RPC
  // couldn't verify (so the empty state reads "verifying…" not "No funds detected").
  const [balanceVerified, setBalanceVerified] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDepositMode, setIsDepositMode] = useState(true);
  const [isNotesBusy, setIsNotesBusy] = useState(false);
  const [isVaultRefreshing, setIsVaultRefreshing] = useState(false);
  const [activeChainId, setActiveChainId] = useState<number>(DEFAULT_CHAIN_ID);
  const [switchingChain, setSwitchingChain] = useState(false);
  const activeNetwork = getNetwork(activeChainId);
  // FHE keys (generated at wallet connect by TeeClientKeySync → warmFheKeys). Only truncated
  // previews + sizes are held in state — never the full ~23MB server key string.
  const [fheState, setFheState] = useState<FheKeyState>(() => getFheKeyState());
  const [fheClientKey, setFheClientKey] = useState<{ preview: string; bytes: number } | null>(null);
  const [fheServerKey, setFheServerKey] = useState<{ preview: string; bytes: number } | null>(null);

  useEffect(() => {
    const addr = wallet?.address;
    if (!addr) { setFheClientKey(null); setFheServerKey(null); return; }
    let cancelled = false;
    const trunc = (k: string) => `${k.slice(0, 26)}…${k.slice(-12)}`;
    const refresh = async () => {
      setFheState(getFheKeyState());
      const ck = getStoredClientKey(addr);
      if (!cancelled) setFheClientKey(ck ? { preview: trunc(ck), bytes: Math.floor(ck.length / 2) } : null);
      const sk = await getCachedServerKey(addr).catch(() => null);
      if (!cancelled) setFheServerKey(sk ? { preview: trunc(sk), bytes: Math.floor(sk.length / 2) } : null);
    };
    void refresh();
    const onKeys = () => { void refresh(); };
    window.addEventListener(FHE_KEYS_EVENT, onKeys);
    return () => { cancelled = true; window.removeEventListener(FHE_KEYS_EVENT, onKeys); };
  }, [wallet?.address]);

  const copyFheKey = useCallback(async (which: 'client' | 'server') => {
    if (!wallet?.address) return;
    const val = which === 'client'
      ? getStoredClientKey(wallet.address)
      : await getCachedServerKey(wallet.address).catch(() => null);
    if (!val) { showAppToast('Key not generated yet', 'error'); return; }
    try {
      await navigator.clipboard.writeText(val);
      showAppToast(`${which === 'client' ? 'Client' : 'Server'} key copied to clipboard`, 'success');
    } catch {
      showAppToast('Clipboard copy failed', 'error');
    }
  }, [wallet?.address]);

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

  const fetchVaultBalances = useCallback(async (options?: { syncServerNotes?: boolean; skipOnChainCheck?: boolean }) => {
    // Show local note totals INSTANTLY (pure localStorage read, no RPC) so funds appear right
    // away instead of sitting on "Updating…" until the full chain scan finishes. The on-chain
    // reconcile below refines this a moment later. Only fills when nothing is shown yet, so the
    // 60s poll doesn't flicker a reconciled value back to the raw local total.
    {
      const localNow = getLocalVaultNoteTotals(activeChainId);
      const quick: Record<string, number> = {};
      for (const sym of ['ETH', 'USDC']) {
        if ((localNow[sym] ?? 0) > 0) quick[sym] = localNow[sym];
      }
      // Only fill if nothing is shown yet, OR if the current display is empty (all zeroes).
      // Prevents a bad prior scan from locking out the local quick-read.
      setSiphonVaultBalances((prev) =>
        prev === null || Object.values(prev).every((v) => v <= 0) ? quick : prev
      );
    }
    // Finalize any vault-mode swap outputs whose on-chain deposit has landed so they count
    // toward the vault balance below. No signer → localStorage-only (avoids a wallet popup).
    const hasPending = typeof localStorage !== 'undefined' &&
      Object.keys(localStorage).some((k) => k.startsWith('siphon-pending-output-'));
    if (hasPending) {
      // Resolve pending vault-output notes (e.g. a limit-order swap's USDC output) into spendable
      // notes. Pass the signer on an explicit refresh, OR automatically on the background poll when
      // the enc key is already cached — so a just-landed swap output resolves WITHOUT a wallet popup
      // instead of sitting "metadata-only" until the user manually clicks ↻. Only falls back to the
      // signer-free (secret-preserving) path when signing would actually prompt.
      let resolveSigner: ReturnType<typeof getSigner> = null;
      if (wallet && isInitialized()) {
        const s = getSigner();
        if (s) {
          if (options?.syncServerNotes) {
            resolveSigner = s;
          } else {
            try {
              const { isEncKeyCached } = await import('../../../lib/noteAuth');
              if (isEncKeyCached(await s.getAddress())) resolveSigner = s;
            } catch { /* ignore */ }
          }
        }
      }
      try { await resolvePendingOutputNotes(resolveSigner); } catch { /* best-effort */ }
    }
    if (options?.syncServerNotes && wallet && isInitialized()) {
      try {
        await syncWalletNotesFromServer(getSigner());
      } catch {
        /* server notes optional */
      }
    }
    // On-chain reconcile refines the balance (drops spent / not-yet-indexed notes), but a
    // throttled RPC must never leave the panel stuck on "Updating…" or — worse — collapse to
    // "No funds detected" when the funds are safely in your encrypted backup. Cap it with a
    // timeout; on failure fall back to note totals WITHOUT zeroing the balance.
    // Background poll: skip all network calls — just keep the last verified display.
    // The refresh button and initial load do the full on-chain check.
    if (options?.skipOnChainCheck) return;

    let details: Record<string, number> = {};
    let reconcileOk = false;
    try {
      const reconciled = await Promise.race([
        getSpendableVaultBalance(activeChainId, TOKEN_MAP),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('balance scan timeout')), 12_000),
        ),
      ]);
      details = reconciled.details;
      reconcileOk = true;
    } catch (e) {
      console.warn('[balance] on-chain reconcile unavailable, falling back to note/server totals:', e);
    }
    const local = getLocalVaultNoteTotals(activeChainId); // after reconcile so spent-marks apply

    // Supabase-backed fallback: if the on-chain reconcile could NOT run, the balance must reflect
    // what your encrypted backup says is withdrawable — NOT an empty localStorage (which is empty
    // right after a cache clear, before re-hydration finishes). Only fetched when the reconcile
    // failed AND a signer is available without a wallet popup (enc key already derived), so the
    // manual refresh never prompts unnecessarily.
    let server: Record<string, number> = {};
    if (!reconcileOk && wallet && isInitialized()) {
      try {
        const s = getSigner();
        if (s) {
          const { isEncKeyCached } = await import('../../../lib/noteAuth');
          if (isEncKeyCached(await s.getAddress())) {
            const { getServerBackedVaultTotals } = await import('../../../lib/commitmentStore');
            server = await getServerBackedVaultTotals(s, activeChainId);
            console.log('[balance] RPC down — using Supabase-backed totals:', server);
          }
        }
      } catch (e) { console.warn('[balance] server-backed fallback failed:', e); }
    }

    const display: Record<string, number> = {};
    for (const sym of ['ETH', 'USDC']) {
      const onChain = details[sym] ?? 0;
      const amount = reconcileOk
        ? onChain
        : Math.max(local[sym] ?? 0, server[sym] ?? 0);
      if (amount > 0) display[sym] = amount;
    }
    setSiphonVaultBalances(display);
    setBalanceVerified(reconcileOk);
    console.log(`Private balance (${reconcileOk ? 'on-chain reconciled' : 'unverified — RPC down, from backup'}):`, display);
  }, [activeChainId, wallet]);

  // Manual refresh: bust the cached leaf scan first so a just-landed deposit is picked up
  // immediately instead of waiting out the cache TTL / 60s poll.
  const refreshVaultBalances = useCallback(async () => {
    setIsVaultRefreshing(true);
    try {
      invalidateLeafCache();
      await fetchVaultBalances({ syncServerNotes: true });
    } finally {
      setIsVaultRefreshing(false);
    }
  }, [fetchVaultBalances]);

  useEffect(() => {
    fetchVaultBalances(); // initial load — does full on-chain check
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, activeChainId]);

  useEffect(() => {
    const interval = setInterval(() => fetchVaultBalances({ skipOnChainCheck: true }), 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (!cancelled) setWalletBalances(balances ?? []);
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
        const restored = await walletManager.restorePersistedSession();
        const metamaskWallet =
          restored ??
          walletManager.getConnectedWallets().find((w) => w.id === 'metamask') ??
          null;
        
        if (metamaskWallet) {
          setWallet(metamaskWallet);
          setTransactionInput(prev => ({...prev, recipient: metamaskWallet.address}));
          
          // Ensure ethers is initialized before fetching balances
          if (!isInitialized() && window.ethereum) {
            try {
              await initializeWithProvider(window.ethereum);
            } catch (error) {
              console.error('Failed to initialize ethers:', error);
            }
          }
          
        } else {
          setWallet(null);
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
        setWalletBalances(balances ?? []);
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
      walletManager.clearPersistedWallet();
      // Navigate back to discover view
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('userdash-view-change', { detail: 'blueprint' }));
        window.dispatchEvent(new CustomEvent('pro-view-mode-change', { detail: 'blueprint' }));
      }
    }
  };

  const handleConfirm = async () => {
    if (isProcessing) return;

    if (!wallet || !isInitialized()) {
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
          invalidateLeafCache();
          await refreshVaultBalances();
        } else {
          showAppToast(`Deposit failed: ${result.error}`, 'error');
        }
      } else {
        console.log('Withdrawing from Siphon Vault');
        const result = await withdraw(transactionInput.token, transactionInput.amount, transactionInput.recipient);

        if (result.success) {
          showAppToast(`Withdrew ${transactionInput.amount} ${transactionInput.token}`, 'success');
          setTransactionInput(prev => ({...prev, amount: ""}));
          invalidateLeafCache();
          await refreshVaultBalances();
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
              {walletBalances === null ? (
                <div className="userdash-balance-loading">Loading...</div>
              ) : walletBalances.length > 0 ? (
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
                <div className="userdash-balance-loading">Switch wallet to {activeNetwork.name}</div>
              )}
            </div>
            <div className="userdash-balance-description">
              Your ETH balance on {activeNetwork.name}
            </div>
          </div>

          <div className="userdash-balance-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">Private Balance</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={refreshVaultBalances}
                  disabled={isVaultRefreshing}
                  title="Refresh private balance"
                  aria-label="Refresh private balance"
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
              {/* Show the balance whenever we HAVE one — even mid-refresh — so a slow/hung RPC scan
                  can never hide a known balance behind a permanent "Updating…". The ↻ spinner in the
                  header already signals that a refresh is in flight. "Updating…" only shows when we
                  genuinely have nothing to display yet. */}
              {siphonVaultBalances !== null &&
                Object.entries(siphonVaultBalances).some(([, amount]) => amount > 0) ? (
                // Sort and filter balances to show ETH then USDC
                Object.entries(siphonVaultBalances)
                  .filter(([symbol, amount]) => (symbol === 'ETH' || symbol === 'USDC') && amount > 0)
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
              ) : isVaultRefreshing ? (
                <div className="userdash-balance-loading" style={{ opacity: 0.6, fontStyle: 'italic' }}>Updating...</div>
              ) : !balanceVerified ? (
                <div className="userdash-balance-loading" style={{ opacity: 0.6, fontStyle: 'italic' }}>
                  Verifying on-chain… (network busy — your notes are backed up)
                </div>
              ) : (
                <div className="userdash-balance-loading">No funds detected</div>
              )}
            </div>
            <div className="userdash-balance-description">
              Your private vault balance on {activeNetwork.name}
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

        <div className="userdash-bottom-row">
          <div className="userdash-activity-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">Activity Log</h2>
            </div>
            <p className="userdash-activity-description">
              Deposits, withdrawals, and strategy runs for your wallet.
            </p>
            <ActivityLog walletAddress={wallet.address} />
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

          <div className="userdash-notes-card userdash-fhe-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">FHE Encryption Keys</h2>
              <span className={`userdash-fhe-status userdash-fhe-status--${fheState.stage}`}>
                {fheState.stage === 'generating' ? 'Generating keypair…'
                  : fheState.stage === 'deriving' ? 'Deriving server key…'
                  : fheState.stage === 'uploading' ? 'Uploading server key…'
                  : fheState.stage === 'error' && fheState.serverKeyReady
                    ? 'Keys ready — executor unreachable, upload retries at order time'
                  : fheState.stage === 'error' ? 'Key generation failed — retries at order time'
                  : fheClientKey && fheServerKey ? 'Ready'
                  : 'Not generated yet'}
              </span>
            </div>
            <p className="userdash-notes-description">
              Generated automatically when your wallet connects so orders submit instantly.
              The client key is secret and never leaves this device — it decrypts your strategy
              triggers. The server key is a public evaluation key shared with the trade executor.
            </p>
            <div className="userdash-fhe-rows">
              <div className="userdash-fhe-row">
                <span className="userdash-fhe-label">Client key</span>
                <code className="userdash-fhe-key">{fheClientKey ? fheClientKey.preview : '—'}</code>
                <span className="userdash-fhe-size">
                  {fheClientKey ? `${(fheClientKey.bytes / 1024).toFixed(1)} KB` : ''}
                </span>
                <button
                  type="button"
                  className="userdash-notes-button userdash-notes-button--secondary"
                  onClick={() => void copyFheKey('client')}
                  disabled={!fheClientKey}
                >
                  Copy
                </button>
              </div>
              <div className="userdash-fhe-row">
                <span className="userdash-fhe-label">Server key</span>
                <code className="userdash-fhe-key">{fheServerKey ? fheServerKey.preview : '—'}</code>
                <span className="userdash-fhe-size">
                  {fheServerKey ? `${(fheServerKey.bytes / (1024 * 1024)).toFixed(1)} MB` : ''}
                </span>
                <button
                  type="button"
                  className="userdash-notes-button userdash-notes-button--secondary"
                  onClick={() => void copyFheKey('server')}
                  disabled={!fheServerKey}
                >
                  Copy
                </button>
              </div>
            </div>
            {!fheClientKey && (fheState.stage === 'idle' || fheState.stage === 'error') && (
              <div className="userdash-notes-actions">
                <button
                  type="button"
                  className="userdash-notes-button userdash-notes-button--primary"
                  onClick={() => { if (wallet?.address) void warmFheKeys(wallet.address).catch(() => {}); }}
                >
                  Generate Keys Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

