'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import './UserDash.css';
import { SOLANA_TOKEN_MAP } from '../../../lib/solanaHandler';
import { depositToZkPool, withdrawFromZkPool, getZkPoolBalance } from '../../../lib/zkPoolHandler';
import { SUPPORTED_TOKENS } from '../../../lib/siphon/constants';
import { NEXT_PUBLIC_SOLANA_NETWORK } from '../../../lib/config';
import TxList, { getTxList, appendTx, type TxEntry } from '../darkpool/darkpool/TxList';

interface UserDashProps {
  isLoaded?: boolean;
  walletConnected: boolean;
}

interface WalletBalance {
  symbol: string;
  balance: string;
  decimals: number;
}

export default function UserDash({ isLoaded = true, walletConnected }: UserDashProps) {
  const wallet = useWallet();
  const { publicKey, disconnect } = wallet;
  const { connection } = useConnection();

  const [walletBalances, setWalletBalances] = useState<WalletBalance[] | null>(null);
  const [zkPoolBalances, setZkPoolBalances] = useState<{ [token: string]: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDepositMode, setIsDepositMode] = useState(true);

  const [transactionInput, setTransactionInput] = useState({
    token: "SOL",
    amount: "",
    recipient: ""
  });
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [txList, setTxList] = useState<TxEntry[]>([]);

  // Fetch wallet balances from Solana
  const fetchWalletBalances = useCallback(async () => {
    if (!publicKey || !connection) return;

    try {
      const balances: WalletBalance[] = [];

      // Get SOL balance
      const solBalance = await connection.getBalance(publicKey);
      balances.push({
        symbol: 'SOL',
        balance: (solBalance / LAMPORTS_PER_SOL).toString(),
        decimals: 9,
      });

      // Get USDC balance
      try {
        const usdcAta = await getAssociatedTokenAddress(
          SUPPORTED_TOKENS.USDC.mint,
          publicKey
        );
        const usdcAccount = await getAccount(connection, usdcAta);
        balances.push({
          symbol: 'USDC',
          balance: (Number(usdcAccount.amount) / Math.pow(10, 6)).toString(),
          decimals: 6,
        });
      } catch {
        // USDC account doesn't exist
        balances.push({
          symbol: 'USDC',
          balance: '0',
          decimals: 6,
        });
      }

      setWalletBalances(balances);
    } catch (error) {
      console.error('Error fetching wallet balances:', error);
    }
  }, [publicKey, connection]);

  const fetchZkPoolBalances = useCallback(() => {
    try {
      const balances: { [token: string]: number } = {
        SOL: getZkPoolBalance('SOL'),
        USDC: getZkPoolBalance('USDC'),
      };
      setZkPoolBalances(balances);
      console.log("ZK Pool Balances fetched:", balances);
    } catch (error) {
      console.error('Error fetching ZK pool balances:', error);
    }
  }, []);

  // Set recipient to own address on connect
  useEffect(() => {
    if (publicKey) {
      setTransactionInput(prev => ({ ...prev, recipient: publicKey.toBase58() }));
    }
  }, [publicKey]);

  // Auto-hide notification after 5s
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(t);
  }, [notification]);

  // Load transaction history from localStorage
  useEffect(() => {
    setTxList(getTxList());
  }, []);

  // Fetch balances on mount and periodically
  useEffect(() => {
    fetchWalletBalances();
    fetchZkPoolBalances();

    const interval = setInterval(() => {
      fetchWalletBalances();
      fetchZkPoolBalances();
    }, 10000);

    // Listen for ZK pool balance changes (from strategy execution, etc.)
    const handleBalanceChange = () => {
      console.log('[UserDash] ZK pool balance changed, refreshing...');
      fetchZkPoolBalances();
    };
    window.addEventListener('zkPoolBalanceChanged', handleBalanceChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('zkPoolBalanceChanged', handleBalanceChange);
    };
  }, [fetchWalletBalances, fetchZkPoolBalances]);

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleLogout = async () => {
    try {
      await disconnect();
      localStorage.removeItem('siphon-connected-wallet');
      window.dispatchEvent(new Event('walletDisconnected'));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('userdash-view-change', { detail: 'discover' }));
      }
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

  const handleConfirm = async () => {
    if (isProcessing) return;

    if (!walletConnected || !publicKey) {
      setNotification({ message: 'Please connect wallet first', type: 'error' });
      return;
    }

    if (!transactionInput.amount || parseFloat(transactionInput.amount) <= 0) {
      setNotification({ message: 'Please enter a valid amount', type: 'error' });
      return;
    }
    if (!transactionInput.token) {
      setNotification({ message: 'Please select a token', type: 'error' });
      return;
    }
    if (!isDepositMode && !transactionInput.recipient) {
      setNotification({ message: 'Please enter a recipient address', type: 'error' });
      return;
    }

    setIsProcessing(true);

    try {
      if (isDepositMode) {
        console.log('Depositing to ZK Pool on Solana');
        const result = await depositToZkPool(connection, wallet, transactionInput.token, transactionInput.amount);

        if (result.success) {
          const txHash = result.signature ?? 'deposit_' + Date.now();
          appendTx({
            type: 'deposit',
            timestamp: Date.now(),
            txHash,
            amount: transactionInput.amount,
            token: transactionInput.token,
          });
          setTxList(getTxList());
          setNotification({
            message: result.signature
              ? `Deposited ${transactionInput.amount} ${transactionInput.token}. Tx: ${result.signature.slice(0, 8)}...${result.signature.slice(-8)}`
              : `Deposited ${transactionInput.amount} ${transactionInput.token}`,
            type: 'success',
          });
          setTransactionInput(prev => ({ ...prev, amount: "" }));
          await fetchWalletBalances();
          fetchZkPoolBalances();
        } else {
          setNotification({ message: `Deposit failed: ${result.error}`, type: 'error' });
        }
      } else {
        console.log('Withdrawing from ZK Pool (private/anonymous)');
        const result = await withdrawFromZkPool(transactionInput.token, transactionInput.amount, transactionInput.recipient);

        if (result.success) {
          const txHash = result.signature ?? 'withdraw_' + Date.now();
          appendTx({
            type: 'withdraw',
            timestamp: Date.now(),
            txHash,
            amount: transactionInput.amount,
            token: transactionInput.token,
          });
          setTxList(getTxList());
          setNotification({
            message: result.signature
              ? `Withdrew ${transactionInput.amount} ${transactionInput.token} to ${formatAddress(transactionInput.recipient)}. Tx: ${result.signature.slice(0, 8)}...${result.signature.slice(-8)}`
              : `Withdrew ${transactionInput.amount} ${transactionInput.token} to ${formatAddress(transactionInput.recipient)}`,
            type: 'success',
          });
          setTransactionInput(prev => ({ ...prev, amount: "" }));
          await fetchWalletBalances();
          fetchZkPoolBalances();
        } else {
          setNotification({ message: `Withdrawal failed: ${result.error}`, type: 'error' });
        }
      }
    } catch (error: unknown) {
      console.error('Transaction failed:', error);
      setNotification({
        message: `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    }

    setIsProcessing(false);
  };

  if (!publicKey) {
    return (
      <div className={`userdash-view ${isLoaded ? 'loaded' : ''}`}>
        <div className="userdash-content-wrapper">
          <div className="userdash-empty-state">
            <h2>No Wallet Connected</h2>
            <p>Please connect your Solana wallet to view your dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`userdash-view ${isLoaded ? 'loaded' : ''}`}>
      {notification && (
        <div className={`userdash-toast userdash-toast-${notification.type}`} role="alert">
          {notification.type === 'success' ? (
            <svg className="userdash-toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg className="userdash-toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          <span className="userdash-toast-message">{notification.message}</span>
        </div>
      )}

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
          <div className="userdash-address">
            <span className="userdash-address-label">Address:</span>
            <span className="userdash-address-value">{formatAddress(publicKey.toBase58())}</span>
            <button
              className="userdash-copy-button"
              onClick={() => {
                navigator.clipboard.writeText(publicKey.toBase58());
                setNotification({ message: 'Address copied to clipboard', type: 'success' });
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
              <span className="userdash-balance-network">{'Devnet'}</span>
            </div>
            <div className="userdash-balance-content-multi">
              {walletBalances !== null && walletBalances.length > 0 ? (
                walletBalances
                  .filter(bal => bal.symbol === 'SOL' || bal.symbol === 'USDC')
                  .sort((a, b) => {
                    if (a.symbol === 'SOL') return -1;
                    if (b.symbol === 'SOL') return 1;
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
              Your balance on Solana {'Devnet'}
            </div>
          </div>

          <div className="userdash-balance-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">Siphon Vault Balance</h2>
              <span className="userdash-balance-network">Private</span>
            </div>
            <div className="userdash-balance-content-multi">
              {zkPoolBalances !== null && Object.keys(zkPoolBalances).length > 0 ? (
                Object.entries(zkPoolBalances)
                  .filter(([symbol]) => symbol === 'SOL' || symbol === 'USDC')
                  .sort(([symbolA], [symbolB]) => {
                    if (symbolA === 'SOL') return -1;
                    if (symbolB === 'SOL') return 1;
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
              Your anonymous balance in the Noir ZK pool
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
                    setTransactionInput(prev => ({ ...prev, amount: e.target.value }));
                  }}
                  className="userdash-input"
                />
                <select
                  value={transactionInput.token}
                  onChange={(e) => {
                    setTransactionInput(prev => ({ ...prev, token: e.target.value }));
                  }}
                  className="userdash-select"
                >
                  {Object.keys(SOLANA_TOKEN_MAP)
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
                      setTransactionInput(prev => ({ ...prev, recipient: e.target.value }));
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

        <TxList entries={txList} />
      </div>
    </div>
  );
}
