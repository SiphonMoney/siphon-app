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
import { Plus } from "lucide-react";
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

/** Inline add-widget panel — lives in the dashboard toolbar column (not a bottom portal). */
export function DashboardCustomizePanel() {
  const { panelOpen, addable, addWidget, resetDefault } = useDashboardCustomize();

  if (!panelOpen) return null;

  return (
    <div
      id="dashboard-customize-panel"
      role="dialog"
      aria-label="Add dashboard widgets"
      className="build-widget-customize-panel"
    >
      <p className="build-widget-customize-title">Add widgets</p>
      <ul className="build-widget-customize-list">
        {addable.length === 0 ? (
          <li className="build-widget-customize-empty">All widgets are on the board.</li>
        ) : (
          addable.map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => addWidget(k)}
                className="build-widget-customize-item"
              >
                <span className="min-w-0">
                  <span className="build-widget-customize-item-label">{WIDGET_META[k].label}</span>
                  <span className="build-widget-customize-item-hint">{WIDGET_META[k].hint}</span>
                </span>
                <Plus className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))
        )}
      </ul>
      <button type="button" onClick={resetDefault} className="build-widget-customize-reset">
        Reset layout
      </button>
    </div>
  );
}

/** @deprecated Use DashboardCustomizePanel in the widget toolbar instead. */
export function DashboardCustomizeChatPicker() {
  return null;
}
