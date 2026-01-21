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
    id: 'phantom',
    name: 'Phantom',
    icon: '',
    chain: 'Solana',
    description: 'Recommended for Solana',
    active: true
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '',
    chain: 'Solana/EVM',
    description: 'Supports Solana & EVM',
    active: true
  }
];

interface WalletSelectorProps {
  onWalletSelect: (walletId: string) => void;
  className?: string;
  shouldOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function WalletSelector({ onWalletSelect, className, shouldOpen, onOpenChange }: WalletSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const walletSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shouldOpen !== undefined && shouldOpen) {
      setIsOpen(true);
      // Reset the shouldOpen flag after opening
      if (onOpenChange) {
        // Use a small delay to ensure the state update happens
        setTimeout(() => {
          onOpenChange(false);
        }, 50);
      }
    }
  }, [shouldOpen, onOpenChange]);

  const handleWalletClick = async (walletId: string) => {
    setIsOpen(false);
    if (onOpenChange) {
      onOpenChange(false);
    }
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
        onClick={() => {
          const newState = !isOpen;
          setIsOpen(newState);
          if (onOpenChange) {
            onOpenChange(newState);
          }
        }}
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

