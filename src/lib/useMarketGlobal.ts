"use client";

import { useEffect, useState } from "react";

export type MarketGlobalData = {
  global_cap_usd: number | null;
  volume_24h_usd: number | null;
  market_cap_change_24h_pct: number | null;
  btc_dominance_pct: number | null;
  eth_dominance_pct: number | null;
};

function getAsiBase(): string {
  return (
    process.env.NEXT_PUBLIC_ASI_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_ASI_API?.trim() ||
    ""
  );
}

async function fetchAsiMarket(): Promise<MarketGlobalData | null> {
  const base = getAsiBase();
  if (!base) return null;
  try {
    const r = await fetch(`${base}/v1/widget/market-size`);
    if (!r.ok) return null;
    const json = (await r.json()) as Partial<MarketGlobalData>;
    return {
      global_cap_usd: json.global_cap_usd ?? null,
      volume_24h_usd: json.volume_24h_usd ?? null,
      market_cap_change_24h_pct: json.market_cap_change_24h_pct ?? null,
      btc_dominance_pct: json.btc_dominance_pct ?? null,
      eth_dominance_pct: json.eth_dominance_pct ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchLocalMarket(): Promise<MarketGlobalData | null> {
  try {
    const r = await fetch("/api/market-global");
    if (!r.ok) return null;
    return (await r.json()) as MarketGlobalData;
  } catch {
    return null;
  }
}

export function useMarketGlobal(pollMs = 30_000): MarketGlobalData | null {
  const [data, setData] = useState<MarketGlobalData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const asi = await fetchAsiMarket();
      if (cancelled) return;
      if (asi?.global_cap_usd != null) {
        setData(asi);
        return;
      }
      const local = await fetchLocalMarket();
      if (!cancelled && local) setData(local);
    }

    void load();
    const timer = pollMs > 0 ? window.setInterval(load, pollMs) : null;
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [pollMs]);

  return data;
}
