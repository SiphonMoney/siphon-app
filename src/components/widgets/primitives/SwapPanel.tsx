"use client";

import { useEffect, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { resolveWalletAddress } from "@/lib/walletAddress";

const PAIRS = ["ETH", "USDC"] as const;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

type SwapPanelProps = {
  compact?: boolean;
};

export function SwapPanel({ compact = false }: SwapPanelProps) {
  const [from, setFrom] = useState<(typeof PAIRS)[number]>("ETH");
  const [to, setTo] = useState<(typeof PAIRS)[number]>("USDC");
  const [amount, setAmount] = useState("");
  const [destinationWallet, setDestinationWallet] = useState("");

  useEffect(() => {
    const syncWallet = () => {
      const connected = resolveWalletAddress();
      setDestinationWallet((prev) => (prev.trim() ? prev : connected ?? ""));
    };
    syncWallet();
    window.addEventListener("walletConnected", syncWallet);
    window.addEventListener("walletDisconnected", syncWallet);
    return () => {
      window.removeEventListener("walletConnected", syncWallet);
      window.removeEventListener("walletDisconnected", syncWallet);
    };
  }, []);

  const flip = () => {
    setFrom(to);
    setTo(from);
  };

  const walletValid =
    !destinationWallet.trim() || WALLET_PATTERN.test(destinationWallet.trim());
  const canSubmit = amount.trim().length > 0 && walletValid;

  if (compact) {
    return (
      <div className="widget-hover widget-card widget-card--compact widget-card--glance widget-swap-card widget-swap-card--compact">
        <p className="widget-card-eyebrow">Quick swap</p>
        <div className="widget-swap-compact-body">
          <div className="widget-swap-compact-row">
            <input
              type="text"
              inputMode="decimal"
              className="widget-swap-compact-amount"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount to swap"
            />
            <select
              className="widget-swap-compact-token"
              value={from}
              onChange={(e) => setFrom(e.target.value as (typeof PAIRS)[number])}
              aria-label="Token to pay"
            >
              {PAIRS.map((t) => (
                <option key={t} value={t} disabled={t === to}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="widget-swap-compact-flip" onClick={flip} aria-label="Flip tokens">
            <ArrowDownUp className="widget-swap-flip-icon" strokeWidth={2} aria-hidden />
          </button>
          <div className="widget-swap-compact-row">
            <span className="widget-swap-compact-estimate">{amount ? "…" : "0.00"}</span>
            <select
              className="widget-swap-compact-token"
              value={to}
              onChange={(e) => setTo(e.target.value as (typeof PAIRS)[number])}
              aria-label="Token to receive"
            >
              {PAIRS.map((t) => (
                <option key={t} value={t} disabled={t === from}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            className="widget-swap-compact-wallet"
            placeholder="Destination wallet"
            value={destinationWallet}
            onChange={(e) => setDestinationWallet(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Destination wallet address"
            aria-invalid={!walletValid}
          />
        </div>
        <button type="button" className="widget-swap-compact-submit" disabled={!canSubmit}>
          Swap
        </button>
      </div>
    );
  }

  return (
    <div className="widget-hover widget-card widget-swap-card">
      <div className="widget-card-header widget-card-header--compact">
        <p className="widget-card-title">Quick swap</p>
        <p className="widget-card-subtitle">Pay & receive</p>
      </div>
      <div className="widget-swap-body">
        <div className="widget-swap-stack">
          <div className="widget-swap-field">
            <span className="widget-swap-field-label">Pay</span>
            <div className="widget-swap-field-row">
              <input
                type="text"
                inputMode="decimal"
                className="widget-swap-amount"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Amount to swap"
              />
              <select
                className="widget-swap-token"
                value={from}
                onChange={(e) => setFrom(e.target.value as (typeof PAIRS)[number])}
                aria-label="Token to pay"
              >
                {PAIRS.map((t) => (
                  <option key={t} value={t} disabled={t === to}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="widget-swap-divider">
            <button type="button" className="widget-swap-flip-btn" onClick={flip} aria-label="Flip tokens">
              <ArrowDownUp className="widget-swap-flip-icon" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="widget-swap-field">
            <span className="widget-swap-field-label">Receive</span>
            <div className="widget-swap-field-row">
              <span className="widget-swap-estimate">{amount ? "…" : "0.00"}</span>
              <select
                className="widget-swap-token"
                value={to}
                onChange={(e) => setTo(e.target.value as (typeof PAIRS)[number])}
                aria-label="Token to receive"
              >
                {PAIRS.map((t) => (
                  <option key={t} value={t} disabled={t === from}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              className="widget-swap-wallet"
              placeholder="0x… destination wallet"
              value={destinationWallet}
              onChange={(e) => setDestinationWallet(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-label="Destination wallet address"
              aria-invalid={!walletValid}
            />
          </div>
        </div>
      </div>
      <button type="button" className="widget-swap-submit" disabled={!canSubmit}>
        Swap {from} → {to}
      </button>
    </div>
  );
}
