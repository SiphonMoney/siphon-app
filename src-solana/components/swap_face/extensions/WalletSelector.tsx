'use client';

import { useState } from 'react';

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  chain: string;
  description: string;
  active: boolean;
}

const walletOptions: WalletOption[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: 'PH',
    chain: 'Solana',
    description: 'Connect to Solana blockchain',
    active: true
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: 'SF',
    chain: 'Solana',
    description: 'Connect to Solana blockchain',
    active: true
  }
];

interface WalletSelectorProps {
  onWalletSelect: (walletId: string) => void;
  className?: string;
}

export default function WalletSelector({ onWalletSelect, className }: WalletSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleWalletClick = async (walletId: string) => {
    setIsOpen(false);
    onWalletSelect(walletId);
  };

  return (
    <div className={`wallet-selector ${className}`}>
      <button 
        className="wallet-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="wallet-icon">🔗</span>
        <span className="wallet-text">Connect Wallet</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="wallet-dropdown">
            <p>preferred wallet to connect</p>
          
          <div className="wallet-options">
            {walletOptions.map((wallet) => (
              <button
                key={wallet.id}
                className={`wallet-option ${wallet.active ? 'active' : 'inactive'}`}
                onClick={() => wallet.active && handleWalletClick(wallet.id)}
                disabled={!wallet.active}
              >
                <div className="wallet-option-content">
                  <div className="wallet-option-header">
                    <span className="wallet-option-icon">{wallet.icon}</span>
                    <div className="wallet-option-info">
                      <span className="wallet-option-name">{wallet.name}</span>
                      <span className="wallet-option-chain">{wallet.chain}</span>
                    </div>
                    {wallet.active ? (
                      <span className="status-indicator active">●</span>
                    ) : (
                      <span className="status-indicator inactive">○</span>
                    )}
                  </div>
                  <p className="wallet-option-description">{wallet.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
