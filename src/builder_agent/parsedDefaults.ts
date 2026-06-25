import { DEFAULT_CHAIN, DEFAULT_DEX } from "./blocks";
import type { ParsedPrompt } from "./types";

/** Structural defaults for LLM-parsed strategies (no regex inference). */
export function createDefaultParsed(raw: string, patch?: Partial<ParsedPrompt>): ParsedPrompt {
  return {
    raw,
    strategy: "Limit Order",
    side: null,
    depositChain: DEFAULT_CHAIN,
    withdrawChain: DEFAULT_CHAIN,
    dex: DEFAULT_DEX,
    coin: null,
    toCoin: null,
    amount: null,
    swapAmount: null,
    priceGoal: null,
    rangeLow: null,
    rangeHigh: null,
    gridLevels: null,
    sliceCount: null,
    intervalSeconds: null,
    maxSlippageBps: null,
    intervals: null,
    wallet: null,
    includeSwap: false,
    includeWithdraw: false,
    useLoop: false,
    loopIntervalValue: null,
    loopIntervalUnit: null,
    includeSchedule: false,
    scheduleValue: null,
    scheduleUnit: null,
    ...patch,
  };
}
