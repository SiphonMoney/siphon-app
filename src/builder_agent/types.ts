import type { Edge, Node } from "@xyflow/react";
import type { StrategyKind, StrategySide } from "../lib/strategySpec";

export type { StrategyKind, StrategySide };

export type BlockType = "deposit" | "strategy" | "swap" | "withdraw";

export interface ParsedPrompt {
  raw: string;
  strategy: StrategyKind;
  side: StrategySide | null;
  depositChain: string;
  withdrawChain: string;
  dex: string;
  coin: string | null;
  toCoin: string | null;
  amount: string | null;
  priceGoal: string | null;
  rangeLow: string | null;
  rangeHigh: string | null;
  gridLevels: string | null;
  sliceCount: string | null;
  intervalSeconds: string | null;
  maxSlippageBps: string | null;
  intervals: string | null;
  wallet: string | null;
  includeSwap: boolean;
  includeWithdraw: boolean;
  useLoop: boolean;
  loopIntervalValue: string | null;
  loopIntervalUnit: string | null;
  includeSchedule: boolean;
  scheduleValue: string | null;
  scheduleUnit: string | null;
}

export interface BuilderAgentResult {
  nodes: Node[];
  edges: Edge[];
  warnings: string[];
  summary: string;
}

export type MissingField =
  | "coin"
  | "inactiveToken"
  | "amount"
  | "side"
  | "priceGoal"
  | "rangeLow"
  | "rangeHigh"
  | "gridLevels"
  | "sliceCount"
  | "intervalSeconds"
  | "loopInterval"
  | "toCoin"
  | "wallet";

export interface BuilderAgentSession {
  parsed: ParsedPrompt;
  pendingField: MissingField | null;
  transcript: string[];
}

export interface BuilderAgentTurnResult {
  nodes: Node[];
  edges: Edge[];
  session: BuilderAgentSession;
  botMessage: string | null;
}

export interface BlockNodeData {
  label: string;
  type: BlockType;
  chain: string | null;
  dex: string | null;
  strategy: string | null;
  side: string | null;
  coin: string | null;
  amount: string | null;
  toCoin: string | null;
  toAmount: string | null;
  wallet: string | null;
  priceGoal: string | null;
  rangeLow: string | null;
  rangeHigh: string | null;
  gridLevels: string | null;
  sliceCount: string | null;
  intervalSeconds: string | null;
  maxSlippageBps: string | null;
  intervals: string | null;
  [key: string]: unknown;
}
