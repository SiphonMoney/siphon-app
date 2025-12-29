'use client';
import { useState, useEffect } from 'react';
import { walletManager, WalletInfo } from '../../extensions/walletManager';
import './UserDash.css';
import { deposit, withdraw } from "../../../lib/handler";
import { getSiphonVaultTotalBalance, TOKEN_MAP, getUnifiedBalances } from '../../../lib/nexus';

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
  const VAULT_CHAIN_ID = 11155111; // Sepolia id
  
  const [transactionInput, setTransactionInput] = useState({
    token: "ETH",
    amount: "",
    recipient: ""
  });
  useEffect(() => {
    const fetchBalances = async () => {
      const { details } = getSiphonVaultTotalBalance(VAULT_CHAIN_ID, TOKEN_MAP);
      setSiphonVaultBalances(details);
      console.log("Siphon Vault Balances fetched:", details); // Debug log
    };
    
    fetchBalances();
    // Refresh Siphon balance periodically
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [wallet]);

  // ... (keep the depositInputs and withdrawals state as is) ...

  useEffect(() => {
    const checkWalletAndFetchBalances = async () => {
      try {
        const wallets = walletManager.getConnectedWallets();
        const metamaskWallet = wallets.find(w => w.id === 'metamask');
        
        if (metamaskWallet) {
          setWallet(metamaskWallet);
          setTransactionInput(prev => ({...prev, recipient: metamaskWallet.address}));
          
          const balances = await getUnifiedBalances();
          setWalletBalances(balances);
        }
      } catch (error) {
        console.error('Error fetching wallet data:', error);
      }
    };

    checkWalletAndFetchBalances();
    
    // Refresh wallet balance every 10 seconds
    const interval = setInterval(async () => {
      if (wallet) {
        try {
          const balances = await getUnifiedBalances();
          setWalletBalances(balances);
        } catch (error) {
          console.error('Error refreshing wallet balances:', error);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [wallet]);

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleConfirm = async () => {
    if (isProcessing) return;

    if (!walletConnected) {
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
        console.log('Depositing to Siphon Vault');
        const result = await deposit(transactionInput.token, transactionInput.amount);
        
        if (result.success) {
          alert(`Successfully deposited ${transactionInput.amount} ${transactionInput.token}`);
          setTransactionInput(prev => ({...prev, amount: ""}));
        } else {
          alert(`Deposit failed: ${result.error}`);
        }
      } else {
        console.log('Withdrawing from Siphon Vault');
        const result = await withdraw(transactionInput.token, transactionInput.amount, transactionInput.recipient);
        
        if (result.success) {
          alert(`Successfully withdrawn ${transactionInput.amount} ${transactionInput.token}`);
          setTransactionInput(prev => ({...prev, amount: ""}));
        } else {
          alert(`Withdraw failed: ${result.error}`);
        }
      }
    } catch (error: unknown) {
      console.error('Transaction failed:', error);
      alert(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setIsProcessing(false);
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
              Your ETH balance on Sepolia network
            </div>
          </div>

          <div className="userdash-balance-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">Siphon Vault Balance</h2>
              <span className="userdash-balance-network">Sepolia</span>
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
      </div>
    </div>
  );
}

