"use client";

import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Settings, Trash2, LayoutGrid } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const prevPageCountRef = useRef(1);

  const gridSpec = isMobileLayout ? MOBILE_WIDGET_GRID : DESKTOP_WIDGET_GRID;
  const pages = useMemo(() => paginateWidgets(placed, gridSpec), [placed, gridSpec]);
  const pageCount = pages.length;
  const safePageIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
  const pageWidgets = pages[safePageIndex] ?? [];

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
    if (pageCount > prevPageCountRef.current) {
      setPageIndex(pageCount - 1);
    } else if (safePageIndex !== pageIndex) {
      setPageIndex(safePageIndex);
    }
    prevPageCountRef.current = pageCount;
  }, [pageCount, pageIndex, safePageIndex]);

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
            className={`build-widget-grid build-widget-grid--paged build-widget-grid--rows-${gridSpec.rows}`}
          >
            {pageWidgets.map((p, index) => {
              const { col, row } = SIZE_TO_GRID[p.size];
              const colSpan = isMobileLayout ? mobileGridColumnSpan(col) : col;
              const staggerMs = 105;
              return (
                <div
                  key={p.id}
                  className={
                    hydrated
                      ? `dashboard-widget-enter build-widget-cell relative min-h-0 min-w-0${panelOpen ? " build-widget-cell--editing" : ""}`
                      : `relative min-h-0 min-w-0 opacity-0${panelOpen ? " build-widget-cell--editing" : ""}`
                  }
                  style={{
                    gridColumn: `span ${colSpan}`,
                    gridRow: `span ${row}`,
                    ...(hydrated ? { animationDelay: `${index * staggerMs}ms` } : undefined),
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
            })}
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
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={safePageIndex === 0}
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
                      onClick={() => setPageIndex(i)}
                      aria-label={`Page ${i + 1}`}
                      aria-selected={i === safePageIndex}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="build-widget-page-step-btn"
                  onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
                  disabled={safePageIndex >= pageCount - 1}
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
