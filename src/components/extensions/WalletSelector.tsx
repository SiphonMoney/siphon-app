'use client';

import { useState, useEffect, useRef } from 'react';

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
    id: 'metamask',
    name: 'MetaMask',
    icon: 'MM',
    chain: 'EVM',
    description: '',
    active: true
  }
];

interface WalletSelectorProps {
  onWalletSelect: (walletId: string) => void;
  className?: string;
}

export default function WalletSelector({ onWalletSelect, className }: WalletSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const walletSelectorRef = useRef<HTMLDivElement>(null);

  const handleWalletClick = async (walletId: string) => {
    setIsOpen(false);
    onWalletSelect(walletId);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (walletSelectorRef.current && !walletSelectorRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={walletSelectorRef} className={`wallet-selector ${className}`}>
      <button 
        className="wallet-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="wallet-icon"></span>
        <span className="wallet-text">Connect Wallet</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="wallet-dropdown">
          <div className="wallet-options">
            {walletOptions.map((wallet) => (
              <button
                key={wallet.id}
                className={`wallet-option ${wallet.active ? 'active' : 'inactive'}`}
                onClick={() => wallet.active && handleWalletClick(wallet.id)}
                disabled={!wallet.active}
              >
                <span className="wallet-option-icon">{wallet.icon}</span>
                <div className="wallet-option-info">
                  <span className="wallet-option-name">{wallet.name}</span>
                  <span className="wallet-option-chain">{wallet.chain}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

