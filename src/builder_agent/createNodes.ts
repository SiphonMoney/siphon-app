import { Position, type Edge, type Node } from "@xyflow/react";
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

function blockStyle(type: BlockType): Node["style"] {
  const isStrategy = type === "strategy";
  return {
    background: isStrategy ? "rgba(255, 193, 7, 0.2)" : "rgba(255, 255, 255, 0.12)",
    border: isStrategy ? "1px solid rgba(255, 193, 7, 0.5)" : "1px solid rgba(255, 255, 255, 0.3)",
    color: "white",
    borderRadius: "8px",
    padding: "0.75rem",
    minWidth: "200px",
    textAlign: "center",
    fontFamily: "var(--font-source-code), monospace",
    fontSize: "12px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };
}

export function getDesiredBlockTypes(parsed: ParsedPrompt): BlockType[] {
  const types: BlockType[] = ["deposit", "strategy"];
  if (parsed.includeSwap) types.push("swap");
  if (parsed.includeWithdraw) types.push("withdraw");
  return types;
}

export function buildBlockData(type: BlockType, parsed: ParsedPrompt): BlockNodeData {
  if (type === "deposit") {
    return {
      label: `Deposit from ${parsed.depositChain}`,
      type,
      chain: parsed.depositChain,
      dex: null,
      strategy: null,
      coin: parsed.coin,
      amount: parsed.amount,
      toCoin: null,
      toAmount: null,
      wallet: null,
      priceGoal: null,
      intervals: null,
    };
  }

  if (type === "strategy") {
    return {
      label: parsed.strategy,
      type,
      chain: null,
      dex: null,
      strategy: parsed.strategy,
      coin: null,
      amount: null,
      toCoin: null,
      toAmount: null,
      wallet: null,
      priceGoal: parsed.priceGoal,
      intervals: parsed.intervals,
    };
  }

  if (type === "swap") {
    const fromCoin = parsed.coin;
    const toCoin = parsed.toCoin;
    const amount = parsed.amount;
    const toAmount =
      fromCoin && toCoin && amount ? estimateToAmount(amount, fromCoin, toCoin) : null;

    return {
      label: `Swap on ${parsed.dex}`,
      type,
      chain: null,
      dex: parsed.dex,
      strategy: null,
      coin: fromCoin,
      amount,
      toCoin,
      toAmount,
      wallet: null,
      priceGoal: null,
      intervals: null,
    };
  }

  return {
    label: `Withdraw to ${parsed.withdrawChain}`,
    type,
    chain: parsed.withdrawChain,
    dex: null,
    strategy: null,
    coin: parsed.toCoin ?? parsed.coin,
    amount: parsed.amount,
    toCoin: null,
    toAmount: null,
    wallet: parsed.wallet,
    priceGoal: null,
    intervals: null,
  };
}

export function createBlockNodeForType(
  type: BlockType,
  parsed: ParsedPrompt,
  position: { x: number; y: number },
  idSuffix: string
): Node {
  return {
    id: `${type}-${idSuffix}`,
    type: "custom",
    position,
    data: buildBlockData(type, parsed),
    style: blockStyle(type),
    draggable: true,
    selectable: true,
    connectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
}

export function connectFlowNodes(nodes: Node[]): Edge[] {
  return nodes.slice(0, -1).map((node, index) => {
    const target = nodes[index + 1];
    return {
      id: `edge-${node.id}-${target.id}`,
      source: node.id,
      target: target.id,
      type: "smoothstep",
      style: { stroke: "rgba(255, 255, 255, 0.3)", strokeWidth: 2 },
    };
  });
}

export function createFlowFromParsed(parsed: ParsedPrompt): { nodes: Node[]; edges: Edge[] } {
  const runId = Date.now();
  const blockTypes = getDesiredBlockTypes(parsed);

  const nodes = blockTypes.map((type, index) =>
    createBlockNodeForType(
      type,
      parsed,
      { x: 120 + index * 280, y: 220 },
      `${runId}-${type}`
    )
  );

  return { nodes, edges: connectFlowNodes(nodes) };
}
