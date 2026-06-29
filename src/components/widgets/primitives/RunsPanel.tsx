"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatStrategyStatus,
  getExplorerTxUrl,
  getStrategies,
  isActiveStatus,
  type StrategyRecord,
} from "@/lib/strategyApi";
import { isQuickSwapStrategy } from "@/lib/quickSwapStrategyIds";
import { resolveWalletAddress } from "@/lib/walletAddress";
import { StrategyDetailModal } from "@/components/widgets/primitives/StrategyDetailModal";

const STATUS_POLL_MS = 5_000;
/** Keep finished runs visible briefly so status shows Executed/Failed before dropping off. */
const RECENT_FINISHED_MS = 3 * 60_000;

function shouldShowInRuns(s: StrategyRecord): boolean {
  if (isQuickSwapStrategy(s.id)) return false;
  if (isActiveStatus(s.status)) return true;
  if (s.status === "EXECUTED" || s.status === "FAILED") {
    const ts = s.executed_at ?? s.result_updated_at ?? s.created_at;
    if (!ts) return false;
    return Date.now() - new Date(ts).getTime() < RECENT_FINISHED_MS;
  }
  return false;
}

function openUserDashActivity() {
  window.dispatchEvent(new CustomEvent("userdash-view-change", { detail: "userdash" }));
  window.dispatchEvent(new CustomEvent("pro-view-mode-change", { detail: "userdash" }));
  window.dispatchEvent(
    new CustomEvent("siphon:activityLogFilter", { detail: { filter: "live" } }),
  );
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
            {isActiveStatus(strategy.status) && <span className="widget-runs-dot" aria-hidden />}
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
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyRecord | null>(null);
  const prevStatusRef = useRef<Map<string, string>>(new Map());

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

  const applyStrategies = useCallback((rows: StrategyRecord[]) => {
    const builderLive = rows.filter(shouldShowInRuns);

    for (const s of rows) {
      const prev = prevStatusRef.current.get(s.id);
      if (prev && prev !== s.status && (s.status === "EXECUTED" || s.status === "FAILED")) {
        window.dispatchEvent(
          new CustomEvent("siphon:strategyExecuted", { detail: { strategyId: s.id } }),
        );
      }
      prevStatusRef.current.set(s.id, s.status);
    }

    setStrategies(builderLive);
    setSelectedStrategy((current) => {
      if (!current) return null;
      const fresh = rows.find((s) => s.id === current.id);
      return fresh ?? current;
    });
  }, []);

  const fetchLiveStrategies = useCallback(
    async (silent = false) => {
      const userId = walletAddress ?? resolveWalletAddress();
      if (!userId) return;

      if (!silent) setLoading(true);

      try {
        const result = await getStrategies(userId);
        if (result.success && result.strategies) {
          applyStrategies(result.strategies);
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
    },
    [walletAddress, applyStrategies],
  );

  useEffect(() => {
    if (!walletAddress) {
      setStrategies([]);
      setError(null);
      setLoading(false);
      prevStatusRef.current.clear();
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

  useEffect(() => {
    if (!walletAddress || strategies.length === 0) return;
    const interval = setInterval(() => void fetchLiveStrategies(true), STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [walletAddress, strategies.length, fetchLiveStrategies]);

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

  const listContent =
    error && liveStrategies.length === 0 ? (
      <p className="widget-runs-empty widget-runs-empty--error">{error}</p>
    ) : visibleStrategies.length === 0 ? (
      <p className="widget-runs-empty">{emptyMessage}</p>
    ) : (
      <ul
        className={`widget-runs-list widget-runs-list--strategies${compact ? " widget-runs-list--compact" : " widget-runs-list--scroll"}`}
      >
        {visibleStrategies.map((s) => (
          <LiveStrategyItem
            key={s.id}
            strategy={s}
            compact={compact}
            onClick={() => setSelectedStrategy(s)}
          />
        ))}
      </ul>
    );

  return (
    <>
      {compact ? (
        <div className="widget-hover widget-card widget-card--compact widget-card--glance widget-runs-card widget-runs-card--compact">
          <div className="widget-runs-compact-header">
            <p className="widget-card-eyebrow">Runs</p>
            {liveStrategies.length > 0 ? (
              <button type="button" className="widget-runs-open-btn" onClick={openUserDashActivity}>
                Activity
              </button>
            ) : null}
          </div>
          <div className="widget-card-body widget-runs-body widget-runs-body--compact">{listContent}</div>
          <p className="widget-card-footnote">
            {liveStrategies.length > 0
              ? `${liveStrategies.length} live`
              : walletAddress
                ? "Run from builder"
                : "Connect wallet"}
          </p>
        </div>
      ) : (
        <div className="widget-hover widget-card widget-runs-card">
          <div className="widget-card-header widget-card-header--compact widget-runs-card-header">
            <div>
              <p className="widget-card-title">Runs</p>
              <p className="widget-card-subtitle">Live strategies</p>
            </div>
            {liveStrategies.length > 0 ? (
              <button type="button" className="widget-runs-open-btn" onClick={openUserDashActivity}>
                Activity log
              </button>
            ) : null}
          </div>
          <div className="widget-runs-body widget-runs-body--full">
            {!walletAddress ? (
              <p className="widget-runs-empty widget-runs-empty--full">
                Connect your wallet to see live strategies
              </p>
            ) : (
              listContent
            )}
          </div>
        </div>
      )}

      <StrategyDetailModal strategy={selectedStrategy} onClose={() => setSelectedStrategy(null)} />
    </>
  );
}
