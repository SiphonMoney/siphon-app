import type { Edge, Node } from "@xyflow/react";
import { createFlowFromParsed } from "./createNodes";
import { llmParse } from "./llmParse";
import { applyFollowUpAnswer, applyIntentFromMessage, mergeParsed } from "./parseFollowUp";
import { parsePrompt } from "./parsePrompt";
import { getNextQuestion } from "./questions";
import { syncFlowStructure } from "./syncFlow";
import type { BuilderAgentSession, BuilderAgentTurnResult } from "./types";

function buildSession(parsed: ReturnType<typeof parsePrompt>, transcript: string[]): BuilderAgentSession {
  const next = getNextQuestion(parsed);
  return {
    parsed,
    pendingField: next?.field ?? null,
    transcript,
  };
}

function applyFlowFromParsed(
  parsed: ReturnType<typeof parsePrompt>,
  existingNodes: Node[],
  existingEdges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  if (existingNodes.length === 0) {
    return createFlowFromParsed(parsed);
  }
  return syncFlowStructure(existingNodes, existingEdges, parsed);
}

export function processBuilderTurn(
  input: string,
  session: BuilderAgentSession | null,
  existingNodes: Node[],
  existingEdges: Edge[]
): BuilderAgentTurnResult {
  const trimmed = input.trim();

  if (!session) {
    const parsed = parsePrompt(trimmed);
    const transcript = [trimmed];
    const { nodes, edges } = createFlowFromParsed(parsed);
    const nextSession = buildSession(parsed, transcript);
    const next = getNextQuestion(parsed);

    return {
      nodes,
      edges,
      session: nextSession,
      botMessage: next?.question ?? null,
    };
  }

  let parsed = { ...session.parsed };
  const transcript = [...session.transcript, trimmed];

  if (session.pendingField) {
    parsed = applyFollowUpAnswer(session.pendingField, trimmed, parsed);
  } else {
    const patch = parsePrompt(trimmed);
    parsed = mergeParsed(parsed, {
      coin: patch.coin,
      toCoin: patch.toCoin,
      amount: patch.amount,
      side: patch.side,
      priceGoal: patch.priceGoal,
      rangeLow: patch.rangeLow,
      rangeHigh: patch.rangeHigh,
      gridLevels: patch.gridLevels,
      sliceCount: patch.sliceCount,
      intervalSeconds: patch.intervalSeconds,
      maxSlippageBps: patch.maxSlippageBps,
      wallet: patch.wallet,
      strategy: patch.strategy,
      useLoop: patch.useLoop || parsed.useLoop,
      loopIntervalValue: patch.loopIntervalValue ?? parsed.loopIntervalValue,
      loopIntervalUnit: patch.loopIntervalUnit ?? parsed.loopIntervalUnit,
      includeSchedule: patch.includeSchedule || parsed.includeSchedule,
      scheduleValue: patch.scheduleValue ?? parsed.scheduleValue,
      scheduleUnit: patch.scheduleUnit ?? parsed.scheduleUnit,
      includeSwap: patch.includeSwap || parsed.includeSwap,
      includeWithdraw: patch.includeWithdraw || parsed.includeWithdraw,
    });
    parsed.raw = `${parsed.raw}\n${trimmed}`.trim();
  }

  parsed = applyIntentFromMessage(trimmed, parsed);

  const { nodes, edges } = applyFlowFromParsed(parsed, existingNodes, existingEdges);
  const nextSession = buildSession(parsed, transcript);
  const next = getNextQuestion(parsed);

  return {
    nodes,
    edges,
    session: nextSession,
    botMessage: next?.question ?? null,
  };
}

/**
 * LLM-backed turn: routes the prompt through the Claude agentic chain
 * (/api/builder-agent) for language understanding, then reuses the same flow
 * pipeline. The LLM re-derives the full strategy from the running transcript each
 * turn, so no pendingField state machine is needed. Falls back to the pure-regex
 * `processBuilderTurn` when the chain is unavailable (no API key) or errors.
 */
export async function processBuilderTurnLLM(
  input: string,
  session: BuilderAgentSession | null,
  existingNodes: Node[],
  existingEdges: Edge[]
): Promise<BuilderAgentTurnResult> {
  const trimmed = input.trim();
  const transcript = [...(session?.transcript ?? []), trimmed];

  const result = await llmParse(trimmed, transcript);
  if (!result) {
    // Chain unavailable / errored — deterministic regex path keeps the builder working.
    return processBuilderTurn(input, session, existingNodes, existingEdges);
  }

  const { parsed } = result;
  const { nodes, edges } = applyFlowFromParsed(parsed, existingNodes, existingEdges);
  const nextSession = buildSession(parsed, transcript);
  // Prefer Claude's conversational reply; fall back to the next required-field question.
  const botMessage = result.message ?? getNextQuestion(parsed)?.question ?? null;

  return { nodes, edges, session: nextSession, botMessage };
}
