'use client';

import { useState, useEffect } from 'react';
import { walletManager, WalletInfo } from '../../extensions/walletManager';
import { formatEther } from 'viem';
import './UserDash.css';
import { deposit, withdraw } from "../../../lib/handler";

interface UserDashProps {
  isLoaded?: boolean;
  walletConnected?: boolean;
}

export default function UserDash({ isLoaded = true, walletConnected }: UserDashProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [siphonBalance, setSiphonBalance] = useState<number>(0);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  
  useEffect(() => {
    const fetchSiphonBalance = async () => {
      // TODO: Replace with actual implementation to fetch Siphon balance
      const balance = 0;
      setSiphonBalance(balance);
    };
    
    fetchSiphonBalance();
  }, [wallet]);
   const [withdrawals, setWithdrawals] = useState([
    { chain: "Ethereum Sepolia", token: "ETH", amount: "", recipient: "" }
  ]);

  const [depositInputs, setDepositInputs] = useState([
    { chain: "Ethereum Sepolia", token: "ETH", amount: "" }
  ]);

  useEffect(() => {
    const checkWallet = async () => {
      try {
        const wallets = walletManager.getConnectedWallets();
        const metamaskWallet = wallets.find(w => w.id === 'metamask');
        
        if (metamaskWallet) {
          setWallet(metamaskWallet);
          setWithdrawals(prev => [{...prev[0], recipient: metamaskWallet.address}]);
          
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

  const handleDeposit = async () => {
    if (isDepositing) return;

    console.log('Depositing to Siphon Vault');

    if (!walletConnected) {
      alert('Please connect wallet first');
      return;
    }

    // Validate inputs
    for (let i = 0; i < depositInputs.length; i++) {
      const dep = depositInputs[i];
      if (!dep || parseFloat(dep.amount) <= 0) {
        alert(`Please enter a valid amount for Deposit #${i + 1}`);
        return;
      }
      if (!dep.token) {
        alert(`Please select a token for Deposit #${i + 1}`);
        return;
      }
    }

    setIsDepositing(true);

    // Execute each deposit
    for (let i = 0; i < depositInputs.length; i++) {
      try {
        const dep = depositInputs[i];

        // Deposit directly to vault (updated signature - no srcChain)
        const result = await deposit(dep.token, dep.amount);

        if (result.success) {
          alert(`Successfully deposited ${dep.amount} ${dep.token} for Deposit #${i + 1}`);
          setDepositInputs([{ chain: "Ethereum Sepolia", token: "ETH", amount: "" }]);
        } else {
          alert(`Deposit failed: ${result.error}`);
        }
      } catch (error: unknown) {
        console.error('Deposit failed:', error);
        alert(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    setIsDepositing(false);
  };

  const handleWithdraw = async () => {
    if (isWithdrawing) return;

    console.log('Withdrawing from Siphon Vault');

    if (!walletConnected) {
      alert('Please connect wallet first');
      return;
    }

    // Validate inputs
    for (let i = 0; i < withdrawals.length; i++) {
      const w = withdrawals[i];
      if (!w || parseFloat(w.amount) <= 0) {
        alert(`Please enter a valid amount for Withdrawal #${i + 1}`);
        return;
      }
      if (!w.token) {
        alert(`Please select a token for Withdrawal #${i + 1}`);
        return;
      }
      if (!w.recipient) {
        alert(`Please enter a recipient address for Withdrawal #${i + 1}`);
        return;
      }
    }

    setIsWithdrawing(true);

    // Execute each withdrawal
    for (let i = 0; i < withdrawals.length; i++) {
      try {
        const w = withdrawals[i];

        // Withdraw from vault (updated signature - no chain parameter)
        const result = await withdraw(w.token, w.amount, w.recipient);

        if (result.success) {
          console.log(`Successfully withdrawn ${w.amount} ${w.token} for Withdrawal #${i + 1}`);
          alert(`Successfully withdrawn ${w.amount} ${w.token}`);
          setWithdrawals([{ chain: "Ethereum Sepolia", token: "ETH", amount: "", recipient: "" }]);
        } else {
          alert(`Withdraw failed: ${result.error}`);
          console.log(result.error);
        }
      } catch (error: unknown) {
        console.error('Withdraw failed:', error);
        alert(`Withdraw failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    setIsWithdrawing(false);
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
              <h2 className="userdash-balance-title">Deposit Funds</h2>
            </div>
            <div className="userdash-balance-content">
              {depositInputs.map((input, index) => (
                <div key={index} className="userdash-input-group">
                  <input
                    type="number"
                    placeholder="Amount"
                    value={input.amount}
                    onChange={(e) => {
                      const newInputs = [...depositInputs];
                      newInputs[index].amount = e.target.value;
                      setDepositInputs(newInputs);
                    }}
                    className="userdash-input"
                  />
                  <select
                    value={input.token}
                    onChange={(e) => {
                      const newInputs = [...depositInputs];
                      newInputs[index].token = e.target.value;
                      setDepositInputs(newInputs);
                    }}
                    className="userdash-select"
                  >
                    <option value="ETH">ETH</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="userdash-balance-description">
              Deposit funds to the Siphon contract
            </div>
          </div>

          <div className="userdash-balance-card">
            <div className="userdash-balance-header">
              <h2 className="userdash-balance-title">Withdraw Funds</h2>
            </div>
            <div className="userdash-balance-content">
              {withdrawals.map((input, index) => (
                <div key={index} className="userdash-input-group">
                  <input
                    type="number"
                    placeholder="Amount"
                    value={input.amount}
                    onChange={(e) => {
                      const newInputs = [...withdrawals];
                      newInputs[index].amount = e.target.value;
                      setWithdrawals(newInputs);
                    }}
                    className="userdash-input"
                  />
                  <select
                    value={input.token}
                    onChange={(e) => {
                      const newInputs = [...withdrawals];
                      newInputs[index].token = e.target.value;
                      setWithdrawals(newInputs);
                    }}
                    className="userdash-select"
                  >
                    <option value="ETH">ETH</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Recipient Address"
                    value={input.recipient}
                    onChange={(e) => {
                      const newInputs = [...withdrawals];
                      newInputs[index].recipient = e.target.value;
                      setWithdrawals(newInputs);
                    }}
                    className="userdash-input"
                  />
                </div>
              ))}
            </div>
            <div className="userdash-balance-description">
              Withdraw funds from the Siphon contract
            </div>
          </div>
        </div>

        <div className="userdash-actions">
          <button
            className="userdash-action-button"
            onClick={handleDeposit}
            disabled={isDepositing}
          >
            {isDepositing ? (
              'Depositing...'
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7-7 7 7" />
                </svg>
                Deposit
              </>
            )}
          </button>
          <button
            className="userdash-action-button"
            onClick={handleWithdraw}
            disabled={isWithdrawing}
          >
            {isWithdrawing ? (
              'Withdrawing...'
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7 7 7-7" />
                </svg>
                Withdraw
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

