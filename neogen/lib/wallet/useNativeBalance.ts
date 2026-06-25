"use client";

import { useEffect, useState } from "react";

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getEthereum(): EthProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum as EthProvider | undefined;
}

function formatEthFromWei(wei: bigint): string {
  const zero = BigInt(0);
  const base = BigInt(10) ** BigInt(18);
  const negative = wei < zero;
  const abs = negative ? -wei : wei;
  const whole = abs / base;
  const frac = abs % base;
  if (frac === zero) return `${negative ? "-" : ""}${whole.toString()}`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`;
}

/** Reads native balance from the injected wallet for the requested chain id. */
export function useNativeBalance(address: string | null, chainId: number | null) {
  const [balanceEth, setBalanceEth] = useState<string | null>(null);

  useEffect(() => {
    const eth = getEthereum();
    if (!eth || !address || chainId == null) {
      setBalanceEth(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const currentChainHex = (await eth.request({ method: "eth_chainId" })) as string;
        const currentChainId = Number.parseInt(currentChainHex, 16);
        if (!Number.isFinite(currentChainId) || currentChainId !== chainId) {
          if (!cancelled) setBalanceEth(null);
          return;
        }
        const out = await eth.request({
          method: "eth_getBalance",
          params: [address, "latest"],
        });
        if (typeof out !== "string") {
          if (!cancelled) setBalanceEth(null);
          return;
        }
        const wei = out.startsWith("0x") ? BigInt(out) : BigInt(out);
        if (!cancelled) setBalanceEth(formatEthFromWei(wei));
      } catch {
        if (!cancelled) setBalanceEth(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return { balanceEth };
}
