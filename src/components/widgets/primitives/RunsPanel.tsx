"use client";

import { useEffect, useMemo, useState } from "react";
import { useRunningStrategies } from "@/components/widgets/running-strategies-context";

function formatDuration(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function openRunsTab() {
  window.dispatchEvent(new CustomEvent("pro-view-mode-change", { detail: "run" }));
}

export function RunsPanel({ compact = false }: { compact?: boolean }) {
  const runningStrategies = useRunningStrategies();
  const [, tick] = useState(0);

  useEffect(() => {
    if (runningStrategies.size === 0) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [runningStrategies.size]);

  const runs = useMemo(
    () =>
      Array.from(runningStrategies.entries())
        .filter(([, data]) => data.isRunning)
        .sort((a, b) => a[1].startTime - b[1].startTime),
    [runningStrategies],
  );

  if (compact) {
    return (
      <div className="widget-hover widget-card widget-card--compact widget-card--glance widget-runs-card widget-runs-card--compact">
        <p className="widget-card-eyebrow">Runs</p>
        <div className="widget-card-body widget-runs-body">
          {runs.length === 0 ? (
            <p className="widget-runs-empty">No active runs</p>
          ) : (
            <ul className="widget-runs-list widget-runs-list--compact">
              {runs.slice(0, 3).map(([name, data]) => (
                <li key={name}>
                  <button type="button" className="widget-runs-item" onClick={openRunsTab}>
                    <span className="widget-runs-dot" aria-hidden />
                    <span className="widget-runs-name">{name}</span>
                    <span className="widget-runs-duration">{formatDuration(data.startTime)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="widget-card-footnote">
          {runs.length > 0 ? `${runs.length} active` : "Start from builder"}
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
        {runs.length > 0 ? (
          <button type="button" className="widget-runs-open-btn" onClick={openRunsTab}>
            View all
          </button>
        ) : null}
      </div>
      <div className="widget-runs-body widget-runs-body--full">
        {runs.length === 0 ? (
          <p className="widget-runs-empty widget-runs-empty--full">No strategies running</p>
        ) : (
          <ul className="widget-runs-list">
            {runs.map(([name, data]) => (
              <li key={name}>
                <button type="button" className="widget-runs-item widget-runs-item--full" onClick={openRunsTab}>
                  <span className="widget-runs-item-main">
                    <span className="widget-runs-dot" aria-hidden />
                    <span className="widget-runs-name">{name}</span>
                  </span>
                  <span className="widget-runs-duration">{formatDuration(data.startTime)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
