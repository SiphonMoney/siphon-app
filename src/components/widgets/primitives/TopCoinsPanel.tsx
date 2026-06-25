"use client";

import { useState } from "react";
import { useLiveWidget } from "@/lib/useLiveWidget";
import { mockCoins, top4ByMarketCap, top4Movers24h, top4Trending } from "@/data/mock-market";
import { Sparkline } from "@/components/widgets/primitives/Sparkline";

type CoinView = "marketcap" | "trending" | "movers";

const VIEW_TABS: { id: CoinView; label: string }[] = [
  { id: "marketcap", label: "Market cap" },
  { id: "trending", label: "Trending" },
  { id: "movers", label: "24h movers" },
];

type LiveCoin = {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
  total_volume: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  price_change_percentage_24h: number | null;
};

function formatPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function formatPrice(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

function formatCap(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

function sortCoins(coins: LiveCoin[], view: CoinView): LiveCoin[] {
  const c = [...coins];
  if (view === "marketcap")
    return c.sort((a, b) => (a.market_cap_rank ?? 999) - (b.market_cap_rank ?? 999));
  if (view === "movers")
    return c.sort(
      (a, b) =>
        Math.abs(b.price_change_percentage_24h_in_currency ?? b.price_change_percentage_24h ?? 0) -
        Math.abs(a.price_change_percentage_24h_in_currency ?? a.price_change_percentage_24h ?? 0),
    );
  // trending: biggest 7-day gainers (positive momentum)
  return c.sort(
    (a, b) =>
      (b.price_change_percentage_7d_in_currency ?? -Infinity) -
      (a.price_change_percentage_7d_in_currency ?? -Infinity),
  );
}

export function TopCoinsPanel({ sectionId }: { sectionId?: string }) {
  const [view, setView] = useState<CoinView>("marketcap");
  const liveCoins = useLiveWidget<LiveCoin[] | null>("coins", null, 30_000);

  // Fallback to mock data while loading
  const mockRows =
    view === "marketcap"
      ? top4ByMarketCap(mockCoins)
      : view === "movers"
        ? top4Movers24h(mockCoins)
        : top4Trending(mockCoins);

  const showLive = liveCoins !== null && liveCoins.length > 0;
  const liveRows = showLive ? sortCoins(liveCoins, view).slice(0, 4) : null;

  return (
    <div
      {...(sectionId ? { id: sectionId } : {})}
      className="widget-hover widget-card"
    >
      <div className="widget-card-header">
        <div>
          <p className="widget-card-title">Coins</p>
          <p className="widget-card-subtitle">Top 4 — switch view</p>
        </div>
        <div className="widget-tabs" role="tablist">
          {VIEW_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              onClick={() => setView(t.id)}
              className={`widget-tab ${view === t.id ? "widget-tab--active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="widget-table-wrap scrollbar-hide">
        <table className="widget-table min-w-[640px]">
          <thead>
            <tr>
              <th>#</th>
              <th>Asset</th>
              <th className="text-right">Price</th>
              <th className="text-right">1h</th>
              <th className="text-right">24h</th>
              <th className="hidden text-right md:table-cell">7d</th>
              <th className="hidden text-right lg:table-cell">24h vol</th>
              <th className="hidden text-right xl:table-cell">MCap</th>
              <th className="text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {liveRows
              ? liveRows.map((coin, i) => (
                  <tr key={coin.id}>
                    <td className="text-[var(--defi-text-subtle)]">{view === "marketcap" ? (coin.market_cap_rank ?? i + 1) : i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="widget-asset-avatar">
                          {coin.symbol.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--defi-text)]">{coin.name}</div>
                          <div className="text-[10px] uppercase text-[var(--defi-text-subtle)]">{coin.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-medium tabular-nums text-[var(--defi-text)]">{formatPrice(coin.current_price)}</td>
                    <td className={`text-right tabular-nums ${(coin.price_change_percentage_1h_in_currency ?? 0) >= 0 ? "text-[var(--defi-text)]" : "text-[var(--defi-text-muted)]"}`}>
                      {formatPct(coin.price_change_percentage_1h_in_currency)}
                    </td>
                    <td className={`text-right tabular-nums ${(coin.price_change_percentage_24h_in_currency ?? 0) >= 0 ? "text-[var(--defi-text)]" : "text-[var(--defi-text-muted)]"}`}>
                      {formatPct(coin.price_change_percentage_24h_in_currency)}
                    </td>
                    <td className={`hidden text-right tabular-nums md:table-cell ${(coin.price_change_percentage_7d_in_currency ?? 0) >= 0 ? "text-[var(--defi-text)]" : "text-[var(--defi-text-muted)]"}`}>
                      {formatPct(coin.price_change_percentage_7d_in_currency)}
                    </td>
                    <td className="hidden text-right text-[var(--defi-text-muted)] lg:table-cell">{formatCap(coin.total_volume)}</td>
                    <td className="hidden text-right text-[var(--defi-text-muted)] xl:table-cell">{formatCap(coin.market_cap)}</td>
                    <td className="text-right">
                      <Sparkline up={(coin.price_change_percentage_7d_in_currency ?? 0) >= 0} className="ml-auto" />
                    </td>
                  </tr>
                ))
              : mockRows.map((row, i) => (
                  <tr key={`${view}-${row.symbol}-${row.rank}`}>
                    <td className="text-[var(--defi-text-subtle)]">{view === "marketcap" ? row.rank : i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="widget-asset-avatar">{row.symbol.slice(0, 2)}</span>
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--defi-text)]">{row.name}</div>
                          <div className="text-[10px] uppercase text-[var(--defi-text-subtle)]">{row.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-medium tabular-nums text-[var(--defi-text)]">${row.price}</td>
                    <td className="text-right tabular-nums text-[var(--defi-text-muted)]">{formatPct(row.change1h)}</td>
                    <td className="text-right tabular-nums text-[var(--defi-text-muted)]">{formatPct(row.change24h)}</td>
                    <td className="hidden text-right tabular-nums text-[var(--defi-text-muted)] md:table-cell">{formatPct(row.change7d)}</td>
                    <td className="hidden text-right text-[var(--defi-text-muted)] lg:table-cell">{row.volume24h}</td>
                    <td className="hidden text-right text-[var(--defi-text-muted)] xl:table-cell">{row.marketCap}</td>
                    <td className="text-right"><Sparkline up={row.sparkUp} className="ml-auto" /></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
