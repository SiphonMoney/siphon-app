'use client';

import { useEffect, useState } from 'react';
import { showAppToast } from '../lib/appToast';
import {
  SUPPORTED_CHAIN_IDS,
  DEFAULT_CHAIN_ID,
  getNetwork,
  getSelectedChainId,
  installWalletChainSync,
  selectChainAndSwitchWallet,
} from '../lib/networks';

type ChainToggleProps = {
  className?: string;
  badgeClassName?: string;
};

export default function ChainToggle({ className, badgeClassName = 'strategy-modal-category-badge' }: ChainToggleProps) {
  const [chainId, setChainId] = useState(DEFAULT_CHAIN_ID);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    installWalletChainSync();
    setChainId(getSelectedChainId());
    const onChain = (e: Event) => {
      const id = (e as CustomEvent<{ chainId: number }>).detail?.chainId;
      if (id) setChainId(id);
    };
    window.addEventListener('siphon:chainChanged', onChain);
    window.addEventListener('siphon:walletChainChanged', onChain);
    return () => {
      window.removeEventListener('siphon:chainChanged', onChain);
      window.removeEventListener('siphon:walletChainChanged', onChain);
    };
  }, []);

  const selectChain = async (id: number) => {
    if (id === chainId || switching) return;
    setSwitching(true);
    try {
      const result = await selectChainAndSwitchWallet(id);
      if (!result.ok) {
        showAppToast(`Could not switch network: ${result.error}`, 'error');
        setChainId(result.chainId);
        return;
      }
      setChainId(result.chainId);
      window.dispatchEvent(new CustomEvent('siphon:networkReady', { detail: { chainId: result.chainId } }));
    } finally {
      setSwitching(false);
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
            disabled={switching}
            title={net.name}
          >
            {net.shortName}
          </button>
        );
      })}
    </div>
  );
}
