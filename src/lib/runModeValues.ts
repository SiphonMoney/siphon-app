import type { Node } from "@xyflow/react";
import { getSelectedChainId, normalizeRunModeChainLabel, getRunModeChainLabel } from "./networks";

type NodeData = Record<string, unknown>;

function setIfPresent(target: Record<string, string>, key: string, value: unknown): void {
  if (value == null) return;
  const str = String(value).trim();
  if (str) target[key] = str;
}

/** Seed Pay & Run form fields from builder block data. */
export function buildRunModeValuesFromNodes(nodes: Node[]): Record<string, Record<string, string>> {
  const values: Record<string, Record<string, string>> = {};

  for (const node of nodes) {
    const d = node.data as NodeData;
    const type = String(d.type || "");
    const step: Record<string, string> = {};

    if (type === "deposit") {
      setIfPresent(
        step,
        "chain",
        normalizeRunModeChainLabel(String(d.chain || getRunModeChainLabel(getSelectedChainId())))
      );
      setIfPresent(step, "tokenA", d.coin);
      setIfPresent(step, "amount", d.amount);
    } else if (type === "swap") {
      setIfPresent(step, "dexType", d.dex || "Uniswap");
      setIfPresent(step, "coin", d.coin);
      setIfPresent(step, "coinB", d.toCoin);
      setIfPresent(step, "amount", d.amount);
    } else if (type === "strategy") {
      for (const field of [
        "priceGoal",
        "rangeLow",
        "rangeHigh",
        "gridLevels",
        "sliceCount",
        "intervalSeconds",
        "maxSlippageBps",
        "intervals",
        "positionPct",
        "side",
      ]) {
        setIfPresent(step, field, d[field]);
      }
    } else if (type === "withdraw") {
      setIfPresent(
        step,
        "chain",
        normalizeRunModeChainLabel(String(d.chain || getRunModeChainLabel(getSelectedChainId())))
      );
      setIfPresent(step, "coin", d.coin);
      setIfPresent(step, "amount", d.amount);
      setIfPresent(step, "address", d.wallet);
    } else if (type === "repeatGroup") {
      setIfPresent(step, "repeatMode", d.repeatMode || "until_funds");
      setIfPresent(step, "repeatCount", d.repeatCount);
      setIfPresent(step, "loopIntervalValue", d.loopIntervalValue);
      setIfPresent(step, "loopIntervalUnit", d.loopIntervalUnit || "hours");
    } else if (type === "control") {
      for (const field of ["scheduleValue", "scheduleUnit"]) {
        setIfPresent(step, field, d[field]);
      }
    }

    if (Object.keys(step).length > 0) {
      values[node.id] = step;
    }
  }

  return values;
}

export function getRunStepFieldValue(
  runModeValues: Record<string, Record<string, string>>,
  stepId: string,
  field: string,
  nodeData: NodeData
): string {
  const override = runModeValues[stepId]?.[field];
  if (override != null && String(override).trim() !== "") return override;

  if (field === "tokenA") return String(nodeData.coin || "");
  if (field === "coinB") return String(nodeData.toCoin || "");
  if (field === "address") return String(nodeData.wallet || "");
  if (field === "dexType") return String(nodeData.dex || "Uniswap");
  if (field === "chain") {
    const raw = nodeData.chain;
    if (raw != null && String(raw).trim() !== "") {
      return normalizeRunModeChainLabel(String(raw));
    }
    return getRunModeChainLabel(getSelectedChainId());
  }

  const raw = nodeData[field];
  return raw != null ? String(raw) : "";
}
