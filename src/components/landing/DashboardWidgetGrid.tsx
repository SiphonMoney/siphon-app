"use client";

import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Settings, Trash2, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SIZE_TO_GRID, WIDGET_META } from "@/components/widgets/config/grid";
import {
  DESKTOP_WIDGET_GRID,
  MOBILE_WIDGET_GRID,
  paginateWidgets,
} from "@/components/widgets/config/widgetPages";
import { renderWidget } from "@/components/widgets/WidgetFactory";
import {
  DashboardCustomizePanel,
  useDashboardCustomize,
} from "@/components/landing/dashboard-customize-context";
import { canResizeKind } from "@/components/widgets/config/widgetLibrary";

/** 6-column span → 2-column span (max two tiles per row on small screens). */
function mobileGridColumnSpan(sixColSpan: number): number {
  return sixColSpan >= 4 ? 2 : 1;
}

const PAGE_EXIT_MS = 240;
const PAGE_FADE_MS = 380;

type WidgetPhase = "idle" | "exit" | "enter";

type DashboardWidgetGridProps = {
  /** Hide collapse — build page toggles the whole band from the chat input. */
  hideCollapseControl?: boolean;
};

export function DashboardWidgetGrid({ hideCollapseControl = false }: DashboardWidgetGridProps) {
  const {
    placed,
    hydrated,
    panelOpen,
    togglePanel,
    removeWidget,
    cycleWidgetSize,
  } = useDashboardCustomize();

  const [collapsed, setCollapsed] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [visiblePageIndex, setVisiblePageIndex] = useState(0);
  const [widgetPhase, setWidgetPhase] = useState<WidgetPhase>("idle");
  const pendingPageRef = useRef(0);
  const hasPlayedInitialEnterRef = useRef(false);
  const [hasEnteredOnce, setHasEnteredOnce] = useState(false);

  const gridSpec = isMobileLayout ? MOBILE_WIDGET_GRID : DESKTOP_WIDGET_GRID;
  const pages = useMemo(() => paginateWidgets(placed, gridSpec), [placed, gridSpec]);
  const pageCount = pages.length;
  const safePageIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
  const pageWidgets = pages[visiblePageIndex] ?? [];

  const requestPage = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(0, next), Math.max(0, pageCount - 1));
      pendingPageRef.current = clamped;
      setPageIndex(clamped);

      if (!hydrated) {
        setVisiblePageIndex(clamped);
        return;
      }

      if (clamped === visiblePageIndex && widgetPhase === "idle") return;
      if (widgetPhase === "exit") {
        pendingPageRef.current = clamped;
        return;
      }

      setWidgetPhase("exit");
    },
    [hydrated, pageCount, visiblePageIndex, widgetPhase],
  );

  const handleTogglePanel = () => {
    if (!panelOpen && !hideCollapseControl) setCollapsed(false);
    togglePanel();
  };

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileLayout(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!hydrated || hasPlayedInitialEnterRef.current) return;
    hasPlayedInitialEnterRef.current = true;
    setWidgetPhase("enter");
  }, [hydrated]);

  useEffect(() => {
    if (widgetPhase !== "exit") return;
    const timer = window.setTimeout(() => {
      setVisiblePageIndex(pendingPageRef.current);
      setWidgetPhase("enter");
    }, PAGE_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [widgetPhase]);

  useEffect(() => {
    if (widgetPhase !== "enter") return;
    const timer = window.setTimeout(() => {
      setWidgetPhase("idle");
      setHasEnteredOnce(true);
    }, PAGE_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [widgetPhase, visiblePageIndex]);

  useEffect(() => {
    if (safePageIndex !== pageIndex) {
      setPageIndex(safePageIndex);
      pendingPageRef.current = safePageIndex;
      if (hydrated && safePageIndex !== visiblePageIndex && widgetPhase === "idle") {
        setWidgetPhase("exit");
      } else if (!hydrated) {
        setVisiblePageIndex(safePageIndex);
      }
    }
  }, [pageCount, pageIndex, safePageIndex, hydrated, visiblePageIndex, widgetPhase]);

  const gridReady = hydrated && (widgetPhase !== "idle" || hasEnteredOnce);
  const pageTransitioning = widgetPhase === "exit" || widgetPhase === "enter";

  return (
    <div
      id="dashboard"
      className={[
        "scroll-mt-28",
        panelOpen ? "widgets-editing" : "",
        collapsed ? "widgets-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="build-widget-grid-shell">
        <div
          className={`build-widget-grid-main min-w-0 overflow-x-hidden ${collapsed ? "hidden" : ""}`}
        >
          <div
            className={[
              `build-widget-grid build-widget-grid--paged build-widget-grid--rows-${gridSpec.rows}`,
              widgetPhase === "exit" ? "build-widget-grid--exiting" : "",
              widgetPhase === "enter" ? "build-widget-grid--entering" : "",
              !gridReady ? "build-widget-grid--hidden" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {gridReady
              ? pageWidgets.map((p) => {
              const { col, row } = SIZE_TO_GRID[p.size];
              const colSpan = isMobileLayout ? mobileGridColumnSpan(col) : col;
              return (
                <div
                  key={`${visiblePageIndex}-${p.id}`}
                  className={`build-widget-cell relative min-h-0 min-w-0${panelOpen ? " build-widget-cell--editing" : ""}`}
                  style={{
                    gridColumn: `span ${colSpan}`,
                    gridRow: `span ${row}`,
                  }}
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                    {renderWidget(p)}
                  </div>
                  {panelOpen ? (
                    <div className="build-widget-edit-bar pointer-events-auto">
                      {canResizeKind(p.kind) ? (
                        <button
                          type="button"
                          onClick={() => cycleWidgetSize(p.id)}
                          className="build-widget-edit-btn"
                          title="Change size"
                        >
                          <span className="hidden sm:inline">{p.size.replace("x", "×")}</span>
                          <LayoutGrid className="size-3 sm:hidden" aria-hidden />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeWidget(p.id)}
                        className="build-widget-edit-btn build-widget-edit-btn--danger"
                        aria-label={`Remove ${WIDGET_META[p.kind].label}`}
                      >
                        <Trash2 className="size-3 sm:size-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
              : null}
          </div>
        </div>

        <div className="build-widget-grid-toolbar">
          {!hideCollapseControl ? (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="build-widget-tool-btn"
              title={collapsed ? "Show dashboard" : "Collapse dashboard"}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <ChevronsUp className="size-4" strokeWidth={1.75} aria-hidden />
              ) : (
                <ChevronsDown className="size-4" strokeWidth={1.75} aria-hidden />
              )}
              <span className="sr-only">
                {collapsed ? "Show dashboard" : "Collapse dashboard"}
              </span>
            </button>
          ) : null}
          <div className="build-widget-settings-slot">
            <button
              type="button"
              onClick={handleTogglePanel}
              className={`build-widget-tool-btn ${panelOpen ? "build-widget-tool-btn--active" : ""}`}
              aria-expanded={panelOpen}
              aria-controls="dashboard-customize-panel"
              title="Customize dashboard"
            >
              <Settings className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="sr-only">Customize dashboard</span>
            </button>
            <DashboardCustomizePanel />
          </div>
          {pageCount > 1 ? (
            <nav
              className="build-widget-page-nav build-widget-page-nav--toolbar"
              aria-label="Dashboard pages"
            >
              <span className="build-widget-page-label">Pages</span>
              <div className="build-widget-page-stepper">
                <button
                  type="button"
                  className="build-widget-page-step-btn"
                  onClick={() => requestPage(safePageIndex - 1)}
                  disabled={safePageIndex === 0 || pageTransitioning}
                  aria-label="Previous page"
                >
                  <ChevronUp className="size-3.5" strokeWidth={2} aria-hidden />
                </button>
                <div className="build-widget-page-dots" role="tablist" aria-label="Select page">
                  {pages.map((_, i) => (
                    <button
                      key={`page-${i}`}
                      type="button"
                      role="tab"
                      className={`build-widget-page-dot${i === safePageIndex ? " build-widget-page-dot--active" : ""}`}
                      onClick={() => requestPage(i)}
                      aria-label={`Page ${i + 1}`}
                      aria-selected={i === safePageIndex}
                      disabled={pageTransitioning}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="build-widget-page-step-btn"
                  onClick={() => requestPage(safePageIndex + 1)}
                  disabled={safePageIndex >= pageCount - 1 || pageTransitioning}
                  aria-label="Next page"
                >
                  <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
                </button>
              </div>
              <span className="build-widget-page-fraction" aria-live="polite">
                {safePageIndex + 1}
                <span className="build-widget-page-fraction-sep">/</span>
                {pageCount}
              </span>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
