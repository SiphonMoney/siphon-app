"use client";

import { GripVertical, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SwapModule } from "@/components/app/SwapModule";

const WIDGET_W = 352;
const PAD = 12;

export type SwapIntentPrefill = {
  amountIn: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
};

type Props = {
  anchorRef: RefObject<HTMLElement | null>;
  containerRef?: RefObject<HTMLElement | null>;
  prefill: SwapIntentPrefill;
  verticalBiasPx?: number;
  onDismiss?: () => void;
  onConfirm?: (payload: {
    amountIn: string;
    tokenInSymbol: string;
    tokenOutSymbol: string;
    estimatedOut: string;
  }) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function SwapIntentWidget({
  anchorRef,
  containerRef,
  prefill,
  verticalBiasPx = 0,
  onDismiss,
  onConfirm,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const userDraggedRef = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const clampToAnchor = useCallback(
    (x: number, y: number) => {
      const anchor = containerRef?.current ?? anchorRef.current;
      const el = rootRef.current;
      if (!anchor) return { x, y };
      const w = el?.offsetWidth ?? WIDGET_W;
      const h = el?.offsetHeight ?? 430;
      const maxX = Math.max(PAD, anchor.clientWidth - w - PAD);
      const maxY = Math.max(PAD, anchor.clientHeight - h - PAD);
      return { x: clamp(x, PAD, maxX), y: clamp(y, PAD, maxY) };
    },
    [anchorRef, containerRef],
  );

  const syncToAnchor = useCallback(() => {
    if (userDraggedRef.current) return;
    const anchor = anchorRef.current;
    const container = containerRef?.current ?? anchor;
    const widgetH = rootRef.current?.offsetHeight ?? 430;
    if (!anchor || !container) return;
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const maxX = Math.max(PAD, container.clientWidth - WIDGET_W - PAD);
    const maxY = Math.max(PAD, container.clientHeight - widgetH - PAD);
    setPos({
      x: clamp(anchorRect.right - containerRect.left + 14, PAD, maxX),
      y: clamp(
        anchorRect.top - containerRect.top + (anchorRect.height - widgetH) / 2 + verticalBiasPx,
        PAD,
        maxY,
      ),
    });
  }, [anchorRef, containerRef, verticalBiasPx]);

  useLayoutEffect(() => {
    userDraggedRef.current = false;
    syncToAnchor();
  }, [syncToAnchor, prefill.amountIn, prefill.tokenInSymbol, prefill.tokenOutSymbol]);

  useEffect(() => {
    const anchor = containerRef?.current ?? anchorRef.current;
    if (!anchor || pos === null) return;
    const ro = new ResizeObserver(() => {
      if (!userDraggedRef.current) syncToAnchor();
    });
    ro.observe(anchor);
    const root = rootRef.current;
    if (root) ro.observe(root);
    return () => ro.disconnect();
  }, [anchorRef, containerRef, pos, syncToAnchor]);

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
    [anchorRef, clampToAnchor, containerRef, pos],
  );

  const anchor = containerRef?.current ?? anchorRef.current;
  if (!anchor || !pos) return null;

  const node = (
    <div
      ref={rootRef}
      className="dashboard-widget-enter pointer-events-auto absolute z-[62]"
      style={{
        left: pos.x,
        top: pos.y,
        width: WIDGET_W,
        maxWidth: "min(352px, calc(100vw - 2rem))",
      }}
      role="presentation"
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Drag swap panel"
          className="absolute left-2 top-2 z-10 cursor-grab rounded-lg p-1 text-[#9ca1a7] transition-colors hover:bg-black/[0.04] hover:text-[#16191d] active:cursor-grabbing"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
        >
          <GripVertical className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-2 top-2 z-10 rounded-lg p-1 text-[#9ca1a7] transition-colors hover:bg-black/[0.04] hover:text-[#16191d]"
            aria-label="Dismiss swap panel"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
        <SwapModule
          initialAmountIn={prefill.amountIn}
          initialTokenInSymbol={prefill.tokenInSymbol}
          initialTokenOutSymbol={prefill.tokenOutSymbol}
          reviewLabel="Confirm swap"
          onReviewSwap={onConfirm}
        />
      </div>
    </div>
  );

  return createPortal(node, anchor);
}
