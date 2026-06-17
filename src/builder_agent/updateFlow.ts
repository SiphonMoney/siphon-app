import type { Node } from "@xyflow/react";
import { defaultSideForKind } from "../lib/strategySpec";
import type { BlockNodeData, BlockType, ParsedPrompt } from "./types";

const TOKEN_PRICES: Record<string, number> = {
  SOL: 192,
  USDC: 1,
  USDT: 1,
  WBTC: 45000,
  XMR: 120,
  ETH: 3200,
};

function estimateToAmount(amount: string, from: string, to: string): string | null {
  const pFrom = TOKEN_PRICES[from] ?? 0;
  const pTo = TOKEN_PRICES[to] ?? 0;
  if (!pFrom || !pTo) return null;
  return (parseFloat(amount) * (pFrom / pTo)).toFixed(4);
}

export function updateFlowNodes(nodes: Node[], parsed: ParsedPrompt): Node[] {
  return nodes.map((node) => {
    const type = node.data.type as BlockType;
    const data: BlockNodeData = { ...(node.data as BlockNodeData) };

    if (type === "deposit") {
      data.coin = parsed.coin ?? data.coin;
      data.amount = parsed.amount ?? data.amount;
      data.label = `Deposit from ${parsed.depositChain}`;
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
    }

    if (type === "swap") {
      data.coin = parsed.coin ?? data.coin;
      data.amount = parsed.amount ?? data.amount;
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

    return { ...node, data };
  });
}
