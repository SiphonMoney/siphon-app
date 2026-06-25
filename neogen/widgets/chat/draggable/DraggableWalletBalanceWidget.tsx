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
import type { WalletBalanceCardData } from "@/lib/asiHeadlessClient";
import {
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  isSolanaChainCode,
} from "@/lib/wallet/chains";
import { useErc20Balance } from "@/lib/wallet/useErc20Balance";
import { useSolanaSplUsdc } from "@/lib/wallet/useSolanaSplUsdc";
import { WalletBalancePanel } from "@/components/widgets/chat/cards/WalletBalancePanel";

const WIDGET_W = 288;
const PAD = 12;
const USDC_BY_CHAIN: Record<number, string> = {
  [BASE_CHAIN_ID]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [BASE_SEPOLIA_CHAIN_ID]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

type Props = {
  anchorRef: RefObject<HTMLElement | null>;
  /** Optional larger chat area used for bounds + portal root. */
  containerRef?: RefObject<HTMLElement | null>;
  data: WalletBalanceCardData;
  /** Shift down when another right-side card (e.g. price) is visible. */
  verticalBiasPx?: number;
  onDismiss?: () => void;
  reducedMotion?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function DraggableWalletBalanceWidget({
  anchorRef,
  containerRef,
  data,
  verticalBiasPx = 0,
  onDismiss,
  reducedMotion = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const userDraggedRef = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const biasRef = useRef(verticalBiasPx);
  biasRef.current = verticalBiasPx;

  const chainId = data.address && typeof data.chain_id === "number" ? data.chain_id : null;
  const usdcToken = chainId != null ? (USDC_BY_CHAIN[chainId] ?? null) : null;
  const { balance: evmUsdc } = useErc20Balance(
    data.address ?? null,
    chainId,
    usdcToken,
    6,
  );
  const solUsdc = useSolanaSplUsdc(
    data.address ?? null,
    chainId,
  );
  const usdcBalance =
    chainId != null && isSolanaChainCode(chainId) ? solUsdc : evmUsdc;

  const clampToAnchor = useCallback((x: number, y: number) => {
    const anchor = containerRef?.current ?? anchorRef.current;
    const el = rootRef.current;
    if (!anchor) return { x, y };
    const w = el?.offsetWidth ?? WIDGET_W;
    const h = el?.offsetHeight ?? 200;
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
    const widgetH = rootRef.current?.offsetHeight ?? 220;
    const bias = biasRef.current;
    if (!anchor || !container) return;
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const maxX = Math.max(PAD, container.clientWidth - WIDGET_W - PAD);
    const maxY = Math.max(PAD, container.clientHeight - widgetH - PAD);
    setPos({
      x: clamp(anchorRect.right - containerRect.left + 14, PAD, maxX),
      y: clamp(
        anchorRect.top - containerRect.top + (anchorRect.height - widgetH) / 2 + bias,
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
  }, [syncToAnchor, data.fetched_at, verticalBiasPx]);

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
          ? "pointer-events-auto absolute z-[61]"
          : "dashboard-widget-enter pointer-events-auto absolute z-[61]"
      }
      style={{
        left: pos.x,
        top: pos.y,
        width: WIDGET_W,
        maxWidth: "min(288px, calc(100vw - 2rem))",
      }}
      role="presentation"
    >
      <WalletBalancePanel
        data={data}
        usdcBalance={usdcBalance}
        onDismiss={onDismiss}
        className="max-w-none shadow-lg lg:static"
        dragHandle={
          <button
            type="button"
            aria-label="Drag wallet balance card"
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
