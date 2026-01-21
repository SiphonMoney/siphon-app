"use client";

import { useCallback } from "react";
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
  EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import "./Build.css";
import BuildNav from "./BuildNav";
import { CustomNode } from "./BuildNodes";

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
        priceGoal: null,
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
  }, [setNodes, setEdges]);
  
  const onExecuteStrategy = useCallback(() => {
    console.log('Executing strategy with nodes:', nodes);
    // TODO: Implement strategy execution logic
  }, [nodes]);
  
  const onRestart = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setCurrentFileName('untitled.io');
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
  
  return (
    <div className={`blueprint-view ${isLoaded ? 'loaded' : ''}`}>
      <ReactFlowProvider>
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
        
        <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
          <Controls />
          <MiniMap />
        </ReactFlow>
        </div>
      </ReactFlowProvider>
    </div>
  );
}

