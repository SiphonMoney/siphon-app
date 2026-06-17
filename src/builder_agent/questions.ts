import { isActiveToken } from "./blocks";
import type { MissingField, ParsedPrompt, StrategyKind } from "./types";
import { SINGLE_PRICE_STRATEGIES } from "../lib/strategySpec";

const QUESTION_BUILDERS: Record<MissingField, (parsed: ParsedPrompt) => string> = {
  coin: () => "Which token should the deposit use? (e.g. ETH, USDC)",
  inactiveToken: (parsed) =>
    `${parsed.coin} isn't active yet — which token should we use instead? (ETH or USDC)`,
  amount: (parsed) =>
    `How much ${parsed.coin ?? "token"} do you want to deposit?`,
  side: () => "Should this be a buy or sell?",
  priceGoal: (parsed) => {
    switch (parsed.strategy) {
      case "Stop Loss":
        return "What stop price should trigger the exit?";
      case "Take Profit":
        return "What target price should take profit?";
      default:
        return "What limit price should trigger the order?";
    }
  },
  rangeLow: () => "What is the lower bound of the range?",
  rangeHigh: () => "What is the upper bound of the range?",
  gridLevels: () => "How many grid levels? (e.g. 5)",
  sliceCount: () => "How many TWAP slices? (e.g. 10)",
  intervalSeconds: () =>
    "How many seconds between slices? (e.g. 300 for 5 minutes)",
  intervals: () => "How often should DCA run? (e.g. every 1 day)",
  toCoin: (parsed) =>
    `Which token should we swap ${parsed.coin ?? "your deposit"} into?`,
  wallet: () => "What wallet address should receive the withdrawal?",
};

function needsPriceGoal(strategy: StrategyKind): boolean {
  return SINGLE_PRICE_STRATEGIES.includes(strategy);
}

export function getMissingFields(parsed: ParsedPrompt): MissingField[] {
  const missing: MissingField[] = [];

  if (!parsed.coin) {
    missing.push("coin");
  } else if (!isActiveToken(parsed.coin)) {
    missing.push("inactiveToken");
  }

  if (!parsed.amount) {
    missing.push("amount");
  }

  if (needsPriceGoal(parsed.strategy) && !parsed.priceGoal) {
    missing.push("priceGoal");
  }

  if (parsed.strategy === "Range") {
    if (!parsed.rangeLow) missing.push("rangeLow");
    if (!parsed.rangeHigh) missing.push("rangeHigh");
    if (!parsed.gridLevels) missing.push("gridLevels");
  }

  if (parsed.strategy === "TWAP") {
    if (!parsed.sliceCount) missing.push("sliceCount");
    if (!parsed.intervalSeconds) missing.push("intervalSeconds");
  }

  if (parsed.strategy === "DCA" && !parsed.intervals) {
    missing.push("intervals");
  }

  if (parsed.includeSwap && !parsed.toCoin) {
    missing.push("toCoin");
  }

  if (parsed.includeWithdraw && !parsed.wallet) {
    missing.push("wallet");
  }

  return missing;
}

export function getQuestionForField(
  field: MissingField,
  parsed: ParsedPrompt
): string {
  return QUESTION_BUILDERS[field](parsed);
}

export function getNextQuestion(parsed: ParsedPrompt): {
  field: MissingField;
  question: string;
} | null {
  const missing = getMissingFields(parsed);
  if (missing.length === 0) return null;
  const field = missing[0];
  return { field, question: getQuestionForField(field, parsed) };
}
