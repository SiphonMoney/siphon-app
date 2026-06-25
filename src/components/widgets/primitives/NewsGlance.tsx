"use client";

import { useEffect, useState } from "react";
import { mockNews } from "@/data/news-feed";
import { useLiveWidget } from "@/lib/useLiveWidget";

const HOLD_MS = 5000;

type ApiNewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary?: string;
};

type DisplayNewsItem = {
  id: string;
  title: string;
  excerpt: string;
  source: string;
  time: string;
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NewsGlance() {
  const liveNews = useLiveWidget<ApiNewsItem[] | null>("news", null, 60_000);

  const items: DisplayNewsItem[] = liveNews
    ? liveNews.slice(0, 5).map((n) => ({
        id: n.id,
        title: n.title,
        excerpt: n.summary ?? "",
        source: n.source,
        time: formatRelativeTime(n.published_at),
      }))
    : mockNews.slice(0, 5).map((n) => ({
        id: n.id,
        title: n.title,
        excerpt: n.excerpt,
        source: n.source,
        time: n.time,
      }));

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, HOLD_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  useEffect(() => {
    if (items.length === 0) {
      setIndex(0);
      return;
    }
    if (index >= items.length) {
      setIndex(0);
    }
  }, [index, items.length]);

  const n = items[index];

  if (!n) {
    return (
      <div className="build-news-empty flex min-h-[100px] flex-1 items-center justify-center px-3 text-xs">
        No headlines available.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <article key={n.id} className="animate-news-fade flex-1" aria-live="polite">
        <p className="text-[13px] font-medium leading-snug text-[var(--defi-text)]">{n.title}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--defi-text-muted)]">{n.excerpt}</p>
        <p className="mt-2 font-mono text-[10px] text-[var(--defi-text-subtle)]">
          {n.source} · {n.time}
        </p>
      </article>

      <div
        className="build-news-dots"
        role="tablist"
        aria-label="News headlines"
      >
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={`build-news-dot ${i === index ? "build-news-dot--active" : ""}`}
            aria-label={`Show headline ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
