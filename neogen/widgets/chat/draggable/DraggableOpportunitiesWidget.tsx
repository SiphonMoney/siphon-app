"use client";

import { GripVertical } from "lucide-react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { OpportunitiesGridData } from "@/lib/asiHeadlessClient";
import { OpportunitiesGridPanel } from "@/components/widgets/chat/cards/OpportunitiesGridPanel";

const WIDGET_W = 320;
const PAD = 12;

type Props = {
  /** Chat column; widget aligns to the left edge of the column, vertically centered. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Optional larger chat area used for bounds + portal root. */
  containerRef?: RefObject<HTMLElement | null>;
  data: OpportunitiesGridData;
  onDismiss?: () => void;
  reducedMotion?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function DraggableOpportunitiesWidget({
  anchorRef,
  containerRef,
  data,
  onDismiss,
  reducedMotion = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const userDraggedRef = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const clampToAnchor = useCallback((x: number, y: number) => {
    const anchor = containerRef?.current ?? anchorRef.current;
    const el = rootRef.current;
    if (!anchor) return { x, y };
    const w = el?.offsetWidth ?? WIDGET_W;
    const h = el?.offsetHeight ?? 320;
    const maxX = Math.max(PAD, anchor.clientWidth - w - PAD);
    const maxY = Math.max(PAD, anchor.clientHeight - h - PAD);
    return {
      x: clamp(x, PAD, maxX),
      y: clamp(y, PAD, maxY),
    };
  }, [anchorRef, containerRef]);

  const syncToAnchor = useCallback(() => {
    if (userDraggedRef.current) return;
    const anchor = anchorRef.current;
    const container = containerRef?.current ?? anchor;
    const widgetH = rootRef.current?.offsetHeight ?? 360;
    if (!anchor || !container) return;
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const maxX = Math.max(PAD, container.clientWidth - WIDGET_W - PAD);
    const maxY = Math.max(PAD, container.clientHeight - widgetH - PAD);
    setPos({
      x: clamp(anchorRect.left - containerRect.left - WIDGET_W - 14, PAD, maxX),
      y: clamp(
        anchorRect.top - containerRect.top + (anchorRect.height - widgetH) / 2,
        PAD,
        maxY,
      ),
    });
  }, [anchorRef, containerRef]);

  useLayoutEffect(() => {
    userDraggedRef.current = false;
  }, [data.fetched_at]);

  useLayoutEffect(() => {
    syncToAnchor();
  }, [syncToAnchor, data.fetched_at]);

  useEffect(() => {
    if (pos === null) return;
    const anchor = containerRef?.current ?? anchorRef.current;
    if (!anchor) return;

    const ro = new ResizeObserver(() => {
      if (!userDraggedRef.current) syncToAnchor();
    });
    ro.observe(anchor);
    const root = rootRef.current;
    if (root) ro.observe(root);

    return () => {
      ro.disconnect();
    };
  }, [pos, anchorRef, containerRef, syncToAnchor]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (pos === null) return;
      e.preventDefault();
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const origX = rect.left;
      const origY = rect.top;
      const anchorRect = (containerRef?.current ?? anchorRef.current)?.getBoundingClientRect();
      if (!anchorRect) return;
      const pointerId = e.pointerId;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        ev.preventDefault();
        const nx = origX + (ev.clientX - startX) - anchorRect.left;
        const ny = origY + (ev.clientY - startY) - anchorRect.top;
        setPos(clampToAnchor(nx, ny));
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        userDraggedRef.current = true;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [pos, clampToAnchor, anchorRef, containerRef],
  );

  const anchor = containerRef?.current ?? anchorRef.current;
  if (pos === null || !anchor) return null;
  const node = (
    <div
      ref={rootRef}
      className={
        reducedMotion
          ? "pointer-events-auto absolute z-[59]"
          : "dashboard-widget-enter pointer-events-auto absolute z-[59]"
      }
      style={{
        left: pos.x,
        top: pos.y,
        width: WIDGET_W,
        maxWidth: "min(320px, calc(100vw - 2rem))",
      }}
      role="presentation"
    >
      <OpportunitiesGridPanel
        data={data}
        onDismiss={onDismiss}
        className="max-w-none shadow-lg lg:static"
        dragHandle={
          <button
            type="button"
            aria-label="Drag opportunities panel"
            className="cursor-grab rounded-lg p-1 text-[#9ca1a7] transition-colors hover:bg-black/[0.04] hover:text-[#16191d] active:cursor-grabbing"
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
          >
            <GripVertical className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
        }
      />
    </div>
  );
  return createPortal(node, anchor);
}
