// ManageLiquidity.tsx - Component for managing liquidity (deposit/withdraw)
"use client";

import { useState } from 'react';
import BalanceDisplay from './BalanceDisplay';
import './darkpool.css';

interface ManageLiquidityProps {
  walletAddress: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  onDeposit: () => void;
  onWithdraw: () => void;
}

export default function ManageLiquidity({
  walletAddress,
  signMessage,
  onDeposit,
  onWithdraw
}: ManageLiquidityProps) {
  const [balanceKey, setBalanceKey] = useState(0);

  const handleRefresh = () => {
    setBalanceKey(prev => prev + 1);
  };

  return (
    <div className="manage-liquidity">
      <BalanceDisplay
        key={balanceKey}
        walletAddress={walletAddress}
        signMessage={signMessage}
        onRefresh={handleRefresh}
      />

      <div className="liquidity-actions">
        <button 
          className="liquidity-action-btn add"
          onClick={onDeposit}
        >
          Add
        </button>
        <button 
          className="liquidity-action-btn withdraw"
          onClick={onWithdraw}
        >
          Withdraw
        </button>
      </div>

      <div className="info-box">
        <span>Add funds to start trading. Withdraw anytime to your wallet.</span>
      </div>
    </div>
  );
}
