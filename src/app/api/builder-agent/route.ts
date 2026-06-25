import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Node runtime — needs process.env and the Anthropic SDK (not edge-compatible).
export const runtime = "nodejs";

/**
 * Agentic LLM chain behind the Builder chat (modeled on the webfour orchestrator):
 * the user's natural-language prompt → Claude with a forced `set_strategy` tool →
 * structured strategy fields the existing flow pipeline (createFlowFromParsed /
 * getNextQuestion) already understands. Replaces the brittle regex parsePrompt brain
 * with real language understanding while reusing the rest of the builder unchanged.
 *
 * The client merges these fields onto the regex parse as a base (so chain/dex
 * defaults survive) and falls back to the regex parser entirely if this route is
 * unavailable (no key) or errors.
 */

const SYSTEM_PROMPT = `You are Siphon's strategy builder. The user describes a DeFi trading strategy in natural language; you translate it into structured fields by calling the set_strategy tool.

Siphon strategies run privately on Base/Ethereum via a ZK vault. Supported strategy kinds:
- "Limit Order": buy or sell when price crosses a single trigger.
- "Stop Loss": sell when price falls to a trigger.
- "Take Profit": sell when price rises to a trigger.
- "Range": grid of buys/sells between a low and high price (needs rangeLow, rangeHigh, gridLevels).
- "TWAP": split an order into slices over time (needs sliceCount, intervalSeconds).
- "Buy Dip": accumulate as price drops.
- "Sell Rally": distribute as price rises.
- "DCA": recurring buys on a schedule (set useLoop=true with loopIntervalValue/loopIntervalUnit).

Rules:
- Only ETH and USDC are active tokens. If the user names another, still capture it in coin/toCoin so the UI can warn.
- Amounts, prices, and counts are strings (e.g. "0.1", "1500", "5"). Use null for anything the user did not specify — never guess values.
- includeSwap=true when the strategy converts one token to another. includeWithdraw=true when funds should be sent to a wallet. useLoop=true only for recurring/DCA/"every N hours" strategies.
- side is "buy" or "sell" (or null if not applicable/unclear).
- Always provide a short, friendly "message": confirm what you built in one sentence, and if a required field is missing, ask for exactly that one thing.

Call set_strategy exactly once.`;

const SET_STRATEGY_TOOL: Anthropic.Tool = {
  name: "set_strategy",
  description: "Record the structured trading strategy parsed from the user's request.",
  input_schema: {
    type: "object",
    properties: {
      message: { type: "string", description: "One-sentence confirmation, or a question for the single missing required field." },
      strategy: {
        type: "string",
        enum: ["Limit Order", "Stop Loss", "Take Profit", "Range", "TWAP", "Buy Dip", "Sell Rally", "DCA"],
        description: "The strategy kind.",
      },
      side: { type: ["string", "null"], enum: ["buy", "sell", null], description: "Trade direction." },
      coin: { type: ["string", "null"], description: "Input token symbol, e.g. ETH or USDC." },
      toCoin: { type: ["string", "null"], description: "Output token symbol for swaps." },
      amount: { type: ["string", "null"], description: "Amount of the input token, as a string." },
      priceGoal: { type: ["string", "null"], description: "Trigger price in USD, as a string." },
      rangeLow: { type: ["string", "null"], description: "Range low price (Range strategy)." },
      rangeHigh: { type: ["string", "null"], description: "Range high price (Range strategy)." },
      gridLevels: { type: ["string", "null"], description: "Number of grid levels (Range strategy)." },
      sliceCount: { type: ["string", "null"], description: "Number of slices (TWAP)." },
      intervalSeconds: { type: ["string", "null"], description: "Seconds between slices (TWAP)." },
      includeSwap: { type: "boolean", description: "True if the strategy swaps one token for another." },
      includeWithdraw: { type: "boolean", description: "True if funds are withdrawn to a wallet." },
      useLoop: { type: "boolean", description: "True for recurring/DCA strategies." },
      loopIntervalValue: { type: ["string", "null"], description: "Loop interval amount (recurring)." },
      loopIntervalUnit: {
        type: ["string", "null"],
        enum: ["seconds", "minutes", "hours", "blocks", null],
        description: "Loop interval unit (recurring).",
      },
      wallet: { type: ["string", "null"], description: "Recipient wallet address for withdrawals." },
    },
    required: ["message"],
    additionalProperties: false,
  },
};

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Signal the client to fall back to the regex parser.
    return NextResponse.json({ error: "llm_unconfigured" }, { status: 501 });
  }

  let body: { prompt?: string; transcript?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const history = Array.isArray(body.transcript) ? body.transcript.slice(-6) : [];
  const priorContext = history.length
    ? `<conversation_so_far>\n${history.join("\n")}\n</conversation_so_far>\n\n`
    : "";

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [SET_STRATEGY_TOOL],
      tool_choice: { type: "tool", name: "set_strategy" },
      messages: [{ role: "user", content: `${priorContext}${prompt}` }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "set_strategy",
    );
    if (!toolUse) {
      return NextResponse.json({ error: "no_tool_use" }, { status: 502 });
    }

    const input = toolUse.input as Record<string, unknown>;
    const { message, ...parsed } = input;
    return NextResponse.json({
      parsed,
      message: typeof message === "string" ? message : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "llm_error";
    console.error("[builder-agent] LLM error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
