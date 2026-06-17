"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  Node,
  Edge,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import "./Build.css";
import BuildNav from "./BuildNav";
import BuildAiPrompt from "./BuildAiPrompt";
import BuildNodeContextMenu from "./BuildNodeContextMenu";
import { CustomNode } from "./BuildNodes";
import { createStrategy } from "../../../lib/strategy";
import {
  buildStrategyPayload,
  computeRangeGridLegs,
  defaultSideForKind,
  normalizeStrategyKind,
  validateStrategyFields,
} from "../../../lib/strategySpec";
import { generateZKData, type TokenInfo } from "../../../lib/zkHandler";
import { processBuilderTurn } from "../../../builder_agent";
import type { BuilderAgentSession } from "../../../builder_agent";

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
}

interface NodeContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

function BlueprintFlowViewport({ nodes }: { nodes: Node[] }) {
  const { fitView } = useReactFlow();
  const nodeStructureKey = nodes.map((node) => node.id).join("|");

  useEffect(() => {
    if (nodes.length === 0) return;

    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 200 });
    });

    return () => cancelAnimationFrame(frame);
  }, [nodeStructureKey, nodes.length, fitView]);

  return null;
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
  setSavedScenes
}: BuildProps) {
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuState | null>(null);
  const [isBuilderAgentLoading, setIsBuilderAgentLoading] = useState(false);
  const [builderSession, setBuilderSession] = useState<BuilderAgentSession | null>(null);
  const [builderBotMessage, setBuilderBotMessage] = useState<string | null>(null);
  const [builderPrompt, setBuilderPrompt] = useState("");
  const tokens = ['ETH', 'USDC', 'SOL', 'USDT', 'WBTC', 'XMR'];
  
  // Active tokens
  const activeTokens = ['ETH', 'USDC'];
  const isTokenActive = (token: string) => activeTokens.includes(token);
  
  // Normalize node to ensure it has all required properties
  const normalizeNode = useCallback((node: Node): Node => {
    return {
      ...node,
      type: node.type || 'custom',
      draggable: node.draggable !== undefined ? node.draggable : true,
      selectable: node.selectable !== undefined ? node.selectable : true,
      connectable: node.connectable !== undefined ? node.connectable : true,
      sourcePosition: node.sourcePosition || Position.Right,
      targetPosition: node.targetPosition || Position.Left,
    };
  }, []);
  
  // Normalize nodes only when loading scenes, not on every render
  // This prevents interference with React Flow's internal state management
  
  // React Flow change handlers
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, [setNodes]);
  
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, [setEdges]);
  
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );
  
  const onAddNode = useCallback((type: 'deposit' | 'withdraw' | 'swap' | 'strategy', chainOrDexOrStrategy?: string) => {
    let label = '';
    if (type === 'swap') {
      label = chainOrDexOrStrategy ? `Swap on ${chainOrDexOrStrategy}` : 'Swap';
    } else if (type === 'withdraw') {
      label = chainOrDexOrStrategy ? `Withdraw to ${chainOrDexOrStrategy}` : 'Withdraw';
    } else if (type === 'strategy') {
      label = chainOrDexOrStrategy ? chainOrDexOrStrategy : 'Strategy';
    } else {
      label = chainOrDexOrStrategy ? `Deposit from ${chainOrDexOrStrategy}` : 'Deposit';
    }
    
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: 'custom',
      position: { 
        x: Math.random() * 400 + 100, 
        y: Math.random() * 300 + 200 
      },
      data: { 
        label,
        type,
        chain: (type !== 'swap' && type !== 'strategy') ? (chainOrDexOrStrategy || null) : null,
        dex: type === 'swap' ? (chainOrDexOrStrategy || null) : null,
        strategy: type === 'strategy' ? (chainOrDexOrStrategy || null) : null,
        coin: null,
        amount: null,
        toCoin: null,
        toAmount: null,
        wallet: null,
        side: type === 'strategy' ? defaultSideForKind(normalizeStrategyKind(chainOrDexOrStrategy)) : null,
        priceGoal: null,
        rangeLow: null,
        rangeHigh: null,
        gridLevels: null,
        sliceCount: null,
        intervalSeconds: null,
        maxSlippageBps: null,
        intervals: null
      },
      style: {
        background: type === 'strategy' ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 255, 255, 0.12)',
        border: type === 'strategy' ? '1px solid rgba(255, 193, 7, 0.5)' : '1px solid rgba(255, 255, 255, 0.3)',
        color: 'white',
        borderRadius: '8px',
        padding: '0.75rem',
        minWidth: '200px',
        textAlign: 'center',
        fontFamily: 'var(--font-source-code), monospace',
        fontSize: '12px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      },
      draggable: true,
      selectable: true,
      connectable: true,
      sourcePosition: Position.Right,
      targetPosition: Position.Left
    };
    
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);
  
  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id === nodeId) {
        const updatedData = { ...node.data, [field]: value };
        
        // Calculate toAmount for swap nodes when amount, coin, or toCoin changes
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
        
        return { ...node, data: updatedData };
      }
      return node;
    }));
  }, [setNodes]);
  
  const onDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setNodeContextMenu((current) => (current?.nodeId === nodeId ? null : current));
  }, [setNodes, setEdges]);

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

    if (!depositNode)  { alert('Add a Deposit node with a coin and amount first.'); return; }
    if (!strategyNode) { alert('Add a Strategy node first.'); return; }

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

    const validation = validateStrategyFields(strategyKind, strategyFields);
    if (!validation.valid) {
      alert(validation.error ?? 'Strategy parameters are incomplete.');
      return;
    }


    const assetIn   = (depositNode.data.coin  as string || 'ETH').toUpperCase();
    const amountStr = (depositNode.data.amount as string || '0');
    const amount    = parseFloat(amountStr);
    const assetOut  = (swapNode?.data.toCoin as string || withdrawNode?.data.coin as string || assetIn).toUpperCase();
    const recipient = (withdrawNode?.data.wallet as string || '').trim();
    const payloadBounds = buildStrategyPayload(strategyKind, strategyFields);

    if (!amount || amount <= 0) { alert('Deposit node needs a valid amount.'); return; }
    if (!recipient) { alert('Withdraw node needs a recipient wallet address.'); return; }

    // Token config for ZK proof generation (Sepolia)
    const CHAIN_ID = 11155111;
    const TOKEN_CONFIG: Record<string, TokenInfo> = {
      ETH:  { symbol: 'ETH',  decimals: 18, address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
      USDC: { symbol: 'USDC', decimals: 6,  address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
      WBTC: { symbol: 'WBTC', decimals: 8,  address: '0x92f3B59a79bFf5dc60c0d59eA13a44D082B2bdFC' },
      USDT: { symbol: 'USDT', decimals: 6,  address: '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0' },
    };
    const token = TOKEN_CONFIG[assetIn];
    if (!token) { alert(`Unsupported asset: ${assetIn}`); return; }

    // Generate ZK withdrawal proof now (frontend is the only place with the secret)
    alert(`Generating ZK proof for ${amountStr} ${assetIn}... this may take a moment.`);
    console.log('[Strategy] Generating ZK proof...');

    const zkResult = await generateZKData(CHAIN_ID, token, amountStr, recipient);
    if ('error' in zkResult) {
      alert(`❌ ZK proof failed: ${zkResult.error}`);
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

    const strategyData = {
      user_id:           recipient,
      strategy_type:     payloadBounds.strategy_type,
      side:              payloadBounds.side,
      asset_in:          assetIn,
      asset_out:         assetOut,
      amount,
      upper_bound:       payloadBounds.upper_bound,
      lower_bound:       payloadBounds.lower_bound,
      grid_levels:       payloadBounds.grid_levels,
      slices:            payloadBounds.slices,
      interval_sec:      payloadBounds.interval_sec,
      max_slippage_bps:  payloadBounds.max_slippage_bps,
      recipient_address: recipient,
      zk_proof:          zkProof,
    };

    console.log('[Strategy] Submitting to payload generator:', strategyData);

    const result = await createStrategy(strategyData);
    if (result.success) {
      // Mark the deposit as spent and save the new change commitment
      if (zkResult.spentDepositKey) {
        const spent = JSON.parse(localStorage.getItem(zkResult.spentDepositKey) || '{}');
        localStorage.setItem(zkResult.spentDepositKey, JSON.stringify({ ...spent, spent: true }));
      }
      if (zkResult.newDepositKey && zkResult.newDeposit) {
        localStorage.setItem(zkResult.newDepositKey, JSON.stringify({ ...zkResult.newDeposit, spent: false }));
      }
      const triggerLabel =
        strategyKind === 'Range'
          ? `$${payloadBounds.lower_bound} – $${payloadBounds.upper_bound} (${payloadBounds.grid_levels} grid levels)`
          : payloadBounds.upper_bound > 0
            ? `$${payloadBounds.upper_bound}`
            : `$${payloadBounds.lower_bound}`;
      const rangeDetail =
        strategyKind === 'Range' && payloadBounds.grid_levels
          ? `\n\nGrid legs (buy/sell alternating):\n${computeRangeGridLegs(
              payloadBounds.lower_bound,
              payloadBounds.upper_bound,
              payloadBounds.grid_levels
            )
              .map((leg) => `  • ${leg.legType === 'LIMIT_BUY' ? 'Buy' : 'Sell'} @ $${leg.price.toFixed(2)}`)
              .join('\n')}`
          : '';
      const scheduleDetail =
        strategyKind === 'TWAP'
          ? `\n\nTWAP schedule: ${payloadBounds.slices} slices, every ${payloadBounds.interval_sec}s.`
          : strategyKind === 'DCA'
            ? `\n\nDCA schedule: recurring every ${payloadBounds.interval_sec}s.`
            : '';
      alert(`✅ ${strategyKind} registered! ID: ${result.data?.strategy_id || result.data?.payload_id || 'ok'}\n\nThe ZK proof is locked in. Your trade will execute privately when price hits ${triggerLabel}.${rangeDetail}${scheduleDetail}`);
    } else {
      alert(`❌ Strategy failed: ${result.error}`);
    }
  }, [nodes]);
  
  const onRestart = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setCurrentFileName('untitled.io');
    setBuilderSession(null);
    setBuilderBotMessage(null);
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
      const normalizedNodes = scene.nodes.map(normalizeNode);
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
    setIsBuilderAgentLoading(true);
    try {
      const result = processBuilderTurn(prompt, builderSession, nodes, edges);
      setNodes(result.nodes);
      setEdges(result.edges);
      setBuilderSession(result.session);
      setBuilderBotMessage(result.botMessage);
      setBuilderPrompt("");
      setNodeContextMenu(null);
    } finally {
      setIsBuilderAgentLoading(false);
    }
  }, [builderSession, nodes, edges, setNodes, setEdges]);
  
  return (
    <div className={`blueprint-view ${isLoaded ? 'loaded' : ''}`}>
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
            onExecuteStrategy={onExecuteStrategy}
            setCurrentFileName={setCurrentFileName}
          />

          <div className="blueprint-canvas" onContextMenu={onCanvasContextMenu}>
        <ReactFlow
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
          fitView
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          deleteKeyCode={['Backspace', 'Delete']}
          nodesDraggable={true}
          nodesConnectable={true}
          elementsSelectable={true}
          panOnDrag={true}
          panOnScroll={false}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={false}
          selectNodesOnDrag={false}
          preventScrolling={true}
          nodeTypes={{
            custom: ({ data, id }) => (
              <CustomNode 
                data={data} 
                id={id}
                updateNodeData={updateNodeData}
                tokens={tokens}
                isTokenActive={isTokenActive}
              />
            )
          }}
          defaultEdgeOptions={{
            style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 },
            type: 'smoothstep'
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <BlueprintFlowViewport nodes={nodes} />
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            style={{ width: 168, height: 112 }}
            pannable
            zoomable
            bgColor="rgba(0, 0, 0, 0.85)"
            maskColor="rgba(0, 0, 0, 0.55)"
            maskStrokeColor="rgba(255, 255, 255, 0.35)"
            nodeStrokeWidth={2}
            nodeColor={(node) => {
              switch (node.data?.type) {
                case "strategy":
                  return "rgba(255, 193, 7, 0.75)";
                case "deposit":
                  return "rgba(96, 165, 250, 0.75)";
                case "swap":
                  return "rgba(167, 139, 250, 0.75)";
                case "withdraw":
                  return "rgba(74, 222, 128, 0.75)";
                default:
                  return "rgba(255, 255, 255, 0.4)";
              }
            }}
            nodeStrokeColor="rgba(255, 255, 255, 0.55)"
          />
        </ReactFlow>

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

          <BuildAiPrompt
            value={builderPrompt}
            onChange={setBuilderPrompt}
            onSubmit={onBuilderPromptSubmit}
            isLoading={isBuilderAgentLoading}
            botMessage={builderBotMessage}
          />
        </div>
      </ReactFlowProvider>
    </div>
  );
}

