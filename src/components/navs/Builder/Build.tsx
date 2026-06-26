"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  Connection,
  Node,
  Edge,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  useReactFlow,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import "./Build.css";
import "./build-dashboard.css";
import BuildNav from "./BuildNav";
import BuildAiPrompt, { type BuildChatMessage } from "./BuildAiPrompt";
import {
  DashboardCustomizeProvider,
} from "@/components/landing/dashboard-customize-context";
import { BuildWidgetSection } from "@/components/landing/BuildWidgetSection";
import { RunningStrategiesProvider } from "@/components/widgets/running-strategies-context";
import BuildPageFooter from "./BuildPageFooter";
import BuildNodeContextMenu from "./BuildNodeContextMenu";
import BuildSimToast from "./BuildSimToast";
import DetailsModal from "../Discover/DetailsModal";
import "../Discover/Discover.css";
import {
  initializeDiscoverStrategies,
  initializeLimitOrderStrategy,
  loadStrategyGraphByName,
  type StrategyMetadata,
} from "../Discover/strategies";
import { useCanvasSimulation, type SimHighlightStatus } from "./useCanvasSimulation";
import { BuildFlowContextProvider, FLOW_NODE_TYPES } from "./flowNodeTypes";
import { useRepeatDropHandlers } from "./RepeatDropHandler";
import {
  createRepeatGroupNode,
  getRepeatChildren,
  isRepeatGroupNode,
  REPEAT_BODY_OFFSET_X,
  REPEAT_BODY_OFFSET_Y,
  syncRepeatGroups,
} from "../../../lib/repeatGraph";
import {
  defaultSideForKind,
  resolveLoopIntervalSeconds,
  resolveScheduleStartDelaySeconds,
  normalizeStrategyKind,
  buildStrategyPayload,
  validateStrategyFields,
} from "../../../lib/strategySpec";
import { layoutStrategyNodes, getModalStepNodes, randomBuilderNodePosition } from "../../../lib/builderLayout";
import { formatGraphForPreview } from "../../../lib/repeatGraph";
import { buildRunModeValuesFromNodes } from "../../../lib/runModeValues";
import {
  applySwapToWithdrawLink,
  clearOutputLinksForRemovedEdges,
  resolveWithdrawAmount,
  syncLinkedWithdrawFromSwap,
} from "../../../lib/graphLinks";
import { processBuilderTurn } from "../../../builder_agent";
import type { BuilderAgentSession } from "../../../builder_agent";
import { useEthPrice } from "@/lib/useEthPrice";
import { showAppToast } from "@/lib/appToast";
import { getSelectedChainId, getTokens, getZkWithdrawRecipient } from "../../../lib/networks";
import { submitEncryptedStrategy } from "../../../lib/strategySubmit";
import { generateZKData, type TokenInfo } from "../../../lib/zkHandler";
import { createVaultOutputNote } from "../../../lib/outputNoteResolver";
import { validateRecipientAddress, chainLabelToId, createDefaultLimitOrderTree } from "./BuildNodes";
import {
  resolveLimitOrderConditionTree,
  validatePriceConditionTreeRaw,
} from "@/lib/limitOrderTree";

interface BuildProps {
  isLoaded?: boolean;
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  currentFileName: string;
  setCurrentFileName: (name: string) => void;
  savedScenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>;
  setSavedScenes: (scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }> | ((scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>) => Array<{ name: string; nodes: Node[]; edges: Edge[] }>)) => void;
  setViewMode?: (mode: 'blueprint' | 'run' | 'discover') => void;
  runningStrategies?: Map<string, { startTime: number; isRunning: boolean; loop: boolean }>;
  setRunningStrategies?: (strategies: Map<string, { startTime: number; isRunning: boolean; loop: boolean }> | ((prev: Map<string, { startTime: number; isRunning: boolean; loop: boolean }>) => Map<string, { startTime: number; isRunning: boolean; loop: boolean }>)) => void;
}

interface NodeContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

function BlueprintFlowViewport({ nodes }: { nodes: Node[] }) {
  const { fitView, setCenter } = useReactFlow();
  const nodeStructureKey = nodes.map((node) => node.id).join("|");

  const alignView = useCallback(() => {
    if (nodes.length === 0) {
      void setCenter(0, 0, { zoom: 0.85, duration: 0 });
      return;
    }
    void fitView({ padding: 0.35, duration: 200, maxZoom: 0.8 });
  }, [nodes.length, setCenter, fitView]);

  useEffect(() => {
    alignView();
    const raf = requestAnimationFrame(alignView);
    const t1 = window.setTimeout(alignView, 80);
    const t2 = window.setTimeout(alignView, 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [nodeStructureKey, nodes.length, alignView]);

  useEffect(() => {
    const onResize = () => alignView();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [alignView]);

  return null;
}

function sortNodesParentsFirst(nds: Node[]): Node[] {
  const roots = nds.filter((n) => !n.parentId);
  const children = nds.filter((n) => n.parentId);
  return [...roots, ...children];
}

function sortAndSyncRepeat(nodes: Node[]): Node[] {
  return sortNodesParentsFirst(syncRepeatGroups(nodes));
}

interface BlueprintFlowProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onPaneContextMenu: (event: React.MouseEvent | MouseEvent) => void;
  onPaneClick: () => void;
  onMoveStart: () => void;
  onNodesDelete: (nodesToDelete: Node[]) => void;
  updateNodeData: (nodeId: string, field: string, value: string) => void;
  tokens: string[];
  isTokenActive: (token: string) => boolean;
  simHighlight?: Record<string, SimHighlightStatus>;
  simShakingId?: string | null;
  simExiting?: boolean;
}

function BlueprintFlow({
  setNodes,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeContextMenu,
  onPaneContextMenu,
  onPaneClick,
  onMoveStart,
  onNodesDelete,
  updateNodeData,
  tokens,
  isTokenActive,
  simHighlight,
  simShakingId,
  simExiting,
}: BlueprintFlowProps & {
  setNodes: BuildProps['setNodes'];
}) {
  const wrappedSync = useCallback(
    (nds: Node[]) => sortAndSyncRepeat(nds),
    []
  );

  const { onNodeDrag, onNodeDragStop } = useRepeatDropHandlers(setNodes, wrappedSync);

  const flowContextValue = useMemo(
    () => ({ updateNodeData, tokens, isTokenActive, simHighlight, simShakingId, simExiting }),
    [updateNodeData, tokens, isTokenActive, simHighlight, simShakingId, simExiting]
  );

  const onFlowInit = useCallback(
    (instance: ReactFlowInstance) => {
      if (nodes.length === 0) {
        void instance.setCenter(0, 0, { zoom: 0.85, duration: 0 });
      }
    },
    [nodes.length]
  );

  return (
    <BuildFlowContextProvider value={flowContextValue}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onInit={onFlowInit}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeContextMenu={onNodeContextMenu}
      onPaneContextMenu={onPaneContextMenu}
      onPaneClick={onPaneClick}
      onMoveStart={onMoveStart}
      onNodesDelete={onNodesDelete}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      minZoom={0.1}
      maxZoom={2}
      deleteKeyCode={['Backspace', 'Delete']}
      nodesDraggable={true}
      nodesConnectable={true}
      elementsSelectable={true}
      panOnDrag
      panOnScroll={false}
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      selectNodesOnDrag={false}
      preventScrolling
      autoPanOnNodeDrag={false}
      nodeTypes={FLOW_NODE_TYPES}
      defaultEdgeOptions={{
        style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 },
        type: 'smoothstep',
      }}
      proOptions={{ hideAttribution: true }}
    >
      <BlueprintFlowViewport nodes={nodes} />
    </ReactFlow>
    </BuildFlowContextProvider>
  );
}

export default function Build({
  isLoaded = true,
  nodes,
  edges,
  setNodes,
  setEdges,
  currentFileName,
  setCurrentFileName,
  savedScenes,
  setSavedScenes,
  setViewMode,
  runningStrategies,
  setRunningStrategies,
}: BuildProps) {
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuState | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runModalNodes, setRunModalNodes] = useState<Node[]>([]);
  const [runModalEdges, setRunModalEdges] = useState<Edge[]>([]);
  const [runFlowKey, setRunFlowKey] = useState(0);
  const [isRunMode, setIsRunMode] = useState(false);
  const [runModeValues, setRunModeValues] = useState<Record<string, Record<string, string>>>({});
  const [runDuration, setRunDuration] = useState('1h');
  const [isFading, setIsFading] = useState(false);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [isBuilderAgentLoading, setIsBuilderAgentLoading] = useState(false);
  const [builderSession, setBuilderSession] = useState<BuilderAgentSession | null>(null);
  const [builderMessages, setBuilderMessages] = useState<BuildChatMessage[]>([]);
  const [chatFocus, setChatFocus] = useState(false);
  const [widgetsVisible, setWidgetsVisible] = useState(true);
  const [builderPrompt, setBuilderPrompt] = useState("");
  const pageLayoutRef = useRef<HTMLDivElement>(null);
  const ethUsd = useEthPrice();
  const tokens = ['ETH', 'USDC', 'SOL', 'USDT', 'WBTC', 'XMR'];

  useEffect(() => {
    if (chatFocus) setWidgetsVisible(false);
  }, [chatFocus]);

  const handleChatActiveChange = useCallback((active: boolean) => {
    setChatFocus(active);
  }, []);

  const handleToggleWidgets = useCallback(() => {
    setWidgetsVisible((visible) => {
      const next = !visible;
      if (next) {
        requestAnimationFrame(() => {
          if (pageLayoutRef.current) pageLayoutRef.current.scrollTop = 0;
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const expandedCanvas = chatFocus && !widgetsVisible;
    window.dispatchEvent(new CustomEvent("build-view-expanded", { detail: expandedCanvas }));
    document.body.classList.toggle("build-view-expanded", expandedCanvas);
    return () => {
      document.body.classList.remove("build-view-expanded");
    };
  }, [chatFocus, widgetsVisible]);
  
  useEffect(() => {
    initializeLimitOrderStrategy();
    initializeDiscoverStrategies();
  }, []);
  
  // Active tokens
  const activeTokens = ['ETH', 'USDC'];
  const isTokenActive = (token: string) => activeTokens.includes(token);

  const {
    simHighlight,
    simShakingId,
    simToast,
    simExiting,
    isSimulating,
    runSimulation,
    dismissToast,
  } = useCanvasSimulation(nodes, edges);
  
  // Normalize node to ensure it has all required properties
  const normalizeNode = useCallback((node: Node): Node => {
    return {
      ...node,
      type: node.type || (node.data?.type === 'repeatGroup' ? 'repeatGroup' : 'custom'),
      draggable: node.draggable !== undefined ? node.draggable : true,
      selectable: node.selectable !== undefined ? node.selectable : true,
      connectable: node.connectable !== undefined ? node.connectable : true,
      sourcePosition: node.sourcePosition || Position.Right,
      targetPosition: node.targetPosition || Position.Left,
      extent: node.extent ?? (node.parentId ? 'parent' : undefined),
    };
  }, []);

  const syncRepeatState = useCallback((nds: Node[]) => sortAndSyncRepeat(nds), []);

  const onLoadStrategyTemplate = useCallback((strategyName: string) => {
    const graph = loadStrategyGraphByName(strategyName);
    if (!graph.nodes.length) return;
    const normalizedNodes = sortAndSyncRepeat(graph.nodes.map(normalizeNode));
    setNodes(normalizedNodes);
    setEdges(graph.edges);
    setCurrentFileName(`${strategyName.toLowerCase().replace(/\s+/g, '-')}.io`);
    setBuilderSession(null);
    setBuilderMessages([]);
    setBuilderPrompt("");
    setNodeContextMenu(null);
  }, [setNodes, setEdges, setCurrentFileName, normalizeNode]);

  useEffect(() => {
    const onStrategyPick = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      if (typeof name === "string" && name.trim()) {
        onLoadStrategyTemplate(name);
      }
    };
    window.addEventListener("build-select-strategy-template", onStrategyPick as EventListener);
    return () =>
      window.removeEventListener("build-select-strategy-template", onStrategyPick as EventListener);
  }, [onLoadStrategyTemplate]);

  const buildBlockNode = useCallback((
    type: 'deposit' | 'withdraw' | 'swap' | 'strategy' | 'control',
    chainOrDexOrStrategy?: string,
    opts?: { parentId?: string; position?: { x: number; y: number } }
  ): Node => {
    let label = '';
    if (type === 'swap') {
      label = chainOrDexOrStrategy ? `Swap on ${chainOrDexOrStrategy}` : 'Swap';
    } else if (type === 'withdraw') {
      label = chainOrDexOrStrategy ? `Withdraw to ${chainOrDexOrStrategy}` : 'Withdraw';
    } else if (type === 'strategy') {
      label = chainOrDexOrStrategy ? chainOrDexOrStrategy : 'Strategy';
    } else if (type === 'control') {
      label = chainOrDexOrStrategy ? chainOrDexOrStrategy : 'Control';
    } else {
      label = 'Deposit';
    }

    const isControl = type === 'control';
    const controlKind = isControl ? (chainOrDexOrStrategy || '').toLowerCase() : null;
    const isStrategy = type === 'strategy';
    const strategyKind = isStrategy ? normalizeStrategyKind(chainOrDexOrStrategy) : null;
    const blockType = isControl ? 'control' : type;
    const defaultConditionTree = strategyKind === 'Limit Order'
      ? JSON.stringify(createDefaultLimitOrderTree())
      : null;

    return {
      id: `${blockType}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'custom',
      position: opts?.position ?? randomBuilderNodePosition(),
      data: {
        label,
        type: isControl ? 'control' : type,
        chain: (type !== 'swap' && type !== 'strategy' && type !== 'control') ? (chainOrDexOrStrategy || null) : null,
        dex: type === 'swap' ? (chainOrDexOrStrategy || null) : null,
        strategy: isStrategy ? (chainOrDexOrStrategy || null) : null,
        controlKind,
        coin: null,
        amount: null,
        toCoin: null,
        toAmount: null,
        wallet: null,
        amountSource: type === 'withdraw' ? 'fixed' : null,
        linkedFromNodeId: null,
        side: isStrategy && strategyKind !== 'Limit Order'
          ? defaultSideForKind(strategyKind!)
          : null,
        useTree: strategyKind === 'Limit Order' ? 'true' : null,
        conditionTree: defaultConditionTree,
        priceGoal: null,
        positionPct: null,
        rangeLow: null,
        rangeHigh: null,
        gridLevels: null,
        sliceCount: null,
        intervalSeconds: null,
        scheduleValue: null,
        scheduleUnit: 'blocks',
        maxSlippageBps: null,
        intervals: null,
        repeatCount: null,
      },
      style: {
        background: isStrategy
          ? 'rgba(255, 193, 7, 0.2)'
          : isControl
            ? 'rgba(59, 130, 246, 0.2)'
            : 'rgba(255, 255, 255, 0.12)',
        border: isStrategy
          ? '1px solid rgba(255, 193, 7, 0.5)'
          : isControl
            ? '1px solid rgba(59, 130, 246, 0.5)'
            : '1px solid rgba(255, 255, 255, 0.3)',
        color: 'white',
        borderRadius: '8px',
        padding: '0.75rem',
        minWidth: opts?.parentId ? '180px' : '200px',
        textAlign: 'center',
        fontFamily: 'var(--font-source-code), monospace',
        fontSize: '12px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      },
      draggable: true,
      selectable: true,
      connectable: true,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      parentId: opts?.parentId,
      extent: opts?.parentId ? 'parent' : undefined,
      zIndex: opts?.parentId ? 10 : 0,
    };
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => syncRepeatState(applyNodeChanges(changes, nds)));
  }, [setNodes, syncRepeatState]);
  
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => {
      const removed = changes
        .filter((c): c is EdgeChange & { type: "remove"; id: string } => c.type === "remove")
        .map((c) => eds.find((e) => e.id === c.id))
        .filter((e): e is Edge => Boolean(e));

      if (removed.length > 0) {
        setNodes((nds) => clearOutputLinksForRemovedEdges(nds, removed));
      }

      return applyEdgeChanges(changes, eds);
    });
  }, [setEdges, setNodes]);
  
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "smoothstep",
            style: { stroke: "rgba(255, 255, 255, 0.3)", strokeWidth: 2 },
          },
          eds
        )
      );
      setNodes((nds) => applySwapToWithdrawLink(nds, params));
    },
    [setEdges, setNodes]
  );
  
  const onAddNode = useCallback((type: 'deposit' | 'withdraw' | 'swap' | 'strategy' | 'control', chainOrDexOrStrategy?: string) => {
    if (type === 'control' && ['repeat', 'loop'].includes((chainOrDexOrStrategy || '').toLowerCase())) {
      setNodes((nds) => sortAndSyncRepeat([...nds, createRepeatGroupNode(randomBuilderNodePosition())]));
      return;
    }

    const newNode = buildBlockNode(type, chainOrDexOrStrategy, {
      position: randomBuilderNodePosition(),
    });
    
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes, buildBlockNode]);

  const onAddNodeInsideRepeat = useCallback((
    repeatId: string,
    kind: 'swap' | 'strategy' | 'withdraw',
    variant?: string
  ) => {
    const siblings = getRepeatChildren(nodes, repeatId);
    const blockType = kind === 'swap' ? 'swap' : kind === 'withdraw' ? 'withdraw' : 'strategy';
    const child = buildBlockNode(
      blockType,
      kind === 'swap' ? undefined : variant,
      {
        parentId: repeatId,
        position: {
          x: REPEAT_BODY_OFFSET_X + siblings.length * 210,
          y: REPEAT_BODY_OFFSET_Y + 8,
        },
      }
    );
    const prev = siblings[siblings.length - 1] ?? null;

    setNodes((nds) => {
      let next = sortAndSyncRepeat([...nds, child]);
      if (prev) {
        next = applySwapToWithdrawLink(next, {
          source: prev.id,
          target: child.id,
          sourceHandle: null,
          targetHandle: null,
        });
      }
      return next;
    });

    if (prev) {
      setEdges((eds) => addEdge({
        id: `xy-edge__${prev.id}-${child.id}`,
        source: prev.id,
        target: child.id,
        type: 'smoothstep',
        style: { stroke: 'rgba(147, 197, 253, 0.45)', strokeWidth: 2 },
      }, eds));
    }
  }, [buildBlockNode, nodes, setNodes, setEdges]);
  
  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    setNodes((nds) => {
      let next = nds.map((node) => {
      if (node.id === nodeId) {
        const updatedData = { ...node.data, [field]: value };
        
        if (node.data.type === 'swap' && (field === 'amount' || field === 'coin' || field === 'toCoin')) {
          const amount = field === 'amount' ? value : (updatedData.amount || '');
          const coin = field === 'coin' ? value : (updatedData.coin || '');
          const toCoin = field === 'toCoin' ? value : (updatedData.toCoin || '');
          
          if (amount && coin && toCoin) {
            const prices: { [key: string]: number } = { SOL: 192, USDC: 1, USDT: 1, WBTC: 45000, XMR: 120 };
            const pFrom = prices[coin as string] ?? 0;
            const pTo = prices[toCoin as string] ?? 0;
            if (pFrom > 0 && pTo > 0) {
              updatedData.toAmount = (parseFloat(amount as string) * (pFrom / pTo)).toFixed(4);
            } else {
              updatedData.toAmount = null;
            }
          } else {
            updatedData.toAmount = null;
          }
        }

        if (
          node.data.type === 'control' &&
          String(node.data.controlKind || '').toLowerCase() === 'schedule' &&
          (field === 'scheduleValue' || field === 'scheduleUnit')
        ) {
          const delay = resolveScheduleStartDelaySeconds(updatedData);
          if (delay !== undefined) {
            updatedData.scheduleDelaySec = String(delay);
          }
        }

        if (
          isRepeatGroupNode(node) &&
          (field === 'loopIntervalValue' || field === 'loopIntervalUnit')
        ) {
          const sec = resolveLoopIntervalSeconds(updatedData);
          if (sec !== undefined) {
            updatedData.loopIntervalSec = String(sec);
          }
        }

        if (node.data.type === 'withdraw' && field === 'amount') {
          updatedData.amountSource = value.trim() ? 'fixed' : (
            updatedData.linkedFromNodeId ? 'output' : 'fixed'
          );
        }
        
        return { ...node, data: updatedData };
      }
      return node;
    });

      const edited = next.find((n) => n.id === nodeId);
      if (edited?.data?.type === 'swap' && ['amount', 'coin', 'toCoin'].includes(field)) {
        next = syncLinkedWithdrawFromSwap(next, edges, nodeId);
      }
      return next;
    });
  }, [setNodes, edges]);
  
  const onDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => {
      const childIds = nds.filter((node) => node.parentId === nodeId).map((node) => node.id);
      const removeIds = new Set([nodeId, ...childIds]);
      setEdges((eds) => eds.filter(
        (edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target)
      ));
      return syncRepeatState(nds.filter((node) => !removeIds.has(node.id)));
    });
    setNodeContextMenu((current) => (current?.nodeId === nodeId ? null : current));
  }, [setNodes, setEdges, syncRepeatState]);

  const onDuplicateNode = useCallback((nodeId: string) => {
    setNodes((nds) => {
      const source = nds.find((node) => node.id === nodeId);
      if (!source) return nds;

      const blockType = (source.data.type as string) || "block";
      const duplicate: Node = {
        ...source,
        id: `${blockType}-${Date.now()}`,
        position: {
          x: source.position.x + 48,
          y: source.position.y + 48,
        },
        data: { ...source.data },
        style: source.style ? { ...source.style } : source.style,
        selected: true,
      };

      return [
        ...nds.map((node) => ({ ...node, selected: false })),
        duplicate,
      ];
    });
  }, [setNodes]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeContextMenu({
      nodeId: node.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    setNodeContextMenu(null);
  }, []);

  const onCanvasContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
  }, []);
  
  const onExecuteStrategy = useCallback(async () => {
    console.log('Executing strategy with nodes:', nodes);

    const depositNode  = nodes.find(n => n.data.type === 'deposit');
    const strategyNode = nodes.find(n => n.data.type === 'strategy');
    const swapNode     = nodes.find(n => n.data.type === 'swap');
    const withdrawNode = nodes.find(n => n.data.type === 'withdraw');

    if (!depositNode)  { showAppToast('Add a Deposit node with a coin and amount first.', 'error'); return; }
    if (!strategyNode) { showAppToast('Add a Strategy node first.', 'error'); return; }

    const strategyKind = normalizeStrategyKind(strategyNode.data.strategy as string);
    const strategyFields = {
      strategy: strategyKind,
      side: (strategyNode.data.side as string) || defaultSideForKind(strategyKind),
      priceGoal: strategyNode.data.priceGoal as string,
      rangeLow: strategyNode.data.rangeLow as string,
      rangeHigh: strategyNode.data.rangeHigh as string,
      gridLevels: strategyNode.data.gridLevels as string,
      sliceCount: strategyNode.data.sliceCount as string,
      intervalSeconds: strategyNode.data.intervalSeconds as string,
      intervals: strategyNode.data.intervals as string,
      maxSlippageBps: strategyNode.data.maxSlippageBps as string,
    };

    const assetIn   = (depositNode.data.coin  as string || 'ETH').toUpperCase();
    const amountStr = (depositNode.data.amount as string || '0');
    const amount    = parseFloat(amountStr);
    const assetOut  = (swapNode?.data.toCoin as string || withdrawNode?.data.coin as string || assetIn).toUpperCase();

    // Parse strategy mode and custom condition tree
    const useTree = strategyKind === 'Limit Order' || strategyNode.data.useTree === 'true';
    let conditionTree = null;

    if (useTree) {
      const rawTree = resolveLimitOrderConditionTree(
        strategyNode.data.conditionTree as string,
        strategyNode.data.priceGoal as string,
        strategyNode.data.side as string
      );
      const treeValidation = validatePriceConditionTreeRaw(rawTree);
      if (!treeValidation.valid) {
        showAppToast(treeValidation.error ?? 'Please build your Limit Order price conditions.', 'error');
        return;
      }
      try {
        conditionTree = JSON.parse(rawTree!);
      } catch {
        showAppToast('Invalid price condition tree.', 'error'); return;
      }
    } else {
      const validation = validateStrategyFields(strategyKind, strategyFields);
      if (!validation.valid) { showAppToast(validation.error ?? 'Strategy parameters are incomplete.', 'error'); return; }
    }

    const recipient = (withdrawNode?.data.wallet as string || '').trim();
    const toChain = chainLabelToId(withdrawNode?.data.chain as string);
    const payloadBounds = buildStrategyPayload(strategyKind, strategyFields);

    if (!amount || amount <= 0) { showAppToast('Deposit node needs a valid amount.', 'error'); return; }
    if (!recipient) { showAppToast('Withdraw node needs a recipient wallet address.', 'error'); return; }

    // Validate recipient address against destination chain format
    const validationError = validateRecipientAddress(recipient, toChain);
    if (validationError) {
      showAppToast(`Recipient address validation failed: ${validationError}`, 'error');
      return;
    }

    // Token config for ZK proof generation — sourced from the active network registry.
    const CHAIN_ID = getSelectedChainId();
    const chainTokens = getTokens(CHAIN_ID);
    const TOKEN_CONFIG: Record<string, TokenInfo> = {
      ETH:  { symbol: 'ETH',  decimals: 18, address: chainTokens.ETH.address },
      USDC: { symbol: 'USDC', decimals: 6,  address: chainTokens.USDC.address },
      // Legacy inactive assets; not part of the core Base mainnet loop.
      WBTC: { symbol: 'WBTC', decimals: 8,  address: '0x92f3B59a79bFf5dc60c0d59eA13a44D082B2bdFC' },
      USDT: { symbol: 'USDT', decimals: 6,  address: '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0' },
    };
    const token = TOKEN_CONFIG[assetIn];
    if (!token) { showAppToast(`Unsupported asset: ${assetIn}`, 'error'); return; }

    showAppToast(`Generating ZK proof for ${amountStr} ${assetIn}...`, 'info', 5000);
    console.log('[Strategy] Generating ZK proof...');

    const zkResult = await generateZKData(CHAIN_ID, token, amountStr, getZkWithdrawRecipient(CHAIN_ID));
    if ('error' in zkResult) {
      showAppToast(`ZK proof failed: ${zkResult.error}`, 'error');
      return;
    }

    const txData = zkResult.withdrawalTxData;
    const zkProof = {
      stateRoot:     txData.stateRoot,
      nullifierHash: txData.nullifierHash,
      newCommitment: txData.newCommitment,
      pA: txData.pA,
      pB: txData.pB,
      pC: txData.pC,
    };

    console.log('[Strategy] ZK proof generated:', { stateRoot: txData.stateRoot, nullifierHash: txData.nullifierHash });

    // Vault-mode output: for a same-chain asset-changing swap, keep the output shielded — the
    // executor re-deposits it into the asset_out vault as a private note the user withdraws
    // later, instead of sending it to an external address. Generate that note's secret now and
    // share only its precommitment with the executor.
    const outToken = TOKEN_CONFIG[assetOut];
    const isSameChainSwap = assetIn !== assetOut && String(toChain) === String(getSelectedChainId());
    let outputMode: 'vault' | 'address' = 'address';
    let outputPrecommitment: string | undefined;
    if (isSameChainSwap && outToken) {
      const out = await createVaultOutputNote(CHAIN_ID, outToken);
      outputMode = 'vault';
      outputPrecommitment = out.precommitment;
      console.log('[Strategy] Vault-output note prepared, precommitment:', outputPrecommitment);
    }

    const strategyData = {
      user_id:           recipient,
      strategy_type:     useTree ? 'CUSTOM_STRATEGY' : payloadBounds.strategy_type,
      side:              payloadBounds.side,
      asset_in:          assetIn,
      asset_out:         assetOut,
      amount,
      upper_bound:       useTree ? 0 : payloadBounds.upper_bound,
      lower_bound:       useTree ? 0 : payloadBounds.lower_bound,
      grid_levels:       payloadBounds.grid_levels,
      slices:            payloadBounds.slices,
      interval_sec:      payloadBounds.interval_sec,
      max_slippage_bps:  payloadBounds.max_slippage_bps,
      recipient_address: recipient,
      zk_proof:          zkProof,
      condition_tree:    useTree ? conditionTree : null,
      to_chain:          toChain,
      from_chain:        String(getSelectedChainId()),
      output_mode:       outputMode,
      output_precommitment: outputPrecommitment,
    };

    console.log('[Strategy] Encrypting client-side and submitting to trade-executor:', strategyData);

    const result = await submitEncryptedStrategy(strategyData, {
      onKeygen:    () => showAppToast('Generating your FHE encryption keys (one-time, ~5s)...', 'info', 5000),
      onUploadKey: () => console.log('[Strategy] Uploading FHE server key (one-time)...'),
      onUploadClientKey: () => console.log('[Strategy] Uploading client key to confidential VM...'),
      onEncrypt:   () => console.log('[Strategy] Encrypting price conditions locally...'),
    });
    if (result.success) {
      // Save the new change commitment — funds are not spent until on-chain tx confirms
      if (zkResult.newDepositKey && zkResult.newDeposit) {
        localStorage.setItem(zkResult.newDepositKey, JSON.stringify({ ...zkResult.newDeposit, spent: false }));
      }
      // Do NOT mark old deposit as spent here — scheduler marks it spent after on-chain confirmation

      // Strategy is registered with the trade-executor and runs server-side. No local FHE
      // decryption / browser authorization needed.
      const strategyId = String(result.data?.strategy_id ?? result.data?.payload_id ?? '');
      if (strategyId) {
        window.dispatchEvent(
          new CustomEvent('siphon:strategySubmitted', { detail: { strategyId, userId: recipient } }),
        );
        if (zkResult.spentDepositKey) { try { localStorage.removeItem(zkResult.spentDepositKey); } catch {} }
      }

      if (useTree) {
        showAppToast(`Composable strategy registered (ID: ${result.data?.strategy_id || result.data?.payload_id || 'ok'})`, 'success', 5000);
      } else {
        showAppToast(`${strategyKind} registered (ID: ${result.data?.strategy_id || result.data?.payload_id || 'ok'})`, 'success', 5000);
      }
    } else {
      showAppToast(`Strategy failed: ${result.error}`, 'error');
    }
  }, [nodes]);
  
  const onRestart = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setCurrentFileName('untitled.io');
    setBuilderSession(null);
    setBuilderMessages([]);
    setBuilderPrompt("");
  }, [setNodes, setEdges, setCurrentFileName]);
  
  const saveScene = useCallback((sceneName: string) => {
    const scene = {
      name: sceneName,
      nodes: nodes.map(node => ({
        ...node,
        data: node.data
      })),
      edges: edges.map(edge => ({
        ...edge,
        data: edge.data
      }))
    };
    
    const updatedScenes = [...savedScenes.filter(s => s.name !== sceneName), scene];
    setSavedScenes(updatedScenes);
    localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updatedScenes));
  }, [nodes, edges, savedScenes, setSavedScenes]);
  
  const loadScene = useCallback((sceneName: string) => {
    const scene = savedScenes.find(s => s.name === sceneName);
    if (scene) {
      // Normalize all nodes to ensure they have required properties
      const normalizedNodes = sortAndSyncRepeat(scene.nodes.map(normalizeNode));
      setNodes(normalizedNodes);
      setEdges(scene.edges);
      setCurrentFileName(`${sceneName}.io`);
    }
  }, [savedScenes, setNodes, setEdges, setCurrentFileName, normalizeNode]);
  
  const deleteScene = useCallback((sceneName: string) => {
    if (confirm(`Delete scene "${sceneName}"?`)) {
      const updatedScenes = savedScenes.filter(s => s.name !== sceneName);
      setSavedScenes(updatedScenes);
      localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updatedScenes));
    }
  }, [savedScenes, setSavedScenes]);

  const onBuilderPromptSubmit = useCallback(async (prompt: string) => {
    const userMsg: BuildChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    const chatHistory = [
      ...builderMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: prompt },
    ];
    setBuilderMessages((prev) => [...prev, userMsg]);
    setIsBuilderAgentLoading(true);
    try {
      const result = await processBuilderTurn(
        prompt,
        builderSession,
        nodes,
        edges,
        chatHistory,
        { ethUsd }
      );
      setNodes(result.nodes);
      setEdges(result.edges);
      setBuilderSession(result.session);
      if (result.botMessage) {
        const botMessage = result.botMessage;
        setBuilderMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: botMessage,
          },
        ]);
      }
      setBuilderPrompt("");
      setNodeContextMenu(null);
    } finally {
      setIsBuilderAgentLoading(false);
    }
  }, [builderSession, builderMessages, nodes, edges, ethUsd, setNodes, setEdges]);

  const buildStrategyName = useMemo(
    () => currentFileName.replace(/\.io$/i, '') || 'untitled',
    [currentFileName]
  );

  const getStrategyDescription = useCallback((strategyNodes: Node[]) => {
    const nodeTypes = strategyNodes.map((n) => n.data.type);
    const hasDeposit = nodeTypes.includes('deposit');
    const hasSwap = nodeTypes.includes('swap');
    const hasWithdraw = nodeTypes.includes('withdraw');
    const hasStrategy = nodeTypes.includes('strategy');

    const parts: string[] = [];
    if (hasDeposit) parts.push('Deposit');
    if (hasSwap) parts.push('Swap');
    if (hasStrategy) parts.push('Strategy');
    if (hasWithdraw) parts.push('Withdraw');

    if (parts.length === 0) return 'Empty strategy';
    if (parts.length === 1) return `${parts[0]} operation`;
    if (parts.length === 2) return `${parts[0]} -> ${parts[1]}`;
    return `${parts[0]} -> ${parts.slice(1, -1).join(' -> ')} -> ${parts[parts.length - 1]}`;
  }, []);

  const buildRunStrategyMeta = useMemo((): StrategyMetadata => ({
    name: buildStrategyName,
    author: 'You',
    nodes: getModalStepNodes(nodes, edges).length,
    usage: 0,
    profit: '+0.00%',
    description: getStrategyDescription(nodes),
    category: 'custom',
    chains: ['base'],
    networks: ['Base'],
    activeNetworks: ['Base'],
    isActive: true,
  }), [buildStrategyName, nodes, edges, getStrategyDescription]);

  const openRunModal = useCallback(() => {
    const synced = sortAndSyncRepeat(nodes.map(normalizeNode));
    setRunModalNodes(formatGraphForPreview(synced));
    setRunModalEdges(edges);
    setRunFlowKey((k) => k + 1);
    setIsRunMode(true);
    setRunModeValues(buildRunModeValuesFromNodes(synced));
    setShowRunModal(true);
  }, [nodes, edges, normalizeNode]);
  
  return (
    <div className={`blueprint-view blueprint-view--fullscreen ${isLoaded ? 'loaded' : ''} ${widgetsVisible ? 'blueprint-view--dash-front' : ''} ${chatFocus ? 'blueprint-view--chat-active' : ''}`}>
      <ReactFlowProvider>
        <div className="blueprint-workspace">
          <BuildNav
            nodes={nodes}
            currentFileName={currentFileName}
            savedScenes={savedScenes}
            onAddNode={onAddNode}
            onSaveScene={saveScene}
            onLoadScene={loadScene}
            onDeleteScene={deleteScene}
            onRestart={onRestart}
            onSimulate={() => void runSimulation()}
            isSimulating={isSimulating}
            onOpenRun={openRunModal}
            setCurrentFileName={setCurrentFileName}
            expandedToolbar={chatFocus && !widgetsVisible}
          />

          {simToast && (
            <BuildSimToast
              message={simToast.message}
              type={simToast.type}
              exiting={simExiting}
              onDismiss={dismissToast}
            />
          )}

          <div className="blueprint-stage">
            <div className="blueprint-canvas" onContextMenu={onCanvasContextMenu}>
            <BlueprintFlow
              setNodes={setNodes}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeContextMenu={onNodeContextMenu}
              onPaneContextMenu={onPaneContextMenu}
              onPaneClick={() => setNodeContextMenu(null)}
              onMoveStart={() => setNodeContextMenu(null)}
              onNodesDelete={(nodesToDelete) => {
                nodesToDelete.forEach((node) => onDeleteNode(node.id));
              }}
              updateNodeData={updateNodeData}
              tokens={tokens}
              isTokenActive={isTokenActive}
              simHighlight={simHighlight}
              simShakingId={simShakingId}
              simExiting={simExiting}
            />
            </div>

            <RunningStrategiesProvider runningStrategies={runningStrategies ?? new Map()}>
            <DashboardCustomizeProvider>
            <div
              ref={pageLayoutRef}
              className={`build-page-layout ${chatFocus && !widgetsVisible ? "build-page-layout--focus" : ""}`}
            >
              <div className="build-page-content">
                <div className="build-hero-band">
                  <BuildAiPrompt
                    value={builderPrompt}
                    onChange={setBuilderPrompt}
                    onSubmit={onBuilderPromptSubmit}
                    isLoading={isBuilderAgentLoading}
                    messages={builderMessages}
                    onChatActiveChange={handleChatActiveChange}
                    widgetsVisible={widgetsVisible}
                    onToggleWidgets={handleToggleWidgets}
                  />
                </div>

                <div
                  className={`build-widget-band${widgetsVisible ? "" : " build-widget-band--hidden"}`}
                  aria-hidden={!widgetsVisible}
                >
                  <BuildWidgetSection />
                </div>
              </div>
            </div>
            </DashboardCustomizeProvider>
            </RunningStrategiesProvider>

            {widgetsVisible && <BuildPageFooter />}

            {nodeContextMenu && (
              <BuildNodeContextMenu
                x={nodeContextMenu.x}
                y={nodeContextMenu.y}
                nodeLabel={nodes.find((node) => node.id === nodeContextMenu.nodeId)?.data.label as string | undefined}
                onDelete={() => onDeleteNode(nodeContextMenu.nodeId)}
                onDuplicate={() => onDuplicateNode(nodeContextMenu.nodeId)}
                onClose={() => setNodeContextMenu(null)}
              />
            )}
          </div>
        </div>
      </ReactFlowProvider>

      {showRunModal && (
        <DetailsModal
          selectedStrategy={buildRunStrategyMeta}
          isOpen={showRunModal}
          onClose={() => {
            setShowRunModal(false);
            setIsRunMode(false);
            setRunModeValues({});
          }}
          isRunMode={isRunMode}
          setIsRunMode={setIsRunMode}
          modalStrategyNodes={runModalNodes}
          modalStrategyEdges={runModalEdges}
          runModeValues={runModeValues}
          setRunModeValues={setRunModeValues}
          runDuration={runDuration}
          setRunDuration={setRunDuration}
          isFading={isFading}
          setIsFading={setIsFading}
          flowKey={runFlowKey}
          isFlowLoading={false}
          runningStrategies={runningStrategies}
          setRunningStrategies={setRunningStrategies}
          setNodes={setNodes}
          setEdges={setEdges}
          setViewMode={(mode) => setViewMode?.(mode)}
          setCurrentFileName={setCurrentFileName}
          savedScenes={savedScenes}
          setSavedScenes={setSavedScenes}
          setShowSuccessNotification={setShowSuccessNotification}
          fromBuilder
        />
      )}
    </div>
  );
}

