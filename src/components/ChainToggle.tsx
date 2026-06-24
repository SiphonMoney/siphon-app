'use client';

import { useEffect, useState } from 'react';
import {
  SUPPORTED_CHAIN_IDS,
  getNetwork,
  getSelectedChainId,
  setSelectedChainId,
  switchWalletNetwork,
} from '../lib/networks';

type ChainToggleProps = {
  className?: string;
  badgeClassName?: string;
};

export default function ChainToggle({ className, badgeClassName = 'strategy-modal-category-badge' }: ChainToggleProps) {
  const [chainId, setChainId] = useState(84532);

  useEffect(() => {
    setChainId(getSelectedChainId());
    const onChain = (e: Event) => {
      const id = (e as CustomEvent<{ chainId: number }>).detail?.chainId;
      if (id) setChainId(id);
    };
    window.addEventListener('siphon:chainChanged', onChain);
    return () => window.removeEventListener('siphon:chainChanged', onChain);
  }, []);

  const selectChain = async (id: number) => {
    if (id === chainId) return;
    setSelectedChainId(id);
    setChainId(id);
    const eth = (window as Window & { ethereum?: { request: (p: { method: string; params?: unknown[] }) => Promise<unknown> } })?.ethereum;
    if (eth) {
      try {
        await switchWalletNetwork(eth, id);
      } catch {
        // Dapp network updated even if the wallet rejects the switch prompt.
      }
    }
  };

  return (
    <div className={className} role="group" aria-label="EVM network">
      {SUPPORTED_CHAIN_IDS.map((id) => {
        const net = getNetwork(id);
        const active = id === chainId;
        return (
          <button
            key={id}
            type="button"
            className={`${badgeClassName} ${active ? 'active' : 'inactive'}`}
            onClick={() => selectChain(id)}
            title={net.name}
          >
            {net.shortName}
          </button>
        );
      })}
    </div>
  );
}
