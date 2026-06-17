import { Position, type Edge, type Node } from "@xyflow/react";
import { layoutStrategyNodes } from "../lib/builderLayout";
import { applySwapToWithdrawLink } from "../lib/graphLinks";
import {
  REPEAT_BODY_OFFSET_X,
  REPEAT_BODY_OFFSET_Y,
  REPEAT_GROUP_DEFAULT_SIZE,
} from "../lib/repeatGraph";
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
      side: null,
      priceGoal: null,
      rangeLow: null,
      rangeHigh: null,
      gridLevels: null,
      sliceCount: null,
      intervalSeconds: null,
      maxSlippageBps: null,
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
      side: parsed.side ?? defaultSideForKind(parsed.strategy),
      coin: null,
      amount: null,
      toCoin: null,
      toAmount: null,
      wallet: null,
      priceGoal: parsed.priceGoal,
      rangeLow: parsed.rangeLow,
      rangeHigh: parsed.rangeHigh,
      gridLevels: parsed.gridLevels,
      sliceCount: parsed.sliceCount,
      intervalSeconds: parsed.intervalSeconds,
      maxSlippageBps: parsed.maxSlippageBps,
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
      side: null,
      priceGoal: null,
      rangeLow: null,
      rangeHigh: null,
      gridLevels: null,
      sliceCount: null,
      intervalSeconds: null,
      maxSlippageBps: null,
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
    side: null,
    priceGoal: null,
    rangeLow: null,
    rangeHigh: null,
    gridLevels: null,
    sliceCount: null,
    intervalSeconds: null,
    maxSlippageBps: null,
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
  if (parsed.useLoop) {
    return createRecurringFlowFromParsed(parsed);
  }

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

export function createRecurringFlowFromParsed(
  parsed: ParsedPrompt
): { nodes: Node[]; edges: Edge[] } {
  const runId = Date.now();
  const deposit = createBlockNodeForType(
    "deposit",
    parsed,
    { x: 120, y: 220 },
    `${runId}-deposit`
  );

  const nodes: Node[] = [deposit];
  const edges: Edge[] = [];
  let cursorX = 400;

  if (parsed.includeSchedule) {
    const scheduleId = `schedule-${runId}`;
    nodes.push({
      id: scheduleId,
      type: "custom",
      position: { x: cursorX, y: 220 },
      data: {
        label: "Schedule",
        type: "control",
        controlKind: "schedule",
        scheduleValue: parsed.scheduleValue ?? "1",
        scheduleUnit: parsed.scheduleUnit ?? "minutes",
        chain: null,
        dex: null,
        strategy: null,
        coin: null,
        amount: null,
        toCoin: null,
        toAmount: null,
        wallet: null,
        side: null,
        priceGoal: null,
        rangeLow: null,
        rangeHigh: null,
        gridLevels: null,
        sliceCount: null,
        intervalSeconds: null,
        maxSlippageBps: null,
        intervals: null,
      },
      style: blockStyle("strategy"),
      draggable: true,
      selectable: true,
      connectable: true,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    edges.push({
      id: `edge-${deposit.id}-${scheduleId}`,
      source: deposit.id,
      target: scheduleId,
      type: "smoothstep",
      style: { stroke: "rgba(255, 255, 255, 0.3)", strokeWidth: 2 },
    });
    cursorX += 280;
  }

  const repeatId = `repeat-${runId}`;
  const swapId = `swap-${runId}`;
  const withdrawId = `withdraw-${runId}`;

  nodes.push({
    id: repeatId,
    type: "repeatGroup",
    position: { x: cursorX, y: 190 },
    data: {
      label: "Loop",
      type: "repeatGroup",
      repeatMode: "until_funds",
      repeatCount: "",
      loopIntervalValue: parsed.loopIntervalValue ?? "24",
      loopIntervalUnit: parsed.loopIntervalUnit ?? "hours",
      childCount: parsed.includeWithdraw ? 2 : 1,
    },
    style: {
      width: REPEAT_GROUP_DEFAULT_SIZE.width,
      height: REPEAT_GROUP_DEFAULT_SIZE.height,
      padding: 0,
      background: "transparent",
      border: "none",
    },
    draggable: true,
    selectable: true,
    connectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  });

  const prevTop = parsed.includeSchedule ? nodes[nodes.length - 2] : deposit;
  edges.push({
    id: `edge-${prevTop.id}-${repeatId}`,
    source: prevTop.id,
    target: repeatId,
    type: "smoothstep",
    style: { stroke: "rgba(147, 197, 253, 0.45)", strokeWidth: 2 },
  });

  const swapNode = createBlockNodeForType(
    "swap",
    parsed,
    { x: REPEAT_BODY_OFFSET_X, y: REPEAT_BODY_OFFSET_Y + 8 },
    `${runId}-swap`
  );
  swapNode.parentId = repeatId;
  swapNode.extent = "parent";
  swapNode.id = swapId;
  nodes.push(swapNode);

  if (parsed.includeWithdraw) {
    const withdrawNode = createBlockNodeForType(
      "withdraw",
      parsed,
      { x: REPEAT_BODY_OFFSET_X + 210, y: REPEAT_BODY_OFFSET_Y + 8 },
      `${runId}-withdraw`
    );
    withdrawNode.parentId = repeatId;
    withdrawNode.extent = "parent";
    withdrawNode.id = withdrawId;
    withdrawNode.data = {
      ...withdrawNode.data,
      amountSource: "output",
      linkedFromNodeId: swapId,
      amount: "",
    };
    nodes.push(withdrawNode);
    edges.push({
      id: `edge-${swapId}-${withdrawId}`,
      source: swapId,
      target: withdrawId,
      type: "smoothstep",
      style: { stroke: "rgba(147, 197, 253, 0.45)", strokeWidth: 2 },
    });
  }

  let laidOut = layoutStrategyNodes(nodes, edges);
  for (const edge of edges) {
    laidOut = applySwapToWithdrawLink(laidOut, {
      source: edge.source,
      target: edge.target,
      sourceHandle: null,
      targetHandle: null,
    });
  }

  return { nodes: laidOut, edges };
}
