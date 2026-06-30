import { Position, type Edge, type Node } from "@xyflow/react";
import { layoutStrategyNodes, BUILDER_NODE_ROW_Y } from "../lib/builderLayout";
import { applySwapToWithdrawLink } from "../lib/graphLinks";
import { getTokenPrices } from "../lib/tokenPrices";
import {
  REPEAT_BODY_OFFSET_X,
  REPEAT_BODY_OFFSET_Y,
  REPEAT_GROUP_DEFAULT_SIZE,
} from "../lib/repeatGraph";
import { defaultSideForKind } from "../lib/strategySpec";
import { applyLimitOrderTreeFields } from "../lib/limitOrderTree";
import type { BlockNodeData, BlockType, ParsedPrompt } from "./types";

function estimateToAmount(amount: string, from: string, to: string): string | null {
  const prices = getTokenPrices();
  const pFrom = prices[from] ?? 0;
  const pTo = prices[to] ?? 0;
  if (!pFrom || !pTo) return null;
  return (parseFloat(amount) * (pFrom / pTo)).toFixed(4);
}

export type FlowSegment = BlockType | "schedule";

export function isScheduleControlNode(node: Node): boolean {
  return (
    node.data?.type === "control" &&
    String(node.data?.controlKind || "").toLowerCase() === "schedule"
  );
}

export function getDesiredBlockTypes(parsed: ParsedPrompt): BlockType[] {
  const types: BlockType[] = ["deposit", "strategy"];
  if (parsed.includeSwap) types.push("swap");
  if (parsed.includeWithdraw) types.push("withdraw");
  return types;
}

/** Ordered canvas segments for single-shot flows (non-loop). */
export function getDesiredFlowSegments(parsed: ParsedPrompt): FlowSegment[] {
  const segments: FlowSegment[] = ["deposit"];
  if (parsed.includeSchedule) segments.push("schedule");
  segments.push("strategy");
  if (parsed.includeSwap) segments.push("swap");
  if (parsed.includeWithdraw) segments.push("withdraw");
  return segments;
}

export function createScheduleNode(
  parsed: ParsedPrompt,
  position: { x: number; y: number },
  id: string
): Node {
  return {
    id,
    type: "custom",
    position,
    data: {
      label: "Schedule",
      type: "control",
      controlKind: "schedule",
      scheduleValue: parsed.scheduleValue ?? "1",
      scheduleUnit: parsed.scheduleUnit ?? "hours",
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
    draggable: true,
    selectable: true,
    connectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
}

function swapAmountForParsed(parsed: ParsedPrompt): string | null {
  return parsed.swapAmount ?? parsed.amount;
}

export function buildBlockData(type: BlockType, parsed: ParsedPrompt): BlockNodeData {
  if (type === "deposit") {
    return {
      label: "Deposit",
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
    const side = parsed.side ?? defaultSideForKind(parsed.strategy);
    const baseData: BlockNodeData = {
      label: parsed.strategy,
      type,
      chain: null,
      dex: null,
      strategy: parsed.strategy,
      side,
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
    return applyLimitOrderTreeFields(baseData) as BlockNodeData;
  }

  if (type === "swap") {
    const fromCoin = parsed.coin;
    const toCoin = parsed.toCoin;
    const amount = swapAmountForParsed(parsed);
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

function createSegmentNode(
  segment: FlowSegment,
  parsed: ParsedPrompt,
  position: { x: number; y: number },
  runId: string
): Node {
  if (segment === "schedule") {
    return createScheduleNode(parsed, position, `schedule-${runId}`);
  }
  return createBlockNodeForType(segment, parsed, position, `${runId}-${segment}`);
}

export function createFlowFromParsed(parsed: ParsedPrompt): { nodes: Node[]; edges: Edge[] } {
  if (parsed.useLoop) {
    return createRecurringFlowFromParsed(parsed);
  }

  const runId = String(Date.now());
  const segments = getDesiredFlowSegments(parsed);

  const nodes = segments.map((segment, index) =>
    createSegmentNode(segment, parsed, { x: 120 + index * 280, y: BUILDER_NODE_ROW_Y }, runId)
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
    { x: 120, y: BUILDER_NODE_ROW_Y },
    `${runId}-deposit`
  );

  const nodes: Node[] = [deposit];
  const edges: Edge[] = [];
  let cursorX = 400;

  if (parsed.includeSchedule) {
    const scheduleId = `schedule-${runId}`;
    const scheduleNode = createScheduleNode(
      parsed,
      { x: cursorX, y: BUILDER_NODE_ROW_Y },
      scheduleId
    );
    nodes.push(scheduleNode);
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
    position: { x: cursorX, y: BUILDER_NODE_ROW_Y - 30 },
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
