export type CoinPriceQuote = {
  symbol: string;
  coin_id: string;
  vs_currency: string;
  price: number | null;
  change_24h_pct: number | null;
};

export type CoinPriceCardData = {
  quotes: CoinPriceQuote[];
  provider: string;
  fetched_at: string;
};

export type OpportunityWidgetCta = {
  label: string;
  href: string;
};

export type OpportunityFeedItem = {
  id: string;
  category?: string;
  title: string;
  subtitle?: string;
  apy_percent?: number | null;
  risk_level?: string;
  chain?: string;
  cta?: OpportunityWidgetCta;
  highlights?: string[];
};

export type OpportunitiesGridData = {
  opportunities: OpportunityFeedItem[];
  source: string;
  fetched_at: string;
};

export type WalletBalanceCardData = {
  address?: string;
  chain_id?: number;
  chain_name?: string;
  symbol?: string;
  balance_wei?: string;
  balance_native: number | null;
  ok: boolean;
  error: string | null;
  message?: string;
  fetched_at: string;
};

function widgetEventName(ev: Record<string, unknown>): string | undefined {
  if (typeof ev.widget === "string") return ev.widget;
  const data = ev.data;
  if (data && typeof data === "object") {
    const inner = (data as Record<string, unknown>).widget;
    if (typeof inner === "string") return inner;
  }
  return undefined;
}

export function parseCoinPriceCardEvent(
  ev: Record<string, unknown>,
): CoinPriceCardData | null {
  if (ev.type !== "widget") return null;
  if (widgetEventName(ev) !== "CoinPriceCard") return null;
  const data = ev.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.quotes)) return null;
  return {
    quotes: d.quotes as CoinPriceQuote[],
    provider: String(d.provider ?? ""),
    fetched_at: String(d.fetched_at ?? ""),
  };
}

export function parseOpportunitiesGridEvent(
  ev: Record<string, unknown>,
): OpportunitiesGridData | null {
  if (ev.type !== "widget") return null;
  if (widgetEventName(ev) !== "OpportunitiesGrid") return null;
  const data = ev.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.opportunities)) return null;
  return {
    opportunities: d.opportunities as OpportunityFeedItem[],
    source: String(d.source ?? ""),
    fetched_at: String(d.fetched_at ?? ""),
  };
}

export function parseWalletBalanceCardEvent(
  ev: Record<string, unknown>,
): WalletBalanceCardData | null {
  if (ev.type !== "widget") return null;
  if (widgetEventName(ev) !== "WalletBalanceCard") return null;
  const data = ev.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    address: typeof d.address === "string" ? d.address : undefined,
    chain_id: typeof d.chain_id === "number" ? d.chain_id : undefined,
    chain_name: typeof d.chain_name === "string" ? d.chain_name : undefined,
    symbol: typeof d.symbol === "string" ? d.symbol : undefined,
    balance_wei: typeof d.balance_wei === "string" ? d.balance_wei : undefined,
    balance_native:
      typeof d.balance_native === "number" ? d.balance_native : null,
    ok: Boolean(d.ok),
    error: typeof d.error === "string" ? d.error : null,
    message: typeof d.message === "string" ? d.message : undefined,
    fetched_at: String(d.fetched_at ?? ""),
  };
}
