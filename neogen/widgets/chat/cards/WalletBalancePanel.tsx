"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { WalletBalanceCardData } from "@/lib/asiHeadlessClient";
import { BASE_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID } from "@/lib/wallet/chains";

function formatNative(n: number | null) {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatFetched(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  } catch {
    return iso;
  }
}

const ERROR_LABEL: Record<string, string> = {
  rpc_not_configured: "RPC not configured on server",
  rpc_error: "RPC error",
  wallet_address_required: "Wallet address required",
};

type Props = {
  data: WalletBalanceCardData;
  usdcBalance?: string | null;
  onDismiss?: () => void;
  dragHandle?: ReactNode;
  className?: string;
};

export function WalletBalancePanel({
  data,
  usdcBalance,
  onDismiss,
  dragHandle,
  className = "",
}: Props) {
  const sym = data.symbol || "ETH";
  const hasAddress = Boolean(data.address);
  const chainLabel =
    data.chain_name ??
    (data.chain_id === BASE_CHAIN_ID
      ? "Base"
      : data.chain_id === BASE_SEPOLIA_CHAIN_ID
        ? "Base Sepolia"
        : data.chain_id === 1
          ? "Ethereum"
          : data.chain_id != null
            ? `Chain ${data.chain_id}`
            : "");

  const errorDisplay = (() => {
    if (data.ok) return null;
    if (data.message?.trim()) return data.message.trim();
    const e = data.error ?? "";
    return (ERROR_LABEL[e] ?? e) || "Could not load balance.";
  })();

  return (
    <aside
      className={`widget-hover glass-card flex w-full shrink-0 flex-col rounded-xl border border-black/[0.08] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:w-72 lg:sticky lg:top-4 ${className}`}
      aria-label="Wallet balance"
    >
      <div className="flex items-start justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {dragHandle ? (
            <span className="shrink-0 pt-0.5">{dragHandle}</span>
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#16191d]">Wallet balance</p>
            <p className="font-mono text-[11px] text-[#5c6169]">
              {hasAddress && data.address ? shortAddr(data.address) : "Not connected"}
            </p>
            {(chainLabel || data.fetched_at) && (
              <p className="text-[11px] text-[#5c6169]">
                {chainLabel || "—"}
                {data.fetched_at ? ` · ${formatFetched(data.fetched_at)}` : null}
              </p>
            )}
          </div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-[#9ca1a7] transition-colors hover:bg-black/[0.04] hover:text-[#16191d]"
            aria-label="Dismiss balance card"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="px-4 py-4">
        {!data.ok ? (
          <p className="text-sm leading-snug text-rose-800">{errorDisplay}</p>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca1a7]">
              Assets
            </p>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.06] px-2.5 py-2">
                <span className="text-xs font-medium text-[#5c6169]">{sym}</span>
                <span className="font-defi-display text-base font-semibold tabular-nums text-[#16191d]">
                  {formatNative(data.balance_native)}
                </span>
              </div>
              {usdcBalance && Number.parseFloat(usdcBalance) > 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.06] px-2.5 py-2">
                  <span className="text-xs font-medium text-[#5c6169]">USDC</span>
                  <span className="font-defi-display text-base font-semibold tabular-nums text-[#16191d]">
                    {Number.parseFloat(usdcBalance).toLocaleString("en-US", {
                      maximumFractionDigits: 6,
                    })}
                  </span>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <p className="border-t border-black/[0.06] px-4 py-2 text-[10px] leading-snug text-[#9ca1a7]">
        Display-only on-chain read. Not financial advice.
      </p>
    </aside>
  );
}
