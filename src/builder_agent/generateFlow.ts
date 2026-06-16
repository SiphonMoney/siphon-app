import { isActiveToken } from "./blocks";
import { createFlowFromParsed } from "./createNodes";
import { parsePrompt } from "./parsePrompt";
import { getMissingFields } from "./questions";
import type { BuilderAgentResult } from "./types";

function collectWarnings(parsed: ReturnType<typeof parsePrompt>): string[] {
  return getMissingFields(parsed).map((field) => {
    switch (field) {
      case "coin":
        return "No input token detected — pick a coin on the Deposit block.";
      case "inactiveToken":
        return `${parsed.coin} is not active yet — switch to ETH or USDC before running.`;
      case "amount":
        return "No amount detected — set an amount on the Deposit block.";
      case "priceGoal":
        return "No price goal detected — set a target on the Strategy block.";
      case "intervals":
        return "DCA interval not detected — set intervals on the Strategy block.";
      case "toCoin":
        return "Swap requested but output token is unclear — set a To coin on the Swap block.";
      case "wallet":
        return "Withdraw block added but no wallet address found — add a recipient wallet.";
      default:
        return "Additional details needed.";
    }
  });
}

function buildSummary(parsed: ReturnType<typeof parsePrompt>, blockCount: number): string {
  const parts = [
    parsed.strategy,
    parsed.coin ? `${parsed.amount ?? "?"} ${parsed.coin}` : "unsized deposit",
  ];

  if (parsed.includeSwap && parsed.toCoin) {
    parts.push(`swap to ${parsed.toCoin}`);
  }

  if (parsed.includeWithdraw) {
    parts.push(parsed.wallet ? "withdraw to wallet" : "withdraw (wallet needed)");
  }

  return `Built ${blockCount}-block flow: ${parts.join(" → ")}.`;
}

export function generateFlowFromPrompt(prompt: string): BuilderAgentResult {
  const parsed = parsePrompt(prompt);
  const { nodes, edges } = createFlowFromParsed(parsed);
  const warnings = collectWarnings(parsed);

  if (parsed.coin && !isActiveToken(parsed.coin) && !warnings.some((w) => w.includes("isn't active"))) {
    warnings.unshift(`${parsed.coin} is not active yet — switch to ETH or USDC before running.`);
  }

  return {
    nodes,
    edges,
    warnings,
    summary: buildSummary(parsed, nodes.length),
  };
}
