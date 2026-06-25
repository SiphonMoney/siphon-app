import { clampParsedToSupportedFlow } from "./flowCapabilities";
import { applyIntentFromMessage } from "./parseFollowUp";
import {
  augmentParsedFromPrompt,
  applyFixedEthLoopBuy,
  applyFollowUpHeuristics,
  applyPercentDipPrice,
} from "./inferToolsFromPrompt";
import { mergeLlmOntoParsed, parsedToFlowSnapshot } from "./mergeLlmParsed";
import { createDefaultParsed } from "./parsedDefaults";
import type { ParsedPrompt } from "./types";

export interface BuilderChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BuilderMarketContext {
  ethUsd: number | null;
}

export interface LlmParseResult {
  parsed: ParsedPrompt;
  message: string | null;
}

/**
 * Calls /api/builder-agent (OpenRouter) and merges JSON onto prior session state.
 * Returns null when the route is unavailable or errors — no regex/heuristic fallback.
 */
export async function llmParse(
  prompt: string,
  chatHistory: BuilderChatTurn[],
  previousParsed?: ParsedPrompt | null,
  market?: BuilderMarketContext
): Promise<LlmParseResult | null> {
  const base =
    previousParsed ?? createDefaultParsed(chatHistory.map((t) => t.content).join("\n") || prompt);

  const ethUsd = market?.ethUsd ?? null;

  let data: { parsed?: Record<string, unknown>; message?: string | null };
  try {
    const res = await fetch("/api/builder-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        chatHistory: chatHistory.slice(-10),
        currentState: previousParsed ? parsedToFlowSnapshot(previousParsed) : undefined,
        marketPrices: { ETH: ethUsd, USDC: 1 },
      }),
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  const llm = data.parsed ?? {};

  let parsed = mergeLlmOntoParsed(base, llm, prompt);
  parsed = augmentParsedFromPrompt(parsed, prompt);
  parsed = applyFollowUpHeuristics(parsed, prompt);
  parsed = applyPercentDipPrice(parsed, prompt, ethUsd);
  parsed = applyFixedEthLoopBuy(parsed, prompt, ethUsd);
  parsed = applyIntentFromMessage(prompt, parsed);

  const { parsed: clamped, capabilityMessage } = clampParsedToSupportedFlow(parsed, prompt);

  return {
    parsed: clamped,
    message: capabilityMessage ?? (typeof data.message === "string" ? data.message : null),
  };
}
