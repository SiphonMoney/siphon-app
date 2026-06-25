"use client";

export type WidgetKind =
  | "coins"
  | "opportunities"
  | "stocks"
  | "fear-greed"
  | "market-size"
  | "news"
  | "learn"
  | "swap";

export type SizePreset = "2x1" | "2x2" | "4x2" | "6x1" | "6x2";

export type PlacedWidget = {
  id: string;
  kind: WidgetKind;
  size: SizePreset;
  /** When set, root of the widget gets this id (for /#anchors on the primary tile). */
  anchorId?: string;
};

export const STORAGE_KEY = "defi-dashboard-widgets-v4";

export const SIZE_TO_GRID: Record<SizePreset, { col: number; row: number }> = {
  "2x1": { col: 2, row: 1 },
  "2x2": { col: 2, row: 2 },
  "4x2": { col: 4, row: 2 },
  "6x1": { col: 6, row: 1 },
  "6x2": { col: 6, row: 2 },
};

export const SIZE_ORDER: SizePreset[] = ["2x1", "2x2", "4x2", "6x2", "6x1"];

export const WIDGET_META: Record<WidgetKind, { label: string; hint: string }> = {
  coins: { label: "Coins", hint: "Top assets & views" },
  opportunities: { label: "Opportunities", hint: "Yields & structures" },
  stocks: { label: "Stocks", hint: "US equities" },
  "fear-greed": { label: "Fear & Greed", hint: "Sentiment gauge" },
  "market-size": { label: "Market size", hint: "Cap & volume" },
  news: { label: "News", hint: "Headlines" },
  learn: { label: "Learn", hint: "Modules & primers" },
  swap: { label: "Swap", hint: "Fast token swap UI" },
};

export const ALL_KINDS = Object.keys(WIDGET_META) as WidgetKind[];

/** Row 1: three 2x1 glance tiles; rows 2-3: coins / opportunities / stocks (2x2). */
export const DEFAULT_PLACED: PlacedWidget[] = [
  { id: "default-fg", kind: "fear-greed", size: "2x1" },
  { id: "default-ms", kind: "market-size", size: "2x1" },
  { id: "default-news", kind: "news", size: "2x1" },
  { id: "default-coins", kind: "coins", size: "2x2", anchorId: "movers" },
  {
    id: "default-opp",
    kind: "opportunities",
    size: "2x2",
    anchorId: "opportunities",
  },
  { id: "default-stocks", kind: "stocks", size: "2x2", anchorId: "stocks" },
];

export function cycleSize(size: SizePreset): SizePreset {
  const i = SIZE_ORDER.indexOf(size);
  return SIZE_ORDER[(i + 1) % SIZE_ORDER.length];
}
