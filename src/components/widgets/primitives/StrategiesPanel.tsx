"use client";

import { useMemo } from "react";
import { strategyList, type StrategyMetadata } from "@/components/navs/Discover/strategies";
import type { SizePreset } from "@/components/widgets/config/grid";
import { SIZE_TO_GRID } from "@/components/widgets/config/grid";

function sortStrategies(strategies: StrategyMetadata[]): StrategyMetadata[] {
  return [...strategies].sort((a, b) => {
    const aRank = a.isActive ? 0 : 1;
    const bRank = b.isActive ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    return 0;
  });
}

function StrategyCard({ strategy, compact }: { strategy: StrategyMetadata; compact?: boolean }) {
  const load = () => {
    if (!strategy.isActive) return;
    window.dispatchEvent(
      new CustomEvent("build-select-strategy-template", { detail: strategy.name }),
    );
  };

  return (
    <button
      type="button"
      className={`build-strategy-card ${compact ? "build-strategy-card--compact" : ""} ${strategy.isActive ? "" : "build-strategy-card--soon"}`}
      onClick={load}
      disabled={!strategy.isActive}
      title={strategy.isActive ? `Load ${strategy.name}` : "Coming soon"}
    >
      <div className="build-strategy-card-top">
        <span className="widget-badge">{strategy.category}</span>
        {!strategy.isActive ? <span className="build-strategy-soon">Soon</span> : null}
      </div>
      <p className="build-strategy-name">{strategy.name}</p>
      {!compact ? <p className="build-strategy-desc">{strategy.description}</p> : null}
      <div className="build-strategy-meta">
        <span>{strategy.nodes} nodes</span>
        <span className="build-strategy-profit">{strategy.profit}</span>
      </div>
    </button>
  );
}

function gridColumnsForSize(size: SizePreset): 1 | 2 {
  const { col, row } = SIZE_TO_GRID[size];
  return col >= 2 && row >= 2 ? 2 : 1;
}

export function StrategiesPanel({
  sectionId,
  size = "2x2",
}: {
  sectionId?: string;
  size?: SizePreset;
}) {
  const columns = gridColumnsForSize(size);
  const compact = columns === 2;
  const strategies = useMemo(() => sortStrategies(strategyList), []);

  return (
    <div {...(sectionId ? { id: sectionId } : {})} className="widget-hover widget-card widget-card--strategies">
      <div className="widget-card-header widget-card-header--compact">
        <div>
          <p className="widget-card-title">Strategies</p>
          <p className="widget-card-subtitle">Available first — scroll for more</p>
        </div>
      </div>
      <div
        className={`widget-strategies-list scrollbar-hide widget-strategies-list--cols-${columns}`}
      >
        {strategies.map((s) => (
          <StrategyCard key={s.name} strategy={s} compact={compact} />
        ))}
      </div>
    </div>
  );
}
