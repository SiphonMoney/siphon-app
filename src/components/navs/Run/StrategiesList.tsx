"use client";

import { useCallback, useEffect, useState } from "react";
import { walletManager } from "../../extensions/walletManager";
import {
  formatStrategyStatus,
  getExplorerTxUrl,
  getStrategies,
  isActiveStatus,
  processArmedStrategies,
  StrategyRecord,
} from "@/lib/strategyApi";

interface StrategiesListProps {
  isLoaded?: boolean;
}

function resolveWalletAddress(): string | null {
  const fromManager = walletManager.getPrimaryWallet()?.address
    ?? walletManager.getConnectedWallets().find((w) => w.id === "metamask")?.address;
  if (fromManager) return fromManager;

  try {
    const stored = localStorage.getItem("siphon-connected-wallet");
    if (stored) {
      const parsed = JSON.parse(stored) as { address?: string };
      if (parsed.address) return parsed.address;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export default function StrategiesList({ isLoaded = true }: StrategiesListProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  useEffect(() => {
    const sync = () => setWalletAddress(resolveWalletAddress());
    sync();
    window.addEventListener("walletConnected", sync);
    window.addEventListener("walletDisconnected", sync);
    const poll = setInterval(sync, 2000);
    return () => {
      window.removeEventListener("walletConnected", sync);
      window.removeEventListener("walletDisconnected", sync);
      clearInterval(poll);
    };
  }, []);

  const fetchStrategies = useCallback(async () => {
    const userId = walletAddress ?? resolveWalletAddress();
    if (!userId) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getStrategies(userId);
      if (result.success && result.strategies) {
        setStrategies(result.strategies);
        processArmedStrategies(userId)
          .then((ids) => { if (ids.length) void fetchStrategies(); })
          .catch((e) => console.error("[StrategiesList] auto-execute:", e));
      } else {
        setError(result.error || "Failed to fetch strategies");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      void fetchStrategies();
      const interval = setInterval(() => void fetchStrategies(), 30_000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, fetchStrategies]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  };

  const filtered = strategies.filter((s) => {
    if (filter === "active") return isActiveStatus(s.status);
    if (filter === "done") return s.status === "EXECUTED" || s.status === "FAILED";
    return true;
  });

  if (!isLoaded) return null;

  if (!walletAddress) {
    return (
      <div className="run-mode-empty">
        <p className="run-mode-empty-title">Connect your wallet</p>
        <p className="run-mode-empty-hint">Your submitted strategies will appear here</p>
      </div>
    );
  }

  return (
    <div className="run-backend-panel">
      <div className="run-backend-toolbar">
        <div className="run-mode-view-switcher">
          {(["all", "active", "done"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`run-mode-view-btn ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {key === "all" ? "All" : key === "active" ? "In progress" : "Completed"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="run-backend-refresh"
          onClick={() => void fetchStrategies()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="run-backend-error">{error}</div>}

      {loading && strategies.length === 0 && !error && (
        <div className="run-mode-empty">
          <p className="run-mode-empty-title">Loading strategies…</p>
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="run-mode-empty">
          <p className="run-mode-empty-title">No strategies yet</p>
          <p className="run-mode-empty-hint">
            Run a strategy from Discover or Build — it will show up here with live status
          </p>
        </div>
      )}

      <div className="run-backend-list">
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`run-backend-card ${isActiveStatus(s.status) ? "active" : ""} status-${s.status.toLowerCase()}`}
          >
            <div className="run-backend-card-header">
              <div>
                <h3 className="run-backend-card-title">
                  {s.amount} {s.asset_in} → {s.asset_out}
                </h3>
                <p className="run-backend-card-sub">
                  {s.strategy_type.replace(/_/g, " ")} · ID {s.id.slice(0, 8)}…
                </p>
              </div>
              <span className={`run-status-badge status-${s.status.toLowerCase()}`}>
                {isActiveStatus(s.status) && <span className="status-dot" />}
                {formatStrategyStatus(s.status)}
              </span>
            </div>

            <div className="run-backend-meta">
              <div className="run-backend-meta-row">
                <span className="run-backend-meta-label">Created</span>
                <span className="run-backend-meta-value">{formatDate(s.created_at)}</span>
              </div>
              {s.result_updated_at && (
                <div className="run-backend-meta-row">
                  <span className="run-backend-meta-label">Last evaluated</span>
                  <span className="run-backend-meta-value">{formatDate(s.result_updated_at)}</span>
                </div>
              )}
              {s.executed_at && (
                <div className="run-backend-meta-row">
                  <span className="run-backend-meta-label">Executed</span>
                  <span className="run-backend-meta-value">{formatDate(s.executed_at)}</span>
                </div>
              )}
            </div>

            {s.tx_hash && (
              <div className="run-backend-tx">
                <span className="run-backend-meta-label">Transaction</span>
                <a
                  href={getExplorerTxUrl(s.tx_hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="run-backend-tx-link"
                >
                  {s.tx_hash.slice(0, 10)}…{s.tx_hash.slice(-8)} ↗
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
