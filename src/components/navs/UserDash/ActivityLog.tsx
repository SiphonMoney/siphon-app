"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatStrategyStatus,
  getExplorerTxUrl,
  getStrategies,
  isActiveStatus,
  type StrategyRecord,
} from "@/lib/strategyApi";
import {
  exportUserActivitiesCsv,
  getUserActivities,
  type UserActivityEntry,
  type UserActivityKind,
} from "@/lib/userActivityLog";

interface ActivityLogProps {
  walletAddress: string;
}

type ActivityFilter = "all" | "deposits" | "withdrawals" | "strategies" | "live";

interface ActivityRow {
  id: string;
  kind: UserActivityKind;
  title: string;
  subtitle: string;
  status: string;
  statusClass: string;
  timestamp: string;
  txHash: string | null;
  isActive: boolean;
}

function strategyToRow(s: StrategyRecord): ActivityRow {
  const active = isActiveStatus(s.status);
  return {
    id: `strategy-${s.id}`,
    kind: "strategy",
    title: `${s.amount} ${s.asset_in} → ${s.asset_out}`,
    subtitle: s.strategy_type.replace(/_/g, " "),
    status: formatStrategyStatus(s.status),
    statusClass: s.status.toLowerCase(),
    timestamp: s.executed_at ?? s.result_updated_at ?? s.created_at,
    txHash: s.tx_hash,
    isActive: active,
  };
}

function localToRow(e: UserActivityEntry): ActivityRow {
  const status = e.status ?? "logged";
  return {
    id: e.id,
    kind: e.kind,
    title: e.label ?? `${e.kind} ${e.amount ?? ""} ${e.token ?? ""}`.trim(),
    subtitle:
      e.kind === "deposit"
        ? "Vault deposit"
        : e.kind === "withdraw"
          ? "Vault withdraw"
          : "Strategy launch",
    status,
    statusClass:
      status === "confirmed" || status === "EXECUTED" || status === "executed"
        ? "executed"
        : status === "FAILED" || status === "failed"
          ? "failed"
          : activeStatus(status)
            ? "armed"
            : "pending",
    timestamp: e.timestamp,
    txHash: e.txHash ?? null,
    isActive: activeStatus(status),
  };
}

function activeStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "pending" || s === "armed" || s === "submitted";
}

export default function ActivityLog({ walletAddress }: ActivityLogProps) {
  const [localEntries, setLocalEntries] = useState<UserActivityEntry[]>([]);
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const loadLocal = useCallback(() => {
    setLocalEntries(getUserActivities(walletAddress));
  }, [walletAddress]);

  const fetchRemote = useCallback(async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getStrategies(walletAddress);
      if (result.success && result.strategies) {
        setStrategies(result.strategies);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const refresh = useCallback(async () => {
    loadLocal();
    await fetchRemote();
  }, [loadLocal, fetchRemote]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void fetchRemote(), 8_000);
    const onActivity = () => loadLocal();
    const onExecuted = () => void fetchRemote();
    const onFilter = (e: Event) => {
      const detail = (e as CustomEvent<{ filter?: ActivityFilter; strategyId?: string }>).detail;
      if (detail?.filter) setFilter(detail.filter);
    };
    window.addEventListener("siphon:userActivityUpdated", onActivity);
    window.addEventListener("siphon:strategyExecuted", onExecuted);
    window.addEventListener("siphon:activityLogFilter", onFilter);
    return () => {
      clearInterval(interval);
      window.removeEventListener("siphon:userActivityUpdated", onActivity);
      window.removeEventListener("siphon:strategyExecuted", onExecuted);
      window.removeEventListener("siphon:activityLogFilter", onFilter);
    };
  }, [refresh, fetchRemote, loadLocal]);

  const rows = useMemo(() => {
    const strategyIds = new Set(strategies.map((s) => s.id));
    const localNonDupe = localEntries.filter(
      (e) => !(e.kind === "strategy" && e.strategyId && strategyIds.has(e.strategyId)),
    );

    const merged: ActivityRow[] = [
      ...strategies.map(strategyToRow),
      ...localNonDupe.map(localToRow),
    ];

    merged.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return merged.filter((row) => {
      if (filter === "all") return true;
      if (filter === "deposits") return row.kind === "deposit";
      if (filter === "withdrawals") return row.kind === "withdraw";
      if (filter === "strategies") return row.kind === "strategy";
      if (filter === "live") return row.isActive;
      return true;
    });
  }, [strategies, localEntries, filter]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleExport = () => {
    const exportRows: UserActivityEntry[] = [
      ...localEntries,
      ...strategies.map((s) => ({
        id: `strategy-${s.id}`,
        kind: "strategy" as const,
        timestamp: s.created_at,
        token: s.asset_in,
        amount: s.amount,
        txHash: s.tx_hash,
        status: s.status,
        strategyId: s.id,
        label: `${s.amount} ${s.asset_in} → ${s.asset_out} (${s.strategy_type})`,
      })),
    ];
    exportUserActivitiesCsv(walletAddress, exportRows);
  };

  return (
    <div className="userdash-activity">
      <p className="userdash-activity-privacy">
        Private to your wallet on this device — not visible to other users.
      </p>

      <div className="userdash-activity-toolbar">
        <div className="userdash-activity-filters" role="tablist" aria-label="Activity filter">
          {(
            [
              ["all", "All"],
              ["deposits", "Deposits"],
              ["withdrawals", "Withdraws"],
              ["strategies", "Strategies"],
              ["live", "Live"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`userdash-activity-filter${filter === key ? " active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="userdash-activity-actions">
          <button
            type="button"
            className="userdash-activity-export"
            onClick={handleExport}
            title="Export CSV"
          >
            CSV
          </button>
          <button
            type="button"
            className="userdash-activity-refresh"
            onClick={() => void refresh()}
            disabled={loading}
            title="Refresh activity"
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      {error && (
        <p className="userdash-activity-error">
          {error}
          <span className="userdash-activity-error-hint">
            {" "}
            Local deposits and withdrawals still appear below.
          </span>
        </p>
      )}

      <div className="userdash-activity-list">
        {loading && rows.length === 0 && !error && (
          <p className="userdash-activity-empty">Loading activity…</p>
        )}

        {!loading && rows.length === 0 && !error && (
          <p className="userdash-activity-empty">
            No activity yet. Deposits, withdrawals, and strategy runs will show up here.
          </p>
        )}

        {rows.map((row) => (
          <article
            key={row.id}
            className={`userdash-activity-item status-${row.statusClass}${row.isActive ? " is-active" : ""}`}
          >
            <div className="userdash-activity-item-top">
              <div className="userdash-activity-item-main">
                <span className="userdash-activity-item-title">{row.title}</span>
                <span className="userdash-activity-item-type">{row.subtitle}</span>
              </div>
              <span className={`userdash-activity-badge status-${row.statusClass}`}>
                {row.isActive && <span className="userdash-activity-dot" />}
                {row.status}
              </span>
            </div>

            <div className="userdash-activity-item-meta">
              <span>{formatDate(row.timestamp)}</span>
              {row.txHash && (
                <a
                  href={getExplorerTxUrl(row.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="userdash-activity-tx"
                  onClick={(e) => e.stopPropagation()}
                >
                  tx ↗
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
