import { parsePrompt } from "./parsePrompt";
import { normalizeStrategyKind } from "../lib/strategySpec";
import type { ParsedPrompt } from "./types";

export interface LlmParseResult {
  parsed: ParsedPrompt;
  message: string | null;
}

/**
 * Calls the server-side agentic LLM chain (/api/builder-agent) and blends its
 * structured output onto the deterministic regex parse:
 *   - regex parse of the full transcript is the BASE (keeps chain/dex defaults,
 *     `raw`, and anything the LLM left null)
 *   - the LLM's concrete (non-null) values OVERRIDE the base — this is the
 *     language-understanding win
 *   - booleans (includeSwap/includeWithdraw/useLoop) always take the LLM value
 *
 * Returns null when the route is unavailable (no ANTHROPIC_API_KEY → 501) or on
 * any error, so callers can fall back to the pure-regex `processBuilderTurn`.
 */
export async function llmParse(
  prompt: string,
  transcript: string[],
): Promise<LlmParseResult | null> {
  let data: { parsed?: Record<string, unknown>; message?: string | null };
  try {
    const res = await fetch("/api/builder-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, transcript }),
    });
    if (!res.ok) return null; // 501 (no key) or upstream error → regex fallback
    data = await res.json();
  } catch {
    return null;
  }

  const llm = data.parsed ?? {};
  // Base from the regex parser over the whole conversation so structural defaults
  // (depositChain, withdrawChain, dex, raw) and any regex catches are preserved.
  const base = parsePrompt([...transcript].join("\n") || prompt);

  const str = (key: string): string | null => {
    const v = llm[key];
    return typeof v === "string" && v.trim() !== "" ? v : null;
  };
  const bool = (key: string, fallback: boolean): boolean =>
    typeof llm[key] === "boolean" ? (llm[key] as boolean) : fallback;
  // Prefer the LLM's concrete value; otherwise keep the regex base value.
  const pick = (key: string, baseVal: string | null): string | null => str(key) ?? baseVal;

  const parsed: ParsedPrompt = {
    ...base,
    strategy: normalizeStrategyKind((str("strategy") ?? base.strategy) as string),
    side: (str("side") as ParsedPrompt["side"]) ?? base.side,
    coin: pick("coin", base.coin),
    toCoin: pick("toCoin", base.toCoin),
    amount: pick("amount", base.amount),
    priceGoal: pick("priceGoal", base.priceGoal),
    rangeLow: pick("rangeLow", base.rangeLow),
    rangeHigh: pick("rangeHigh", base.rangeHigh),
    gridLevels: pick("gridLevels", base.gridLevels),
    sliceCount: pick("sliceCount", base.sliceCount),
    intervalSeconds: pick("intervalSeconds", base.intervalSeconds),
    wallet: pick("wallet", base.wallet),
    includeSwap: bool("includeSwap", base.includeSwap),
    includeWithdraw: bool("includeWithdraw", base.includeWithdraw),
    useLoop: bool("useLoop", base.useLoop),
    loopIntervalValue: pick("loopIntervalValue", base.loopIntervalValue),
    loopIntervalUnit: pick("loopIntervalUnit", base.loopIntervalUnit),
  };

  return {
    parsed,
    message: typeof data.message === "string" ? data.message : null,
  };
}
