import type { Edge, Node } from "@xyflow/react";
import { createFlowFromParsed } from "./createNodes";
import { llmParse, type BuilderChatTurn, type BuilderMarketContext } from "./llmParse";
import { createDefaultParsed } from "./parsedDefaults";
import { getNextQuestion } from "./questions";
import { syncFlowStructure } from "./syncFlow";
import type { BuilderAgentSession, BuilderAgentTurnResult, ParsedPrompt } from "./types";

const LLM_UNAVAILABLE_MESSAGE =
  "Builder AI is unavailable. Add OPENROUTER_API_KEY to .env.local and restart the dev server.";

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
  if (!result) {
    return {
      nodes: existingNodes,
      edges: existingEdges,
      session: session ?? buildSession(createDefaultParsed(trimmed), [trimmed]),
      botMessage: LLM_UNAVAILABLE_MESSAGE,
    };
  }

  const { parsed } = result;
  const { nodes, edges } = applyFlowFromParsed(parsed, existingNodes, existingEdges);
  const nextSession = buildSession(parsed, transcript);
  const botMessage = result.message ?? getNextQuestion(parsed)?.question ?? null;

  return { nodes, edges, session: nextSession, botMessage };
}
