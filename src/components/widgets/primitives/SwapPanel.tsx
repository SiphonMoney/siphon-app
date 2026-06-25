"use client";

import { useState } from "react";
import { ArrowDownUp } from "lucide-react";

const PAIRS = ["ETH", "USDC"] as const;

export function SwapPanel() {
  const [from, setFrom] = useState<(typeof PAIRS)[number]>("ETH");
  const [to, setTo] = useState<(typeof PAIRS)[number]>("USDC");
  const [amount, setAmount] = useState("");

  const flip = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div className="widget-hover widget-card widget-swap-card">
      <div className="widget-card-header widget-card-header--compact">
        <p className="widget-card-title">Quick swap</p>
        <p className="widget-card-subtitle">Pay & receive</p>
      </div>
      <div className="widget-swap-body">
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

        <button type="button" className="widget-swap-flip-btn" onClick={flip} aria-label="Flip tokens">
          <ArrowDownUp className="size-3.5" strokeWidth={1.75} />
        </button>

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
        </div>
      </div>
      <button type="button" className="widget-swap-submit" disabled={!amount.trim()}>
        Swap {from} → {to}
      </button>
    </div>
  );
}
