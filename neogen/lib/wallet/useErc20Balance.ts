"use client";

import { useEffect, useState } from "react";

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getEthereum(): EthProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum as EthProvider | undefined;
}

function formatUnits(value: bigint, decimals: number): string {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

function balanceOfData(address: string): string {
  const selector = "70a08231";
  const padded = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return `0x${selector}${padded}`;
}

export function useErc20Balance(
  address: string | null,
  chainId: number | null,
  tokenAddress: string | null,
  decimals: number,
) {
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    const eth = getEthereum();
    if (!eth || !address || chainId == null || !tokenAddress) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const currentChainHex = (await eth.request({ method: "eth_chainId" })) as string;
        const currentChainId = Number.parseInt(currentChainHex, 16);
        if (!Number.isFinite(currentChainId) || currentChainId !== chainId) {
          if (!cancelled) setBalance(null);
          return;
        }
        const out = await eth.request({
          method: "eth_call",
          params: [{ to: tokenAddress, data: balanceOfData(address) }, "latest"],
        });
        if (typeof out !== "string") {
          if (!cancelled) setBalance(null);
          return;
        }
        const raw = out.startsWith("0x") ? BigInt(out) : BigInt(out);
        if (!cancelled) setBalance(formatUnits(raw, decimals));
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chainId, tokenAddress, decimals]);

  return { balance };
}
