"use client";

import { type PlacedWidget } from "@/components/widgets/config/grid";
import { FearGreedGauge } from "@/components/widgets/primitives/FearGreedGauge";
import { useLiveWidget } from "@/lib/useLiveWidget";
import { NewsGlance } from "@/components/widgets/primitives/NewsGlance";
import { Sparkline } from "@/components/widgets/primitives/Sparkline";
import { StrategiesPanel } from "@/components/widgets/primitives/StrategiesPanel";
import { SwapPanel } from "@/components/widgets/primitives/SwapPanel";
import { StocksPanel } from "@/components/widgets/primitives/StocksPanel";
import { TopCoinsPanel } from "@/components/widgets/primitives/TopCoinsPanel";
import { WalletPanel } from "@/components/widgets/primitives/WalletPanel";

function useMarketSizeLive() {
  return useLiveWidget<{
    global_cap_usd: number | null;
    volume_24h_usd: number | null;
    market_cap_change_24h_pct: number | null;
  } | null>("market-size", null, 30_000);
}

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
  const live = useMarketSizeLive();
  const cap = live?.global_cap_usd ?? null;
  const capUp = (live?.market_cap_change_24h_pct ?? 0) >= 0;

  return (
    <div className="widget-hover widget-card widget-card--compact widget-card--glance">
      <p className="widget-card-eyebrow">Market cap</p>
      <div className="widget-card-body justify-center py-0.5">
        <p className="widget-stat-value widget-stat-value--glance">
          {cap ? formatTrillion(cap) : "…"}
        </p>
        <Sparkline up={capUp} className="mt-1" />
      </div>
      <p className="widget-card-footnote">Global · 24h</p>
    </div>
  );
}

function MarketVolumeWidget() {
  const live = useMarketSizeLive();
  const vol = live?.volume_24h_usd ?? null;

  return (
    <div className="widget-hover widget-card widget-card--compact widget-card--glance">
      <p className="widget-card-eyebrow">24h volume</p>
      <div className="widget-card-body justify-center py-0.5">
        <p className="widget-stat-value widget-stat-value--glance">
          {vol ? formatTrillion(vol) : "…"}
        </p>
        <Sparkline up={false} className="mt-1" />
      </div>
      <p className="widget-card-footnote">All markets</p>
    </div>
  );
}

function NewsWidget() {
  return (
    <div id="news-glance" className="widget-hover widget-card widget-card--compact">
      <p className="widget-card-eyebrow">News</p>
      <div className="widget-card-body">
        <NewsGlance />
      </div>
    </div>
  );
}

function PlaceholderWidget({ label }: { label: string }) {
  return (
    <div className="widget-hover widget-card widget-placeholder">
      <p className="widget-card-title">{label}</p>
      <p className="widget-card-subtitle">Coming soon on build</p>
    </div>
  );
}

export function renderWidget(p: PlacedWidget) {
  const sectionId = p.anchorId;
  switch (p.kind) {
    case "coins":
      return <TopCoinsPanel sectionId={sectionId} />;
    case "opportunities":
      return <StrategiesPanel sectionId={sectionId} />;
    case "stocks":
      return <StocksPanel sectionId={sectionId} />;
    case "wallet":
      return <WalletPanel sectionId={sectionId} />;
    case "fear-greed":
      return <FearGreedWidget />;
    case "market-cap":
      return <MarketCapWidget />;
    case "market-volume":
      return <MarketVolumeWidget />;
    case "news":
      return <NewsWidget />;
    case "learn":
      return <PlaceholderWidget label="Learn" />;
    case "swap":
      return <SwapPanel />;
    default:
      return null;
  }
}
