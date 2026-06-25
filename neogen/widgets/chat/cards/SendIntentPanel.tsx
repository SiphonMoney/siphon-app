"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { SupportedChainId } from "@/lib/wallet/chains";
import { CHAIN_META } from "@/lib/wallet/chains";
import type { SendIntentPrefill } from "@/lib/chat/parseSendIntent";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export type SendIntentPanelData = SendIntentPrefill & {
  chainId: SupportedChainId;
  fromAddress: string;
};

type Props = {
  data: SendIntentPanelData;
  onDismiss?: () => void;
  onConfirm?: () => void;
  dragHandle?: ReactNode;
  className?: string;
};

export function SendIntentPanel({
  data,
  onDismiss,
  onConfirm,
  dragHandle,
  className = "",
}: Props) {
  const chainLabel = CHAIN_META[data.chainId].label;

  return (
    <aside
      className={`widget-hover glass-card flex w-full shrink-0 flex-col rounded-xl border border-black/[0.08] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:w-80 ${className}`}
      aria-label="Send transfer"
    >
      <div className="flex items-start justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {dragHandle ? <span className="shrink-0 pt-0.5">{dragHandle}</span> : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#16191d]">Send</p>
            <p className="text-[11px] text-[#5c6169]">{chainLabel}</p>
          </div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-[#9ca1a7] transition-colors hover:bg-black/[0.04] hover:text-[#16191d]"
            aria-label="Dismiss send card"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="flex items-stretch gap-3 px-4 py-4">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca1a7]">
              From
            </p>
            <p className="mt-0.5 font-mono text-[12px] text-[#16191d]">
              {shortAddr(data.fromAddress)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca1a7]">To</p>
            <p className="mt-0.5 font-mono text-[12px] text-[#16191d]">
              {shortAddr(data.toAddress)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-center border-l border-black/[0.06] pl-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#9ca1a7]">
            Amount
          </p>
          <p className="mt-1 text-right text-2xl font-semibold tabular-nums tracking-tight text-[#16191d]">
            {data.amount}
          </p>
          <p className="text-sm font-medium text-[#5c6169]">{data.symbol}</p>
        </div>
      </div>

      <div className="border-t border-black/[0.06] px-4 py-3">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-xl bg-[#1f2328] py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95"
        >
          Confirm send
        </button>
        <p className="mt-2 text-center text-[10px] text-[#9ca1a7]">
          Opens your wallet to approve
        </p>
      </div>
    </aside>
  );
}
