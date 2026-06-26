'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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
  onWalletSelect: (walletId: string) => void | Promise<void>;
  className?: string;
  shouldOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function WalletSelector({ onWalletSelect, className, shouldOpen, onOpenChange }: WalletSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const walletSelectorRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  }, [onOpenChange]);

  useEffect(() => {
    if (shouldOpen) {
      setOpen(true);
      const timer = window.setTimeout(() => onOpenChange?.(false), 50);
      return () => window.clearTimeout(timer);
    }
  }, [shouldOpen, setOpen, onOpenChange]);

  const handleWalletClick = async (walletId: string) => {
    setOpen(false);
    await onWalletSelect(walletId);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (walletSelectorRef.current?.contains(target)) return;
      setOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setOpen]);

  return (
    <div ref={walletSelectorRef} className={`wallet-selector ${className ?? ''}`}>
      <button
        type="button"
        className="wallet-selector-trigger"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="wallet-icon"></span>
        <span className="wallet-text">Connect Wallet</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen ? (
        <div className="wallet-dropdown" role="listbox" aria-label="Wallet options">
          <div className="wallet-options">
            {walletOptions.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                className={`wallet-option ${wallet.active ? 'active' : 'inactive'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (wallet.active) {
                    void handleWalletClick(wallet.id);
                  }
                }}
                disabled={!wallet.active}
              >
                <span className="wallet-option-icon">{wallet.icon}</span>
                <div className="wallet-option-info">
                  <span className="wallet-option-name">{wallet.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
