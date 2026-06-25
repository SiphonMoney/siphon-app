import type { Edge, Node } from "@xyflow/react";
import { BUILDER_NODE_ROW_Y } from "../lib/builderLayout";
import {
  connectFlowNodes,
  createBlockNodeForType,
  createRecurringFlowFromParsed,
  getDesiredBlockTypes,
} from "./createNodes";
import type { BlockType, ParsedPrompt } from "./types";
import { updateFlowNodes } from "./updateFlow";

function findNodeByType(nodes: Node[], type: BlockType): Node | undefined {
  return nodes.find((node) => node.data.type === type);
}

export function syncFlowStructure(
  nodes: Node[],
  _edges: Edge[],
  parsed: ParsedPrompt
): { nodes: Node[]; edges: Edge[] } {
  if (parsed.useLoop) {
    return createRecurringFlowFromParsed(parsed);
  }

  const desired = getDesiredBlockTypes(parsed);
  const baseY = nodes[0]?.position.y ?? BUILDER_NODE_ROW_Y;
  const runId = Date.now();

  const ordered: Node[] = desired.map((type, index) => {
    const position = { x: 120 + index * 280, y: baseY };
    const existing = findNodeByType(nodes, type);

    if (existing) {
      return { ...existing, position };
    }

    return createBlockNodeForType(type, parsed, position, `${runId}-${type}`);
  });

  const updatedNodes = updateFlowNodes(ordered, parsed);
  return {
    nodes: updatedNodes,
    edges: connectFlowNodes(updatedNodes),
  };
}
