import type { Node } from "@xyflow/react";
import { defaultSideForKind } from "../lib/strategySpec";
import { applyLimitOrderTreeFields } from "../lib/limitOrderTree";
import { getTokenPrices } from "../lib/tokenPrices";
import type { BlockNodeData, BlockType, ParsedPrompt } from "./types";

function estimateToAmount(amount: string, from: string, to: string): string | null {
  const prices = getTokenPrices();
  const pFrom = prices[from] ?? 0;
  const pTo = prices[to] ?? 0;
  if (!pFrom || !pTo) return null;
  return (parseFloat(amount) * (pFrom / pTo)).toFixed(4);
}

export function updateFlowNodes(nodes: Node[], parsed: ParsedPrompt): Node[] {
  return nodes.map((node) => {
    const type = node.data.type as BlockType;
    const data: BlockNodeData = { ...(node.data as BlockNodeData) };

    if (type === "deposit") {
      data.coin = parsed.coin ?? data.coin;
      if (parsed.amount != null) data.amount = parsed.amount;
      data.label = "Deposit";
      data.chain = parsed.depositChain;
    }

    if (type === "strategy") {
      data.label = parsed.strategy;
      data.strategy = parsed.strategy;
      data.side = parsed.side ?? data.side ?? defaultSideForKind(parsed.strategy);
      data.priceGoal = parsed.priceGoal ?? data.priceGoal;
      data.rangeLow = parsed.rangeLow ?? data.rangeLow;
      data.rangeHigh = parsed.rangeHigh ?? data.rangeHigh;
      data.gridLevels = parsed.gridLevels ?? data.gridLevels;
      data.sliceCount = parsed.sliceCount ?? data.sliceCount;
      data.intervalSeconds = parsed.intervalSeconds ?? data.intervalSeconds;
      data.maxSlippageBps = parsed.maxSlippageBps ?? data.maxSlippageBps;
      data.intervals = parsed.intervals ?? data.intervals;
      Object.assign(data, applyLimitOrderTreeFields(data as Record<string, unknown>));
    }

    if (type === "swap") {
      data.coin = parsed.coin ?? data.coin;
      if (parsed.swapAmount != null) {
        data.amount = parsed.swapAmount;
      } else if (!parsed.useLoop && parsed.amount != null) {
        data.amount = parsed.amount;
      }
      data.toCoin = parsed.toCoin ?? data.toCoin;
      data.dex = parsed.dex;
      data.label = `Swap on ${parsed.dex}`;
      if (data.coin && data.toCoin && data.amount) {
        data.toAmount = estimateToAmount(data.amount, data.coin, data.toCoin);
      }
    }

    if (type === "withdraw") {
      data.coin = parsed.toCoin ?? parsed.coin ?? data.coin;
      data.amount = parsed.amount ?? data.amount;
      data.wallet = parsed.wallet ?? data.wallet;
      data.chain = parsed.withdrawChain;
      data.label = `Withdraw to ${parsed.withdrawChain}`;
    }

    if (
      node.data.type === "control" &&
      String(node.data.controlKind || "").toLowerCase() === "schedule"
    ) {
      data.scheduleValue = parsed.scheduleValue ?? (data.scheduleValue as string | null);
      data.scheduleUnit = parsed.scheduleUnit ?? (data.scheduleUnit as string | null);
    }

    return { ...node, data };
  });
}
