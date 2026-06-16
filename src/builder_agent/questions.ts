import { isActiveToken } from "./blocks";
import type { MissingField, ParsedPrompt } from "./types";

const QUESTION_BUILDERS: Record<MissingField, (parsed: ParsedPrompt) => string> = {
  coin: () => "Which token should the deposit use? (e.g. ETH, USDC)",
  inactiveToken: (parsed) =>
    `${parsed.coin} isn't active yet — which token should we use instead? (ETH or USDC)`,
  amount: (parsed) =>
    `How much ${parsed.coin ?? "token"} do you want to deposit?`,
  priceGoal: (parsed) => {
    const token = parsed.coin ?? "your token";
    const strategy = parsed.strategy.toLowerCase();
    return `What is the goal price for the ${strategy} on ${token}?`;
  },
  intervals: () => "How often should DCA run? (e.g. every 1 day)",
  toCoin: (parsed) =>
    `Which token should we swap ${parsed.coin ?? "your deposit"} into?`,
  wallet: () => "What wallet address should receive the withdrawal?",
};

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

  if (parsed.strategy !== "DCA" && !parsed.priceGoal) {
    missing.push("priceGoal");
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
