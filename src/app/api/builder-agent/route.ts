import { NextRequest, NextResponse } from "next/server";
import { BUILDER_LLM_SYSTEM_PROMPT } from "@/builder_agent/builderContext";
import { resolveMarketPricesUsd, type MarketPricesUsd } from "@/lib/fetchEthUsd";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Default free model on OpenRouter — override with OPENROUTER_MODEL. */
const DEFAULT_MODEL = "qwen/qwen-2.5-7b-instruct:free";

function getApiKey(): string | null {
  return (
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPENROUTER_KEY?.trim() ||
    null
  );
}

function getModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildSystemPrompt(
  currentState?: Record<string, unknown>,
  marketPrices?: MarketPricesUsd
): string {
  const parts = [BUILDER_LLM_SYSTEM_PROMPT];

  if (marketPrices?.ETH != null && marketPrices.ETH > 0) {
    parts.push(`
<market_prices_usd>
${JSON.stringify(marketPrices, null, 2)}
</market_prices_usd>`);
  }

  if (currentState && Object.keys(currentState).length > 0) {
    parts.push(`
<current_flow_state>
${JSON.stringify(currentState, null, 2)}
</current_flow_state>`);
  }

  return parts.join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "llm_unconfigured" }, { status: 501 });
  }

  let body: {
    prompt?: string;
    transcript?: string[];
    chatHistory?: Array<{ role?: string; content?: string }>;
    currentState?: Record<string, unknown>;
    marketPrices?: Partial<{ ETH: number | null; USDC: number }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const chatHistory = Array.isArray(body.chatHistory)
    ? body.chatHistory
        .filter(
          (turn): turn is { role: "user" | "assistant"; content: string } =>
            (turn.role === "user" || turn.role === "assistant") &&
            typeof turn.content === "string" &&
            turn.content.trim() !== ""
        )
        .slice(-10)
    : [];

  const legacyTranscript = Array.isArray(body.transcript) ? body.transcript.slice(-6) : [];
  const fallbackHistory =
    chatHistory.length > 0
      ? chatHistory
      : legacyTranscript.map((content) => ({ role: "user" as const, content }));

  const currentState =
    body.currentState && typeof body.currentState === "object" ? body.currentState : undefined;

  const marketPrices = await resolveMarketPricesUsd(body.marketPrices);

  const apiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: buildSystemPrompt(currentState, marketPrices) },
    ...fallbackHistory.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
  ];

  if (
    fallbackHistory.length === 0 ||
    fallbackHistory[fallbackHistory.length - 1]?.content.trim() !== prompt
  ) {
    apiMessages.push({ role: "user", content: prompt });
  }

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL?.trim() || "https://siphon.money",
        "X-Title": process.env.OPENROUTER_APP_NAME?.trim() || "Siphon Builder",
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 1024,
        temperature: 0.2,
        messages: apiMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[builder-agent] OpenRouter error:", response.status, errText);
      return NextResponse.json({ error: "openrouter_error" }, { status: 502 });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "empty_response" }, { status: 502 });
    }

    const input = extractJson(content);
    if (!input) {
      console.error("[builder-agent] Failed to parse JSON:", content.slice(0, 400));
      return NextResponse.json({ error: "invalid_llm_json" }, { status: 502 });
    }

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
