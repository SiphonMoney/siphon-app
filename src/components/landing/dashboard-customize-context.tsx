"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Plus, RotateCcw } from "lucide-react";
import {
  ALL_KINDS,
  DEFAULT_PLACED,
  STORAGE_KEY,
  WIDGET_META,
  loadPlacedFromStorage,
  defaultSizeForKind,
  type PlacedWidget,
  type WidgetKind,
} from "@/components/widgets/config/grid";
import {
  canResizeKind,
  cycleSizeForKind,
  WIDGET_LIBRARY,
  type WidgetTier,
} from "@/components/widgets/config/widgetLibrary";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadPlaced(): PlacedWidget[] {
  return loadPlacedFromStorage();
}

function savePlaced(placed: PlacedWidget[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(placed));
}

type WidgetFilter = "all" | WidgetTier;

const WIDGET_FILTERS: { id: WidgetFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "starter", label: "Market" },
  { id: "glance", label: "Glance" },
  { id: "core", label: "Build" },
];

type DashboardCustomizeContextValue = {
  placed: PlacedWidget[];
  hydrated: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  closePanel: () => void;
  addable: WidgetKind[];
  addWidget: (kind: WidgetKind) => void;
  removeWidget: (id: string) => void;
  cycleWidgetSize: (id: string) => void;
  resetDefault: () => void;
};

const DashboardCustomizeContext = createContext<DashboardCustomizeContextValue | null>(
  null,
);

export function DashboardCustomizeProvider({ children }: { children: ReactNode }) {
  const [placed, setPlaced] = useState<PlacedWidget[]>(DEFAULT_PLACED);
  const [hydrated, setHydrated] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    setPlaced(loadPlaced());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePlaced(placed);
  }, [placed, hydrated]);

  useEffect(() => {
    if (!panelOpen) return;
    window.dispatchEvent(new CustomEvent("build-dashboard-customize-open"));
  }, [panelOpen]);

  const usedKinds = useMemo(() => new Set(placed.map((p) => p.kind)), [placed]);
  const addable = useMemo(
    () => ALL_KINDS.filter((k) => !usedKinds.has(k)),
    [usedKinds],
  );

  const addWidget = useCallback((kind: WidgetKind) => {
    setPlaced((p) => [...p, { id: uid(), kind, size: defaultSizeForKind(kind) }]);
  }, []);

  const removeWidget = useCallback((id: string) => {
    setPlaced((p) => p.filter((x) => x.id !== id));
  }, []);

  const cycleWidgetSize = useCallback((id: string) => {
    setPlaced((p) =>
      p.map((x) => {
        if (x.id !== id || !canResizeKind(x.kind)) return x;
        return { ...x, size: cycleSizeForKind(x.kind, x.size) };
      }),
    );
  }, []);

  const resetDefault = useCallback(() => {
    setPlaced(DEFAULT_PLACED.map((d) => ({ ...d, id: uid() })));
  }, []);

  const closePanel = useCallback(() => setPanelOpen(false), []);
  const togglePanel = useCallback(() => setPanelOpen((o) => !o), []);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  const value = useMemo(
    () => ({
      placed,
      hydrated,
      panelOpen,
      setPanelOpen,
      togglePanel,
      closePanel,
      addable,
      addWidget,
      removeWidget,
      cycleWidgetSize,
      resetDefault,
    }),
    [
      placed,
      hydrated,
      panelOpen,
      closePanel,
      togglePanel,
      addable,
      addWidget,
      removeWidget,
      cycleWidgetSize,
      resetDefault,
    ],
  );

  return (
    <DashboardCustomizeContext.Provider value={value}>
      {children}
    </DashboardCustomizeContext.Provider>
  );
}

export function useDashboardCustomize() {
  const ctx = useContext(DashboardCustomizeContext);
  if (!ctx) {
    throw new Error("useDashboardCustomize must be used within DashboardCustomizeProvider");
  }
  return ctx;
}

/** Widget library — hero band on desktop; inline when customizing. */
export function DashboardCustomizePanel({
  variant = "default",
}: {
  variant?: "default" | "mobile" | "hero";
}) {
  const { panelOpen, addable, addWidget, resetDefault } = useDashboardCustomize();
  const [filter, setFilter] = useState<WidgetFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return addable;
    return addable.filter((k) => WIDGET_LIBRARY[k].tier === filter);
  }, [addable, filter]);

  if (variant === "default") return null;
  if (variant !== "hero" && !panelOpen) return null;

  return (
    <div
      id="dashboard-customize-panel"
      role="region"
      aria-label="Add dashboard widgets"
      className={[
        "build-widget-customize-panel",
        variant === "hero" ? "build-widget-customize-panel--hero" : "",
        variant === "mobile" ? "build-widget-customize-panel--mobile" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="build-widget-customize-panel-head">
        <div className="min-w-0">
          <p className="build-widget-customize-title">Widget library</p>
          <p className="build-widget-customize-subtitle">Tap a block to add it to your board</p>
        </div>
        <button
          type="button"
          onClick={resetDefault}
          className="build-widget-customize-reset-icon"
          title="Reset all widgets to original layout"
          aria-label="Reset all widgets to original layout"
        >
          <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div className="build-widget-customize-filters" role="tablist" aria-label="Filter widgets">
        {WIDGET_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`build-widget-customize-filter${filter === f.id ? " build-widget-customize-filter--active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="build-widget-customize-grid">
        {filtered.length === 0 ? (
          <li className="build-widget-customize-empty">
            {addable.length === 0
              ? "All widgets are on the board."
              : "No widgets in this filter — try another tab."}
          </li>
        ) : (
          filtered.map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => addWidget(k)}
                className="build-widget-customize-card"
              >
                <span className="build-widget-customize-card-top">
                  <span className="widget-badge">{WIDGET_LIBRARY[k].tier}</span>
                  <Plus className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="build-widget-customize-card-label">{WIDGET_META[k].label}</span>
                <span className="build-widget-customize-card-hint">{WIDGET_META[k].hint}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** @deprecated Use DashboardCustomizePanel in the hero band instead. */
export function DashboardCustomizeChatPicker() {
  return null;
}
