"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SwapModule } from "@/components/app/SwapModule";
import { learnTopics } from "@/data/learn-topics";
import {
  defaultLearnProgress,
  LEARN_PROGRESS_STORAGE_KEY,
  loadLearnProgress,
  xpToLevel,
  type LearnProgressState,
} from "@/lib/learn-progress";
import { type PlacedWidget } from "@/components/widgets/config/grid";
import { FearGreedGauge } from "@/components/widgets/primitives/FearGreedGauge";
import { useLiveWidget } from "@/lib/useLiveWidget";
import { NewsGlance } from "@/components/widgets/news";
import { Sparkline } from "@/components/widgets/primitives/Sparkline";
import { OpportunityPanel } from "@/components/widgets/primitives/OpportunityPanel";
import { StocksPanel } from "@/components/widgets/primitives/StocksPanel";
import { TopCoinsPanel } from "@/components/widgets/coins";

function LearnWidgetCompact() {
  const [progress, setProgress] = useState<LearnProgressState>(defaultLearnProgress);

  const refresh = useCallback(() => {
    setProgress(loadLearnProgress());
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LEARN_PROGRESS_STORAGE_KEY || e.key === null) refresh();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => refresh();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const { level, xpInLevel, xpForNextLevel } = xpToLevel(progress.xp);
  const pct = Math.min(100, (xpInLevel / xpForNextLevel) * 100);
  const lastTopic = progress.lastTopicSlug
    ? learnTopics.find((t) => t.slug === progress.lastTopicSlug)
    : undefined;
  const topics = learnTopics.slice(0, 3);

  return (
    <div className="widget-hover glass-card flex h-full min-h-0 flex-col rounded-xl border border-black/[0.08] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:p-3">
      <div className="flex items-center justify-between gap-2 border-b border-black/[0.06] pb-2">
        <p className="text-xs font-semibold text-[#16191d]">Learn</p>
        <Link
          href="/learn"
          className="text-[10px] font-semibold text-[#5c6169] underline-offset-2 hover:text-[#16191d] hover:underline"
        >
          All topics →
        </Link>
      </div>

      <div className="mt-2 flex shrink-0 gap-2.5">
        <div
          className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl border border-black/[0.08] bg-[#f5f6f7] text-[#16191d]"
          aria-hidden
        >
          <span className="text-[8px] font-semibold uppercase leading-none tracking-wide text-[#9ca1a7]">
            Lvl
          </span>
          <span className="font-defi-display text-lg font-semibold leading-none">
            {level}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className="font-semibold text-[#16191d]">
              Level {level}
              <span className="ml-1.5 font-normal text-[#5c6169]">
                · {progress.xp} XP
              </span>
            </span>
            <span className="tabular-nums text-[#9ca1a7]">
              {xpInLevel}/{xpForNextLevel}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e8eaed]"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[#16191d] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {lastTopic ? (
        <Link
          href={`/learn#${lastTopic.slug}`}
          className="mt-2 flex shrink-0 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#f8f9fa] px-2 py-2 transition-colors hover:border-black/[0.12] hover:bg-[#f0f2f4]"
        >
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[9px] font-semibold uppercase tracking-wide text-[#9ca1a7]">
              Last course
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-[#16191d]">
              {lastTopic.title}
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-[#9ca1a7]"
            strokeWidth={1.75}
            aria-hidden
          />
        </Link>
      ) : (
        <p className="mt-2 shrink-0 rounded-lg border border-dashed border-black/[0.08] bg-[#f8f9fa] px-2 py-1.5 text-[10px] leading-snug text-[#5c6169]">
          Visit the{" "}
          <Link
            href="/learn"
            className="font-semibold text-[#16191d] underline underline-offset-2 hover:no-underline"
          >
            Learn
          </Link>{" "}
          page to track a lesson — it will show up here.
        </p>
      )}

      <p className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-[#9ca1a7]">
        Topics
      </p>
      <ul className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {topics.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/learn#${t.slug}`}
              className="block rounded-lg border border-transparent px-1 py-0.5 transition-colors hover:border-black/[0.06] hover:bg-[#f8f9fa]"
            >
              <p className="text-[10px] font-medium leading-snug text-[#16191d]">
                {t.title}
              </p>
              <p className="text-[9px] text-[#9ca1a7]">{t.readTime}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FearGreedWidget() {
  const live = useLiveWidget<{ value: number; label: string } | null>("fear-greed", null, 60_000);
  const value = live?.value ?? 50;
  const isLive = live !== null;
  return (
    <div className="widget-hover glass-card flex h-full min-h-0 flex-col rounded-xl border border-black/[0.08] bg-[var(--defi-bg-surface)] p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:p-3">
      <p className="text-xs font-semibold text-[#16191d]">Fear &amp; Greed</p>
      <div className="flex min-h-0 flex-1 flex-col justify-center py-1">
        <FearGreedGauge value={value} />
      </div>
      <p className="text-center text-[10px] text-[#5c6169]">
        {isLive ? `Live · alternative.me` : "Loading…"}
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

function MarketSizeWidget() {
  const live = useLiveWidget<{
    global_cap_usd: number | null;
    volume_24h_usd: number | null;
    market_cap_change_24h_pct: number | null;
  } | null>("market-size", null, 30_000);

  const cap = live?.global_cap_usd ?? null;
  const vol = live?.volume_24h_usd ?? null;
  const capUp = (live?.market_cap_change_24h_pct ?? 0) >= 0;

  return (
    <div className="widget-hover glass-card flex h-full min-h-0 flex-col gap-2 rounded-xl border border-black/[0.08] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:p-3">
      <p className="text-xs font-semibold text-[#16191d]">Market size</p>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <div className="flex flex-col justify-center rounded-lg border border-black/[0.08] bg-[var(--defi-bg-subtle)] p-2">
          <p className="text-[10px] text-[#5c6169]">Global cap</p>
          <p className="text-sm font-bold text-[#16191d]">{cap ? formatTrillion(cap) : "…"}</p>
          <Sparkline up={capUp} className="mt-1" />
        </div>
        <div className="flex flex-col justify-center rounded-lg border border-black/[0.08] bg-[var(--defi-bg-subtle)] p-2">
          <p className="text-[10px] text-[#5c6169]">24h vol</p>
          <p className="text-sm font-bold text-[#16191d]">{vol ? formatTrillion(vol) : "…"}</p>
          <Sparkline up={false} className="mt-1" />
        </div>
      </div>
    </div>
  );
}

function NewsWidget() {
  return (
    <div
      id="news-glance"
      className="widget-hover glass-card flex h-full min-h-0 flex-col rounded-xl border border-black/[0.08] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca1a7]">
          News
        </p>
        <Link
          href="/news"
          className="shrink-0 text-[10px] font-semibold text-[#5c6169] underline-offset-2 hover:text-[#16191d] hover:underline"
        >
          News desk →
        </Link>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <NewsGlance />
      </div>
    </div>
  );
}

export function renderWidget(p: PlacedWidget) {
  const sectionId = p.anchorId;
  switch (p.kind) {
    case "coins":
      return <TopCoinsPanel sectionId={sectionId} />;
    case "opportunities":
      return <OpportunityPanel sectionId={sectionId} />;
    case "stocks":
      return <StocksPanel sectionId={sectionId} />;
    case "fear-greed":
      return <FearGreedWidget />;
    case "market-size":
      return <MarketSizeWidget />;
    case "news":
      return <NewsWidget />;
    case "learn":
      return <LearnWidgetCompact />;
    case "swap":
      return <SwapModule compact />;
    default:
      return null;
  }
}
