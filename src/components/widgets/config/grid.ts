"use client";

import {
  defaultSizeForKind,
  isAllowedSize,
  migratePlacedKinds,
  WIDGET_LIBRARY,
} from "@/components/widgets/config/widgetLibrary";

export type WidgetKind =
  | "coins"
  | "opportunities"
  | "stocks"
  | "wallet"
  | "fear-greed"
  | "market-cap"
  | "market-volume"
  | "news"
  | "learn"
  | "swap";

export type SizePreset = "1x1" | "1x2" | "2x1" | "2x2" | "4x2" | "6x1" | "6x2";

export type PlacedWidget = {
  id: string;
  kind: WidgetKind;
  size: SizePreset;
  /** When set, root of the widget gets this id (for /#anchors on the primary tile). */
  anchorId?: string;
};

export const STORAGE_KEY = "siphon-build-dashboard-widgets-v5";

export const SIZE_TO_GRID: Record<SizePreset, { col: number; row: number }> = {
  "1x1": { col: 1, row: 1 },
  "1x2": { col: 1, row: 2 },
  "2x1": { col: 2, row: 1 },
  "2x2": { col: 2, row: 2 },
  "4x2": { col: 4, row: 2 },
  "6x1": { col: 6, row: 1 },
  "6x2": { col: 6, row: 2 },
};

export const SIZE_ORDER: SizePreset[] = [
  "1x1",
  "1x2",
  "2x1",
  "2x2",
  "4x2",
  "6x2",
  "6x1",
];

export const WIDGET_META: Record<WidgetKind, { label: string; hint: string }> =
  Object.fromEntries(
    Object.entries(WIDGET_LIBRARY).map(([kind, spec]) => [
      kind,
      { label: spec.label, hint: spec.hint },
    ]),
  ) as Record<WidgetKind, { label: string; hint: string }>;

export const ALL_KINDS = Object.keys(WIDGET_META) as WidgetKind[];

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** See widget-library.json — swap 2×2 + starter 1×1 glance row + core tiles. */
export const DEFAULT_PLACED: PlacedWidget[] = [
  { id: "default-swap", kind: "swap", size: "2x2" },
  { id: "default-fg", kind: "fear-greed", size: "1x1" },
  { id: "default-cap", kind: "market-cap", size: "1x1" },
  { id: "default-vol", kind: "market-volume", size: "1x1" },
  { id: "default-news", kind: "news", size: "2x1" },
  { id: "default-coins", kind: "coins", size: "2x2", anchorId: "movers" },
  {
    id: "default-strategies",
    kind: "opportunities",
    size: "2x2",
    anchorId: "strategies",
  },
  { id: "default-wallet", kind: "wallet", size: "2x2", anchorId: "wallet" },
];

export function cycleSize(size: SizePreset): SizePreset {
  const i = SIZE_ORDER.indexOf(size);
  return SIZE_ORDER[(i + 1) % SIZE_ORDER.length];
}

export function loadPlacedFromStorage(): PlacedWidget[] {
  if (typeof window === "undefined") return DEFAULT_PLACED;
  const keys = [
    STORAGE_KEY,
    "siphon-build-dashboard-widgets-v4",
    "siphon-build-dashboard-widgets-v3",
  ];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Array<{
        id: string;
        kind: string;
        size: SizePreset;
        anchorId?: string;
      }>;
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
      const migrated = migratePlacedKinds(parsed);
      const valid = migrated.filter(
        (p) =>
          p &&
          typeof p.id === "string" &&
          ALL_KINDS.includes(p.kind) &&
          p.size in SIZE_TO_GRID &&
          isAllowedSize(p.kind, p.size) &&
          (p.anchorId === undefined || typeof p.anchorId === "string"),
      );
      if (valid.length > 0) {
        if (key !== STORAGE_KEY) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        }
        return valid;
      }
    } catch {
      continue;
    }
  }
  return DEFAULT_PLACED.map((d) => ({ ...d, id: uid() }));
}

export { defaultSizeForKind, isAllowedSize, migratePlacedKinds };
