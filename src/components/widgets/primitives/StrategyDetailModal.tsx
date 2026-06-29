"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  formatStrategyStatus,
  getExplorerTxUrl,
  isActiveStatus,
  type StrategyRecord,
} from "@/lib/strategyApi";
import "@/components/navs/Run/Run.css";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function StrategyDetailModal({
  strategy,
  onClose,
}: {
  strategy: StrategyRecord | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!strategy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [strategy, onClose]);

  if (!strategy || typeof document === "undefined") return null;

  const statusClass = strategy.status.toLowerCase();

  return createPortal(
    <div className="strategy-detail-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="strategy-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="strategy-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="strategy-detail-modal-header">
          <div>
            <p className="strategy-detail-modal-eyebrow">Strategy run</p>
            <h2 id="strategy-detail-title" className="strategy-detail-modal-title">
              {strategy.amount} {strategy.asset_in} → {strategy.asset_out}
            </h2>
            <p className="strategy-detail-modal-sub">
              {strategy.strategy_type.replace(/_/g, " ")} · {strategy.id.slice(0, 8)}…
            </p>
          </div>
          <button type="button" className="strategy-detail-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className={`run-backend-card strategy-detail-modal-card status-${statusClass}${isActiveStatus(strategy.status) ? " active" : ""}`}>
          <div className="run-backend-card-header">
            <div>
              <h3 className="run-backend-card-title">Status</h3>
              <p className="run-backend-card-sub">Live from trade executor</p>
            </div>
            <span className={`run-status-badge status-${statusClass}`}>
              {isActiveStatus(strategy.status) && <span className="status-dot" />}
              {formatStrategyStatus(strategy.status)}
            </span>
          </div>

          <div className="run-backend-meta">
            <div className="run-backend-meta-row">
              <span className="run-backend-meta-label">Created</span>
              <span className="run-backend-meta-value">{formatDate(strategy.created_at)}</span>
            </div>
            {strategy.result_updated_at && (
              <div className="run-backend-meta-row">
                <span className="run-backend-meta-label">Last evaluated</span>
                <span className="run-backend-meta-value">{formatDate(strategy.result_updated_at)}</span>
              </div>
            )}
            {strategy.executed_at && (
              <div className="run-backend-meta-row">
                <span className="run-backend-meta-label">Executed</span>
                <span className="run-backend-meta-value">{formatDate(strategy.executed_at)}</span>
              </div>
            )}
          </div>

          {strategy.tx_hash && (
            <div className="run-backend-tx">
              <span className="run-backend-meta-label">Transaction</span>
              <a
                href={getExplorerTxUrl(strategy.tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="run-backend-tx-link"
              >
                {strategy.tx_hash.slice(0, 10)}…{strategy.tx_hash.slice(-8)} ↗
              </a>
            </div>
          )}
        </div>

        <footer className="strategy-detail-modal-footer">
          <button
            type="button"
            className="strategy-detail-modal-link-btn"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("userdash-view-change", { detail: "userdash" }));
              window.dispatchEvent(new CustomEvent("pro-view-mode-change", { detail: "userdash" }));
              window.dispatchEvent(
                new CustomEvent("siphon:activityLogFilter", {
                  detail: { filter: "strategies", strategyId: strategy.id },
                }),
              );
              onClose();
            }}
          >
            Open in activity log
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
