"use client";

import { useCallback, useEffect, useState } from "react";
import ConnectButton from "@/components/extensions/ConnectButton";
import { walletManager, type WalletInfo } from "@/components/extensions/walletManager";
import { getSpendableVaultBalance } from "@/lib/zkHandler";
import { TOKEN_MAP } from "@/lib/nexus";
import { getSelectedChainId } from "@/lib/networks";

const VAULT_TOKENS = ["ETH", "USDC"] as const;

function formatVaultAmount(symbol: (typeof VAULT_TOKENS)[number], amount: number): string {
  return symbol === "USDC" ? amount.toFixed(2) : amount.toFixed(4);
}

export function WalletPanel({ sectionId }: { sectionId?: string }) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [vaultBalances, setVaultBalances] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const sync = () => {
      const wallets = walletManager.getConnectedWallets();
      setWallet(wallets[0] ?? null);
    };
    sync();
    window.addEventListener("walletConnected", sync);
    window.addEventListener("walletDisconnected", sync);
    return () => {
      window.removeEventListener("walletConnected", sync);
      window.removeEventListener("walletDisconnected", sync);
    };
  }, []);

  const loadVaultBalances = useCallback(async () => {
    if (!wallet || wallet.id !== "metamask") {
      setVaultBalances(null);
      return;
    }
    try {
      const { details } = await getSpendableVaultBalance(getSelectedChainId(), TOKEN_MAP);
      const next: Record<string, number> = {};
      for (const sym of VAULT_TOKENS) {
        const key = Object.keys(details).find((k) => k.toUpperCase() === sym);
        next[sym] = key ? details[key] : 0;
      }
      setVaultBalances(next);
    } catch {
      setVaultBalances({ ETH: 0, USDC: 0 });
    }
  }, [wallet]);

  useEffect(() => {
    void loadVaultBalances();
    const id = window.setInterval(() => void loadVaultBalances(), 60_000);
    return () => window.clearInterval(id);
  }, [loadVaultBalances]);

  useEffect(() => {
    const onChain = () => void loadVaultBalances();
    window.addEventListener("siphon:chainChanged", onChain);
    window.addEventListener("siphon:walletChainChanged", onChain);
    window.addEventListener("siphon:networkReady", onChain);
    return () => {
      window.removeEventListener("siphon:chainChanged", onChain);
      window.removeEventListener("siphon:walletChainChanged", onChain);
      window.removeEventListener("siphon:networkReady", onChain);
    };
  }, [loadVaultBalances]);

  const openDashboard = () => {
    window.dispatchEvent(new CustomEvent("userdash-view-change", { detail: "userdash" }));
    window.dispatchEvent(new CustomEvent("pro-view-mode-change", { detail: "userdash" }));
  };

  return (
    <div {...(sectionId ? { id: sectionId } : {})} className="widget-hover widget-card">
      <div className="widget-card-header widget-card-header--compact">
        <div>
          <p className="widget-card-title">Wallet</p>
          <p className="widget-card-subtitle">Siphon vault balance</p>
        </div>
      </div>
      <div className="widget-wallet-body">
        {wallet ? (
          <>
            <div className="widget-wallet-balance-block">
              <p className="widget-stat-label">Vault</p>
              <ul className="widget-wallet-vault-list">
                {VAULT_TOKENS.map((sym) => (
                  <li key={sym} className="widget-wallet-vault-row">
                    <span className="widget-wallet-vault-symbol">{sym}</span>
                    <span className="widget-wallet-vault-amount">
                      {vaultBalances
                        ? formatVaultAmount(sym, vaultBalances[sym] ?? 0)
                        : "…"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="widget-wallet-address">
                {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
              </p>
            </div>
            <button type="button" className="widget-wallet-action" onClick={openDashboard}>
              Open dashboard
            </button>
          </>
        ) : (
          <div className="widget-wallet-connect">
            <p className="widget-card-subtitle">Connect to view vault funds</p>
            <ConnectButton className="widget-wallet-connect-btn" />
          </div>
        )}
      </div>
    </div>
  );
}
