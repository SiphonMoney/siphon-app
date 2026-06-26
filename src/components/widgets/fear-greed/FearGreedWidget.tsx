"use client";

import { FearGreedGauge } from "@/components/widgets/primitives/FearGreedGauge";
import { useFearGreed } from "./useFearGreed";

export function FearGreedWidget() {
  const { data, loading, isLive } = useFearGreed();

  const value = data?.value ?? null;
  const footnote = loading
    ? "Loading sentiment…"
    : isLive
      ? "Live "
      : "Unable to load index";

  return (
    <div className="widget-hover widget-card widget-card--compact widget-card--glance">
      <p className="widget-card-eyebrow">Fear &amp; Greed</p>
      <div className="widget-card-body justify-center py-0.5">
        {value != null ? (
          <FearGreedGauge value={value} label={data?.label} />
        ) : (
          <p className="widget-stat-value widget-stat-value--glance text-[var(--defi-text-muted)]">
            …
          </p>
        )}
      </div>
      <p className="widget-card-footnote">{footnote}</p>
    </div>
  );
}
