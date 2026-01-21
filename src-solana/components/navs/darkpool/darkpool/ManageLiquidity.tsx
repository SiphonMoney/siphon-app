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
  return (
    <div className="manage-liquidity">
      <div className="info-box">
        <span>Add funds to start trading. Withdraw anytime to your wallet.</span>
      </div>

      <BalanceDisplay
        walletAddress={walletAddress}
        signMessage={signMessage}
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
    </div>
  );
}
