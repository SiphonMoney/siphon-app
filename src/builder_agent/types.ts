import type { Edge, Node } from "@xyflow/react";

export type BlockType = "deposit" | "strategy" | "swap" | "withdraw";

export type StrategyKind = "Limit Order" | "Buy Dip" | "Sell Rally" | "DCA";

export interface ParsedPrompt {
  raw: string;
  strategy: StrategyKind;
  depositChain: string;
  withdrawChain: string;
  dex: string;
  coin: string | null;
  toCoin: string | null;
  amount: string | null;
  priceGoal: string | null;
  intervals: string | null;
  wallet: string | null;
  includeSwap: boolean;
  includeWithdraw: boolean;
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
  | "priceGoal"
  | "intervals"
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
  coin: string | null;
  amount: string | null;
  toCoin: string | null;
  toAmount: string | null;
  wallet: string | null;
  priceGoal: string | null;
  intervals: string | null;
  [key: string]: unknown;
}
