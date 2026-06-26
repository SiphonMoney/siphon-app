"use client";

import { Sparkline } from "@/components/widgets/primitives/Sparkline";
import { formatUsdCompact } from "./formatUsd";
import { useMarketGlobal } from "./useMarketGlobal";

export function MarketCapWidget() {
  const { data, loading, isLive } = useMarketGlobal();
  const cap = data?.global_cap_usd ?? null;
  const capUp = (data?.market_cap_change_24h_pct ?? 0) >= 0;
  const changePct = data?.market_cap_change_24h_pct;

  const footnote = loading
    ? "Loading market cap…"
    : isLive
      ? changePct != null
        ? `Live · 24h ${capUp ? "+" : ""}${changePct.toFixed(2)}%`
        : "Live · CoinGecko"
      : "Unable to load market cap";

  return (
    <div className="widget-hover widget-card widget-card--compact widget-card--glance">
      <p className="widget-card-eyebrow">Market cap</p>
      <div className="widget-card-body widget-card-body--stat-glance py-0.5">
        <p className="widget-stat-value widget-stat-value--glance">
          {cap != null ? formatUsdCompact(cap) : "…"}
        </p>
        <Sparkline up={capUp} fullWidth className="widget-stat-sparkline" />
      </div>
      <p className="widget-card-footnote">{footnote}</p>
    </div>
  );
}
