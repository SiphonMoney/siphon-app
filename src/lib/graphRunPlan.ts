import type { Edge, Node } from "@xyflow/react";
import {
  buildStrategyPayload,
  defaultSideForKind,
  inferSideFromSwap,
  normalizeStrategyKind,
  resolveLoopIntervalSeconds,
  resolveScheduleStartDelaySeconds,
  validateStrategyFields,
  type StrategyKind,
  type StrategyPayload,
} from "./strategySpec";
import {
  getRepeatBodyNodes,
  isRepeatGroupNode,
} from "./repeatGraph";

export interface GraphRunPlan {
  assetIn: string;
  assetOut: string;
  amount: number;
  recipient: string;
  payload: StrategyPayload;
  startDelaySec: number;
  isScheduled: boolean;
}

function isTopLevel(node: Node): boolean {
  return !node.parentId;
}

function isScheduleNode(node: Node): boolean {
  return node.data?.type === "control" && node.data?.controlKind === "schedule";
}

function fieldValue(
  nodes: Node[],
  runModeValues: Record<string, Record<string, string>>,
  node: Node | undefined,
  field: string,
  fallback = ""
): string {
  if (!node) return fallback;
  const override = runModeValues[node.id]?.[field];
  if (override != null && String(override).trim() !== "") return override;
  if (field === "tokenA") return String(node.data?.coin ?? fallback);
  if (field === "coinB") return String(node.data?.toCoin ?? fallback);
  if (field === "address") return String(node.data?.wallet ?? fallback);
  const raw = node.data?.[field];
  return raw != null ? String(raw) : fallback;
}

function mergeNodeFields(
  nodes: Node[],
  runModeValues: Record<string, Record<string, string>>,
  node: Node | undefined
): Record<string, string> {
  if (!node) return {};
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.data)) {
    if (value != null) merged[key] = String(value);
  }
  const overrides = runModeValues[node.id];
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value.trim()) merged[key] = value;
    }
  }
  return merged;
}

/** Validate canvas + run-mode overrides and build the execution payload bounds. */
export function buildGraphRunPlan(
  nodes: Node[],
  _edges: Edge[],
  runModeValues: Record<string, Record<string, string>>
): { ok: true; plan: GraphRunPlan } | { ok: false; error: string } {
  const depositNode = nodes.find((n) => n.data.type === "deposit" && isTopLevel(n));
  const scheduleNode = nodes.find((n) => isScheduleNode(n) && isTopLevel(n));
  const repeatGroup = nodes.find(isRepeatGroupNode);
  const loopNodes = repeatGroup ? getRepeatBodyNodes(nodes, repeatGroup.id) : [];

  const strategyNode =
    loopNodes.find((n) => n.data.type === "strategy") ??
    nodes.find((n) => n.data.type === "strategy" && isTopLevel(n));
  const swapNode =
    loopNodes.find((n) => n.data.type === "swap") ??
    nodes.find((n) => n.data.type === "swap" && isTopLevel(n));
  const withdrawNode =
    loopNodes.find((n) => n.data.type === "withdraw") ??
    nodes.find((n) => n.data.type === "withdraw" && isTopLevel(n));

  if (!depositNode) {
    return { ok: false, error: "Missing Deposit block." };
  }

  const amountStr = fieldValue(nodes, runModeValues, depositNode, "amount", "0");
  const amount = parseFloat(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Please enter a valid deposit amount." };
  }

  const assetIn = fieldValue(nodes, runModeValues, depositNode, "tokenA", "USDC");
  const assetOut =
    fieldValue(nodes, runModeValues, swapNode, "coinB", "ETH") ||
    String(swapNode?.data?.toCoin ?? "ETH");

  const recipient = fieldValue(nodes, runModeValues, withdrawNode, "address");
  if (withdrawNode && !recipient.trim()) {
    return { ok: false, error: "Please enter a withdrawal wallet address." };
  }

  const startDelaySec = scheduleNode
    ? resolveScheduleStartDelaySeconds(mergeNodeFields(nodes, runModeValues, scheduleNode)) ?? 0
    : 0;

  let payload: StrategyPayload | undefined;

  if (strategyNode) {
    const strategyKind = normalizeStrategyKind(strategyNode.data.strategy as string);
    const strategyFields = mergeNodeFields(nodes, runModeValues, strategyNode);
    const resolvedSide =
      strategyKind === "Limit Order" && swapNode
        ? inferSideFromSwap(
            fieldValue(nodes, runModeValues, swapNode, "coin", assetIn),
            fieldValue(nodes, runModeValues, swapNode, "coinB", assetOut)
          )
        : (strategyFields.side as "buy" | "sell") || defaultSideForKind(strategyKind);

    const validation = validateStrategyFields(strategyKind, {
      ...strategyFields,
      side: resolvedSide,
    });
    if (!validation.valid) {
      return { ok: false, error: validation.error ?? "Strategy parameters are incomplete." };
    }
    payload = buildStrategyPayload(strategyKind, { ...strategyFields, side: resolvedSide });
  } else if (repeatGroup) {
    const loopFields = mergeNodeFields(nodes, runModeValues, repeatGroup);
    const intervalSec = resolveLoopIntervalSeconds(loopFields);
    if (!intervalSec || intervalSec <= 0) {
      return {
        ok: false,
        error: "Loop needs a valid cadence (e.g. every 24 hours).",
      };
    }
    const mode =
      String(loopFields.repeatMode || "until_funds").toLowerCase() === "count"
        ? "count"
        : "until_funds";
    let repeatCount: number | undefined;
    if (mode === "count") {
      const raw = String(loopFields.repeatCount || "").trim();
      const count = Number(raw);
      repeatCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : undefined;
    }
    if (mode === "count" && repeatCount === undefined) {
      return { ok: false, error: "Loop set to N times — enter a valid count." };
    }
    if (!swapNode) {
      return { ok: false, error: "Loop needs at least a Swap inside." };
    }
    const isFiniteRepeat = mode === "count" && repeatCount !== undefined;
    payload = {
      strategy_type: isFiniteRepeat ? "TWAP" : "DCA",
      side: "buy",
      upper_bound: 0,
      lower_bound: 0,
      interval_sec: intervalSec,
      slices: isFiniteRepeat ? repeatCount : undefined,
    };
  } else if (scheduleNode) {
    return { ok: false, error: "Schedule-only flows need a Strategy or Loop block after the delay." };
  } else {
    return {
      ok: false,
      error: "Add a Strategy trigger or Loop block to define execution.",
    };
  }

  return {
    ok: true,
    plan: {
      assetIn,
      assetOut,
      amount,
      recipient,
      payload: {
        ...payload,
        start_delay_sec: startDelaySec > 0 ? startDelaySec : payload.start_delay_sec,
      },
      startDelaySec,
      isScheduled: payload.strategy_type === "TWAP" || payload.strategy_type === "DCA",
    },
  };
}

export function strategyKindFromNodes(nodes: Node[]): StrategyKind | "Loop" | null {
  const repeatGroup = nodes.find(isRepeatGroupNode);
  const strategyNode = nodes.find((n) => n.data.type === "strategy");
  if (strategyNode) return normalizeStrategyKind(strategyNode.data.strategy as string);
  if (repeatGroup) return "Loop";
  return null;
}
