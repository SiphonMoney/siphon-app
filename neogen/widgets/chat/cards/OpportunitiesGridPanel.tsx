"use client";

import type { ReactNode } from "react";
import { ExternalLink, X } from "lucide-react";
import type { OpportunitiesGridData } from "@/lib/asiHeadlessClient";

function formatApy(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function riskBadgeClass(level: string | undefined) {
  const l = (level ?? "").toLowerCase();
  if (l === "low") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (l === "medium") return "border-amber-200 bg-amber-50 text-amber-900";
  if (l === "high") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-black/[0.08] bg-[#f5f6f7] text-[#5c6169]";
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
  data: OpportunitiesGridData;
  onDismiss?: () => void;
  dragHandle?: ReactNode;
  className?: string;
};

export function OpportunitiesGridPanel({
  data,
  onDismiss,
  dragHandle,
  className = "",
}: Props) {
  const { opportunities, source, fetched_at: fetchedAt } = data;

  return (
    <aside
      className={`widget-hover glass-card flex max-h-[min(72vh,520px)] w-full shrink-0 flex-col rounded-xl border border-black/[0.08] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:w-80 lg:sticky lg:top-4 ${className}`}
      aria-label="DeFi opportunities"
    >
      <div className="flex items-start justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {dragHandle ? (
            <span className="shrink-0 pt-0.5">{dragHandle}</span>
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#16191d]">Top opportunities</p>
            <p className="text-[11px] text-[#5c6169]">
              {source === "rag_extracted"
                ? "From knowledge base"
                : source === "catalog_fallback"
                  ? "Curated picks"
                  : source || "Suggestions"}
              {fetchedAt ? ` · ${formatFetched(fetchedAt)}` : null}
            </p>
          </div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-[#9ca1a7] transition-colors hover:bg-black/[0.04] hover:text-[#16191d]"
            aria-label="Dismiss opportunities"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-4">
        {opportunities.map((o) => (
          <li
            key={o.id}
            className="glass-subcard rounded-xl border border-black/[0.07] bg-[#fafbfc] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {o.category ? (
                <span className="rounded-md border border-black/[0.06] bg-white px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#5c6169]">
                  {o.category}
                </span>
              ) : null}
              {o.risk_level ? (
                <span
                  className={`rounded-md border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${riskBadgeClass(o.risk_level)}`}
                >
                  {o.risk_level} risk
                </span>
              ) : null}
              {o.chain ? (
                <span className="text-[10px] text-[#9ca1a7]">{o.chain}</span>
              ) : null}
            </div>
            <h3 className="mt-1.5 text-[13px] font-semibold leading-snug text-[#16191d]">
              {o.title}
            </h3>
            {o.subtitle ? (
              <p className="mt-0.5 text-[11px] leading-snug text-[#5c6169]">{o.subtitle}</p>
            ) : null}
            <div className="mt-2 flex items-end justify-between gap-2">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-wide text-[#9ca1a7]">
                  Indicative APY
                </p>
                <p className="text-base font-semibold tabular-nums text-[#16191d]">
                  {formatApy(o.apy_percent ?? null)}
                </p>
              </div>
              {o.cta?.href ? (
                <a
                  href={o.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-subcard inline-flex shrink-0 items-center gap-1 rounded-lg border border-black/[0.1] bg-white px-2 py-1 text-[11px] font-semibold text-[#16191d] transition-colors hover:border-black/[0.14] hover:bg-[#f8f9fa]"
                >
                  {o.cta.label ?? "Details"}
                  <ExternalLink className="size-3 opacity-70" strokeWidth={2} aria-hidden />
                </a>
              ) : null}
            </div>
            {o.highlights && o.highlights.length > 0 ? (
              <ul className="mt-2 space-y-0.5 border-t border-black/[0.06] pt-2 text-[10px] leading-snug text-[#5c6169]">
                {o.highlights.slice(0, 3).map((h, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-[#9ca1a7]" aria-hidden>
                      ·
                    </span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="border-t border-black/[0.06] px-4 py-2 text-[10px] leading-snug text-[#9ca1a7]">
        Illustrative structures only. Not financial advice — verify live terms and risks.
      </p>
    </aside>
  );
}
