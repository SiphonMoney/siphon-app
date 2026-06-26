import type { Edge, Node } from "@xyflow/react";
import { createFlowFromParsed } from "./createNodes";
import { llmParse, type BuilderChatTurn, type BuilderMarketContext, type LlmParseFailure } from "./llmParse";
import { createDefaultParsed } from "./parsedDefaults";
import { getNextQuestion } from "./questions";
import { syncFlowStructure } from "./syncFlow";
import type { BuilderAgentSession, BuilderAgentTurnResult, ParsedPrompt } from "./types";

const LLM_MESSAGES: Record<LlmParseFailure["reason"], string> = {
  unconfigured:
    "Builder AI is not configured. Set OPENROUTER_API_KEY in Vercel (Production env) and redeploy — .env.local only works locally.",
  openrouter_error:
    "OpenRouter rejected the request. Check OPENROUTER_API_KEY on Vercel (exact name, Production scope), redeploy, and verify the key at openrouter.ai/keys.",
  bad_response: "Builder AI returned an invalid response. Try again or use a different OPENROUTER_MODEL.",
  network: "Could not reach the builder API. Check your connection and try again.",
};

function buildSession(parsed: ParsedPrompt, transcript: string[]): BuilderAgentSession {
  const next = getNextQuestion(parsed);
  return {
    parsed,
    pendingField: next?.field ?? null,
    transcript,
  };
}

function applyFlowFromParsed(
  parsed: ParsedPrompt,
  existingNodes: Node[],
  existingEdges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (existingNodes.length === 0) {
    return createFlowFromParsed(parsed);
  }
  return syncFlowStructure(existingNodes, existingEdges, parsed);
}

/** OpenRouter-backed builder turn (sole active agent path). */
export async function processBuilderTurn(
  input: string,
  session: BuilderAgentSession | null,
  existingNodes: Node[],
  existingEdges: Edge[],
  chatHistory: BuilderChatTurn[] = [],
  market?: BuilderMarketContext,
): Promise<BuilderAgentTurnResult> {
  const trimmed = input.trim();
  const transcript = [...(session?.transcript ?? []), trimmed];

  const result = await llmParse(trimmed, chatHistory, session?.parsed ?? null, market);
  if ("ok" in result && result.ok === false) {
    const botMessage =
      result.reason === "openrouter_error" && result.detail
        ? result.detail
        : LLM_MESSAGES[result.reason];
    return {
      nodes: existingNodes,
      edges: existingEdges,
      session: session ?? buildSession(createDefaultParsed(trimmed), [trimmed]),
      botMessage,
    };
  }

  const { parsed } = result;
  const { nodes, edges } = applyFlowFromParsed(parsed, existingNodes, existingEdges);
  const nextSession = buildSession(parsed, transcript);
  const botMessage = result.message ?? getNextQuestion(parsed)?.question ?? null;

  return { nodes, edges, session: nextSession, botMessage };
}
