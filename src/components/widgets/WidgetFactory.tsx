"use client";

import { type PlacedWidget } from "@/components/widgets/config/grid";
import { FearGreedGauge } from "@/components/widgets/primitives/FearGreedGauge";
import { useLiveWidget } from "@/lib/useLiveWidget";
import { useMarketGlobal } from "@/lib/useMarketGlobal";
import { NewsGlance } from "@/components/widgets/primitives/NewsGlance";
import { Sparkline } from "@/components/widgets/primitives/Sparkline";
import { RunsPanel } from "@/components/widgets/primitives/RunsPanel";
import { StrategiesPanel } from "@/components/widgets/primitives/StrategiesPanel";
import { SwapPanel } from "@/components/widgets/primitives/SwapPanel";
import { TopCoinsPanel } from "@/components/widgets/primitives/TopCoinsPanel";
import { WalletPanel } from "@/components/widgets/primitives/WalletPanel";

function FearGreedWidget() {
  const live = useLiveWidget<{ value: number; label: string } | null>("fear-greed", null, 60_000);
  const value = live?.value ?? 50;
  const isLive = live !== null;
  return (
    <div className="widget-hover widget-card widget-card--compact widget-card--glance">
      <p className="widget-card-eyebrow">Fear &amp; Greed</p>
      <div className="widget-card-body justify-center py-0.5">
        <FearGreedGauge value={value} />
      </div>
      <p className="widget-card-footnote">
        {isLive ? "Live · alternative.me" : "Market sentiment"}
      </p>
    </div>
  );
}

function formatTrillion(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  return `$${n.toFixed(0)}`;
}

function MarketCapWidget() {
  const live = useMarketGlobal();
  const cap = live?.global_cap_usd ?? null;
  const capUp = (live?.market_cap_change_24h_pct ?? 0) >= 0;

  return (
    <div className="widget-hover widget-card widget-card--compact widget-card--glance">
      <p className="widget-card-eyebrow">Market cap</p>
      <div className="widget-card-body widget-card-body--stat-glance py-0.5">
        <p className="widget-stat-value widget-stat-value--glance">
          {cap != null ? formatTrillion(cap) : "…"}
        </p>
        <Sparkline up={capUp} fullWidth className="widget-stat-sparkline" />
      </div>
      <p className="widget-card-footnote">Global · 24h</p>
    </div>
  );
}

function MarketVolumeWidget() {
  const live = useMarketGlobal();
  const vol = live?.volume_24h_usd ?? null;

  return (
    <div className="widget-hover widget-card widget-card--compact widget-card--glance">
      <p className="widget-card-eyebrow">24h volume</p>
      <div className="widget-card-body widget-card-body--stat-glance py-0.5">
        <p className="widget-stat-value widget-stat-value--glance">
          {vol != null ? formatTrillion(vol) : "…"}
        </p>
        <Sparkline up={false} fullWidth className="widget-stat-sparkline" />
      </div>
      <p className="widget-card-footnote">All markets</p>
    </div>
  );
}

function DominanceWidget() {
  const live = useMarketGlobal();
  const btc = live?.btc_dominance_pct ?? null;
  const eth = live?.eth_dominance_pct ?? null;

  return (
    <div className="widget-hover widget-card widget-card--compact widget-card--glance">
      <p className="widget-card-eyebrow">Dominance</p>
      <div className="widget-card-body widget-card-body--dominance justify-center py-0.5">
        <div className="widget-dominance-row">
          <span className="widget-dominance-item">
            <span className="widget-dominance-label">BTC</span>
            <span className="widget-stat-value widget-stat-value--glance widget-stat-value--dominance">
              {btc != null ? `${btc.toFixed(1)}%` : "…"}
            </span>
          </span>
          <span className="widget-dominance-divider" aria-hidden />
          <span className="widget-dominance-item">
            <span className="widget-dominance-label">ETH</span>
            <span className="widget-stat-value widget-stat-value--glance widget-stat-value--dominance">
              {eth != null ? `${eth.toFixed(1)}%` : "…"}
            </span>
          </span>
        </div>
      </div>
      <p className="widget-card-footnote">Market share</p>
    </div>
  );
}

function NewsWidget() {
  return (
    <div id="news-glance" className="widget-hover widget-card widget-card--compact widget-card--news">
      <div className="widget-card-body widget-card-body--news">
        <NewsGlance />
      </div>
    </div>
  );
}

function isCompactGlance(size: PlacedWidget["size"]) {
  return size === "1x1";
}

export function renderWidget(p: PlacedWidget) {
  const sectionId = p.anchorId;
  const compact = isCompactGlance(p.size);
  switch (p.kind) {
    case "coins":
      return <TopCoinsPanel sectionId={sectionId} />;
    case "opportunities":
      return <StrategiesPanel sectionId={sectionId} size={p.size} />;
    case "wallet":
      return <WalletPanel sectionId={sectionId} />;
    case "fear-greed":
      return <FearGreedWidget />;
    case "market-cap":
      return <MarketCapWidget />;
    case "market-volume":
      return <MarketVolumeWidget />;
    case "dominance":
      return <DominanceWidget />;
    case "news":
      return <NewsWidget />;
    case "swap":
      return <SwapPanel compact={compact} />;
    case "runs":
      return <RunsPanel compact={compact} />;
    default:
      return null;
  }
}
