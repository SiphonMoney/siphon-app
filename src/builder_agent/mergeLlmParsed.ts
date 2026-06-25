import { normalizeStrategyKind } from "../lib/strategySpec";
import type { ParsedPrompt, StrategySide } from "./types";

/** Snapshot sent to the LLM on follow-up turns. */
export function parsedToFlowSnapshot(parsed: ParsedPrompt): Record<string, unknown> {
  return {
    strategy: parsed.strategy,
    side: parsed.side,
    coin: parsed.coin,
    toCoin: parsed.toCoin,
    amount: parsed.amount,
    swapAmount: parsed.swapAmount,
    priceGoal: parsed.priceGoal,
    rangeLow: parsed.rangeLow,
    rangeHigh: parsed.rangeHigh,
    gridLevels: parsed.gridLevels,
    sliceCount: parsed.sliceCount,
    intervalSeconds: parsed.intervalSeconds,
    includeSwap: parsed.includeSwap,
    includeWithdraw: parsed.includeWithdraw,
    useLoop: parsed.useLoop,
    loopIntervalValue: parsed.loopIntervalValue,
    loopIntervalUnit: parsed.loopIntervalUnit,
    includeSchedule: parsed.includeSchedule,
    scheduleValue: parsed.scheduleValue,
    scheduleUnit: parsed.scheduleUnit,
    wallet: parsed.wallet,
  };
}

/** Merge LLM JSON onto prior parsed state — null/omitted LLM fields keep previous values. */
export function mergeLlmOntoParsed(
  base: ParsedPrompt,
  llm: Record<string, unknown>,
  latestPrompt: string
): ParsedPrompt {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(llm, key);

  const str = (key: string): string | null => {
    if (!has(key)) return null;
    const v = llm[key];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  const bool = (key: string): boolean | null => {
    if (!has(key)) return null;
    return typeof llm[key] === "boolean" ? (llm[key] as boolean) : null;
  };

  const sideRaw = has("side") ? llm.side : undefined;
  const side: StrategySide | null =
    sideRaw === "buy" || sideRaw === "sell"
      ? sideRaw
      : sideRaw === null
        ? base.side
        : base.side;

  const strategyRaw = str("strategy");

  let amount = str("amount") ?? base.amount;
  let swapAmount = str("swapAmount") ?? base.swapAmount;

  // LLM often puts per-swap size in `amount` — don't clobber deposit total.
  const amountFromLlm = str("amount");
  if (
    amountFromLlm &&
    !has("swapAmount") &&
    base.useLoop &&
    base.amount &&
    parseFloat(amountFromLlm) < parseFloat(base.amount)
  ) {
    amount = base.amount;
    swapAmount = amountFromLlm;
  }

  return {
    ...base,
    raw: base.raw ? `${base.raw}\n${latestPrompt}`.trim() : latestPrompt,
    strategy: strategyRaw ? normalizeStrategyKind(strategyRaw) : base.strategy,
    side,
    coin: str("coin") ?? base.coin,
    toCoin: str("toCoin") ?? base.toCoin,
    amount,
    swapAmount,
    priceGoal: str("priceGoal") ?? base.priceGoal,
    rangeLow: str("rangeLow") ?? base.rangeLow,
    rangeHigh: str("rangeHigh") ?? base.rangeHigh,
    gridLevels: str("gridLevels") ?? base.gridLevels,
    sliceCount: str("sliceCount") ?? base.sliceCount,
    intervalSeconds: str("intervalSeconds") ?? base.intervalSeconds,
    wallet: str("wallet") ?? base.wallet,
    includeSwap: bool("includeSwap") ?? base.includeSwap,
    includeWithdraw: bool("includeWithdraw") ?? base.includeWithdraw,
    useLoop: bool("useLoop") ?? base.useLoop,
    loopIntervalValue: str("loopIntervalValue") ?? base.loopIntervalValue,
    loopIntervalUnit: str("loopIntervalUnit") ?? base.loopIntervalUnit,
    includeSchedule: bool("includeSchedule") ?? base.includeSchedule,
    scheduleValue: str("scheduleValue") ?? base.scheduleValue,
    scheduleUnit: str("scheduleUnit") ?? base.scheduleUnit,
  };
}
