"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatStrategyStatus,
  getExplorerTxUrl,
  getStrategies,
  isActiveStatus,
  type StrategyRecord,
} from "@/lib/strategyApi";
import { resolveWalletAddress } from "@/lib/walletAddress";

function openRunsTab() {
  window.dispatchEvent(new CustomEvent("pro-view-mode-change", { detail: "run" }));
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LiveStrategyItem({
  strategy,
  compact,
  onClick,
}: {
  strategy: StrategyRecord;
  compact?: boolean;
  onClick: () => void;
}) {
  const statusClass = strategy.status.toLowerCase();

  return (
    <li>
      <button
        type="button"
        className={`widget-runs-strategy-item${compact ? " widget-runs-strategy-item--compact" : ""}`}
        onClick={onClick}
      >
        <div className="widget-runs-strategy-top">
          <div className="widget-runs-strategy-main">
            <span className="widget-runs-strategy-title">
              {strategy.amount} {strategy.asset_in} → {strategy.asset_out}
            </span>
            <span className="widget-runs-strategy-type">
              {strategy.strategy_type.replace(/_/g, " ")}
            </span>
          </div>
          <span className={`widget-runs-badge status-${statusClass}`}>
            <span className="widget-runs-dot" aria-hidden />
            {formatStrategyStatus(strategy.status)}
          </span>
        </div>
        {!compact && (
          <div className="widget-runs-strategy-meta">
            <span>{formatDate(strategy.result_updated_at ?? strategy.created_at)}</span>
            {strategy.tx_hash && (
              <a
                href={getExplorerTxUrl(strategy.tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="widget-runs-strategy-tx"
                onClick={(e) => e.stopPropagation()}
              >
                tx ↗
              </a>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

export function RunsPanel({ compact = false }: { compact?: boolean }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setWalletAddress(resolveWalletAddress());
    sync();
    window.addEventListener("walletConnected", sync);
    window.addEventListener("walletDisconnected", sync);
    return () => {
      window.removeEventListener("walletConnected", sync);
      window.removeEventListener("walletDisconnected", sync);
    };
  }, []);

  const fetchLiveStrategies = useCallback(async (silent = false) => {
    const userId = walletAddress ?? resolveWalletAddress();
    if (!userId) return;

    if (!silent) setLoading(true);

    try {
      const result = await getStrategies(userId);
      if (result.success && result.strategies) {
        setStrategies(result.strategies.filter((s) => isActiveStatus(s.status)));
        setError(null);
      } else if (result.error) {
        setStrategies((prev) => {
          if (prev.length === 0) setError(result.error!);
          return prev;
        });
      }
    } catch (err) {
      setStrategies((prev) => {
        if (prev.length === 0) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
        return prev;
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      setStrategies([]);
      setError(null);
      setLoading(false);
      return;
    }

    void fetchLiveStrategies(false);

    const onStrategyEvent = () => void fetchLiveStrategies(true);
    window.addEventListener("siphon:strategySubmitted", onStrategyEvent);
    window.addEventListener("siphon:strategyExecuted", onStrategyEvent);
    return () => {
      window.removeEventListener("siphon:strategySubmitted", onStrategyEvent);
      window.removeEventListener("siphon:strategyExecuted", onStrategyEvent);
    };
  }, [walletAddress, fetchLiveStrategies]);

  const liveStrategies = useMemo(
    () =>
      [...strategies].sort(
        (a, b) =>
          new Date(b.result_updated_at ?? b.created_at).getTime() -
          new Date(a.result_updated_at ?? a.created_at).getTime(),
      ),
    [strategies],
  );

  const visibleStrategies = compact ? liveStrategies.slice(0, 3) : liveStrategies;

  const emptyMessage = !walletAddress
    ? "Connect wallet"
    : loading && liveStrategies.length === 0
      ? "Loading…"
      : "No live strategies";

  if (compact) {
    return (
      <div className="widget-hover widget-card widget-card--compact widget-card--glance widget-runs-card widget-runs-card--compact">
        <p className="widget-card-eyebrow">Runs</p>
        <div className="widget-card-body widget-runs-body">
          {error && liveStrategies.length === 0 ? (
            <p className="widget-runs-empty widget-runs-empty--error">{error}</p>
          ) : visibleStrategies.length === 0 ? (
            <p className="widget-runs-empty">{emptyMessage}</p>
          ) : (
            <ul className="widget-runs-list widget-runs-list--compact widget-runs-list--strategies">
              {visibleStrategies.map((s) => (
                <LiveStrategyItem key={s.id} strategy={s} compact onClick={openRunsTab} />
              ))}
            </ul>
          )}
        </div>
        <p className="widget-card-footnote">
          {liveStrategies.length > 0
            ? `${liveStrategies.length} live`
            : walletAddress
              ? "Run from builder"
              : "Connect wallet"}
        </p>
      </div>
    );
  }

  return (
    <div className="widget-hover widget-card widget-runs-card">
      <div className="widget-card-header widget-card-header--compact">
        <div>
          <p className="widget-card-title">Runs</p>
          <p className="widget-card-subtitle">Live strategies</p>
        </div>
        {liveStrategies.length > 0 ? (
          <button type="button" className="widget-runs-open-btn" onClick={openRunsTab}>
            View all
          </button>
        ) : null}
      </div>
      <div className="widget-runs-body widget-runs-body--full">
        {!walletAddress ? (
          <p className="widget-runs-empty widget-runs-empty--full">Connect your wallet to see live strategies</p>
        ) : error && liveStrategies.length === 0 ? (
          <p className="widget-runs-empty widget-runs-empty--full widget-runs-empty--error">{error}</p>
        ) : loading && liveStrategies.length === 0 ? (
          <p className="widget-runs-empty widget-runs-empty--full">Loading live strategies…</p>
        ) : liveStrategies.length === 0 ? (
          <p className="widget-runs-empty widget-runs-empty--full">No live strategies</p>
        ) : (
          <ul className="widget-runs-list widget-runs-list--strategies widget-runs-list--scroll">
            {liveStrategies.map((s) => (
              <LiveStrategyItem key={s.id} strategy={s} onClick={openRunsTab} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
