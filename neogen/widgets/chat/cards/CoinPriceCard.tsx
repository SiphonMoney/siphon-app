"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { CoinPriceCardData } from "@/lib/asiHeadlessClient";

function formatUsd(n: number | null) {
  if (n === null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1 ? 2 : 4,
  }).format(n);
}

function formatPct(n: number | null) {
  if (n === null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function formatFetched(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  } catch {
    return iso;
  }
}

type Props = {
  data: CoinPriceCardData;
  onDismiss?: () => void;
  /** Optional handle shown before the title (e.g. drag grip). */
  dragHandle?: ReactNode;
  className?: string;
};

export function CoinPriceCard({
  data,
  onDismiss,
  dragHandle,
  className = "",
}: Props) {
  const { quotes, provider, fetched_at: fetchedAt } = data;

  return (
    <aside
      className={`widget-hover glass-card w-full shrink-0 rounded-xl border border-black/[0.08] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:w-72 lg:sticky lg:top-4 ${className}`}
      aria-label="Live price"
    >
      <div className="flex items-start justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {dragHandle ? (
            <span className="shrink-0 pt-0.5">{dragHandle}</span>
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#16191d]">Spot price</p>
            <p className="text-[11px] text-[#5c6169]">
              {provider ? `${provider}` : "Market"}
              {fetchedAt ? ` · ${formatFetched(fetchedAt)}` : null}
            </p>
          </div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-[#9ca1a7] transition-colors hover:bg-black/[0.04] hover:text-[#16191d]"
            aria-label="Dismiss price card"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <ul className="divide-y divide-black/[0.06] px-4 py-2">
        {quotes.map((q) => {
          const up = q.change_24h_pct != null && q.change_24h_pct >= 0;
          return (
            <li key={`${q.symbol}-${q.vs_currency}`} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="text-sm font-medium tabular-nums text-[#16191d]">{q.symbol}</span>
              <span className="min-w-0 flex-1 text-right text-sm font-semibold tabular-nums text-[#16191d]">
                {formatUsd(q.price)}
              </span>
              <span
                className={`shrink-0 text-xs font-medium tabular-nums ${
                  q.change_24h_pct == null
                    ? "text-[#9ca1a7]"
                    : up
                      ? "text-emerald-700"
                      : "text-rose-700"
                }`}
              >
                {formatPct(q.change_24h_pct)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-black/[0.06] px-4 py-2 text-[10px] leading-snug text-[#9ca1a7]">
        Display-only market data. Not financial advice.
      </p>
    </aside>
  );
}
