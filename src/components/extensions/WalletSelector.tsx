'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  const [mounted, setMounted] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const walletSelectorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateDropdownPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = rect.width;
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    );

    setDropdownStyle({
      top: rect.bottom + 8,
      left,
      width,
    });
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
    if (open) {
      requestAnimationFrame(updateDropdownPosition);
    }
  }, [onOpenChange, updateDropdownPosition]);

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
      if (
        walletSelectorRef.current?.contains(target) ||
        (target instanceof Element && target.closest('.wallet-dropdown-portal'))
      ) {
        return;
      }
      setOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setOpen]);

  useEffect(() => {
    if (!isOpen) return;

    updateDropdownPosition();

    const handleReposition = () => updateDropdownPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updateDropdownPosition]);

  const dropdown = isOpen && dropdownStyle && mounted
    ? createPortal(
        <div
          className="wallet-dropdown wallet-dropdown-portal"
          style={{
            position: 'fixed',
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
          }}
        >
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
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div ref={walletSelectorRef} className={`wallet-selector ${className ?? ''}`}>
        <button
          ref={triggerRef}
          type="button"
          className="wallet-selector-trigger"
          onClick={() => setOpen(!isOpen)}
        >
          <span className="wallet-icon"></span>
          <span className="wallet-text">Connect Wallet</span>
          <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
        </button>
      </div>
      {dropdown}
    </>
  );
}
