"use client";

import { useMemo, useState } from "react";
import { strategyList, type StrategyMetadata } from "@/components/navs/Discover/strategies";

type StrategyFilter = "all" | "active" | "trading";

const FILTERS: { id: StrategyFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Live" },
  { id: "trading", label: "Trading" },
];

function filterStrategies(list: StrategyMetadata[], filter: StrategyFilter) {
  if (filter === "active") return list.filter((s) => s.isActive);
  if (filter === "trading") return list.filter((s) => s.category === "trading");
  return list;
}

function StrategyCard({ strategy }: { strategy: StrategyMetadata }) {
  const load = () => {
    if (!strategy.isActive) return;
    window.dispatchEvent(
      new CustomEvent("build-select-strategy-template", { detail: strategy.name }),
    );
  };

  return (
    <button
      type="button"
      className={`build-strategy-card ${strategy.isActive ? "" : "build-strategy-card--soon"}`}
      onClick={load}
      disabled={!strategy.isActive}
      title={strategy.isActive ? `Load ${strategy.name}` : "Coming soon"}
    >
      <div className="build-strategy-card-top">
        <span className="widget-badge">{strategy.category}</span>
        {!strategy.isActive ? <span className="build-strategy-soon">Soon</span> : null}
      </div>
      <p className="build-strategy-name">{strategy.name}</p>
      <p className="build-strategy-desc">{strategy.description}</p>
      <div className="build-strategy-meta">
        <span>{strategy.nodes} nodes</span>
        <span className="build-strategy-profit">{strategy.profit}</span>
      </div>
    </button>
  );
}

export function StrategiesPanel({ sectionId }: { sectionId?: string }) {
  const [filter, setFilter] = useState<StrategyFilter>("all");
  const items = useMemo(() => filterStrategies(strategyList, filter), [filter]);

  return (
    <div {...(sectionId ? { id: sectionId } : {})} className="widget-hover widget-card">
      <div className="widget-card-header">
        <div>
          <p className="widget-card-title">Strategies</p>
          <p className="widget-card-subtitle">Library — tap to load on canvas</p>
        </div>
        <div className="widget-tabs" role="tablist">
          {FILTERS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`widget-tab ${filter === t.id ? "widget-tab--active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="widget-strategies-list scrollbar-hide">
        {items.map((s) => (
          <StrategyCard key={s.name} strategy={s} />
        ))}
      </div>
    </div>
  );
}
