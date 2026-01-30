'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import './UserDash.css';
import { SOLANA_TOKEN_MAP } from '../../../lib/solanaHandler';
import { depositToZkPool, withdrawFromZkPool, getZkPoolBalance } from '../../../lib/zkPoolHandler';
import { SUPPORTED_TOKENS } from '../../../lib/siphon/constants';

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
      setTransactionInput(prev => ({...prev, recipient: publicKey.toBase58()}));
    }
  }, [publicKey]);

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
      alert('Please connect wallet first');
      return;
    }

    // Validate inputs
    if (!transactionInput.amount || parseFloat(transactionInput.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!transactionInput.token) {
      alert('Please select a token');
      return;
    }
    if (!isDepositMode && !transactionInput.recipient) {
      alert('Please enter a recipient address');
      return;
    }

    setIsProcessing(true);

    try {
      if (isDepositMode) {
        console.log('Depositing to ZK Pool on Solana');
        const result = await depositToZkPool(connection, wallet, transactionInput.token, transactionInput.amount);

        if (result.success) {
          alert(`Successfully deposited ${transactionInput.amount} ${transactionInput.token}\nSignature: ${result.signature}`);
          setTransactionInput(prev => ({...prev, amount: ""}));
          // Refresh balances
          await fetchWalletBalances();
          fetchZkPoolBalances();
        } else {
          alert(`Deposit failed: ${result.error}`);
        }
      } else {
        // All withdrawals are now private via ZK Pool
        console.log('Withdrawing from ZK Pool (private/anonymous)');
        const result = await withdrawFromZkPool(transactionInput.token, transactionInput.amount, transactionInput.recipient);

        if (result.success) {
          alert(`Private withdrawal successful!\n${transactionInput.amount} ${transactionInput.token} sent to ${transactionInput.recipient}\nSignature: ${result.signature}`);
          setTransactionInput(prev => ({...prev, amount: ""}));
          await fetchWalletBalances();
          fetchZkPoolBalances();
        } else {
          alert(`Private withdrawal failed: ${result.error}`);
        }
      }
    } catch (error: unknown) {
      console.error('Transaction failed:', error);
      alert(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
              <span className="userdash-balance-network">{process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}</span>
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
              Your balance on Solana {process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}
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
              Your anonymous balance in the Noir ZK privacy pool (stored in browser)
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
      </div>
    </div>
  );
}
