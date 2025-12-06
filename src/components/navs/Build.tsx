"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  Handle, 
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import "./Build.css";

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
  const [showSubmenu, setShowSubmenu] = useState<{ type: 'deposit' | 'withdraw' | 'swap' | 'strategy'; x: number; y: number } | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sceneName, setSceneName] = useState('');
  const [showSavedScenesDropdown, setShowSavedScenesDropdown] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [selectedAddType, setSelectedAddType] = useState<'deposit' | 'withdraw' | 'swap' | 'strategy' | null>(null);
  
  const submenuRef = useRef<HTMLDivElement>(null);
  const addDropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(event.target as HTMLElement)) {
        setShowAddDropdown(false);
      }
    };

    if (showAddDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddDropdown]);
  
  const chains = ['Solana', 'Zcash', 'Bitcoin', 'XMR', 'Ethereum'];
  const dexes = ['Raydium', 'Jupiter', 'Orca', 'Serum', 'Meteora', 'Uniswap'];
  const tokens = ['SOL', 'USDC', 'USDT', 'WBTC', 'XMR'];
  
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
      sourcePosition: Position.Right,
      targetPosition: Position.Left
    };
    
    setNodes((nds) => [...nds, newNode]);
    setShowSubmenu(null);
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
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (submenuRef.current && event.target instanceof Element && !submenuRef.current.contains(event.target)) {
        setShowSubmenu(null);
      }
    };
    
    if (showSubmenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSubmenu]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target && !target.closest('.blueprint-saved-scenes')) {
        setShowSavedScenesDropdown(false);
      }
    };
    
    if (showSavedScenesDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSavedScenesDropdown]);
  
  const onActionClick = useCallback((type: 'deposit' | 'withdraw' | 'swap' | 'strategy', event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const blueprintView = event.currentTarget.closest('.blueprint-view');
    if (blueprintView) {
      const viewRect = blueprintView.getBoundingClientRect();
      setShowSubmenu({
        type,
        x: rect.left - viewRect.left,
        y: rect.top - viewRect.top + rect.height + 4
      });
    }
  }, []);
  
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
  
  const saveScene = useCallback(() => {
    if (!sceneName.trim()) {
      alert('Please enter a scene name');
      return;
    }
    
    const scene = {
      name: sceneName.trim(),
      nodes: nodes.map(node => ({
        ...node,
        data: node.data
      })),
      edges: edges.map(edge => ({
        ...edge,
        data: edge.data
      }))
    };
    
    const updatedScenes = [...savedScenes.filter(s => s.name !== sceneName.trim()), scene];
    setSavedScenes(updatedScenes);
    localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updatedScenes));
    setCurrentFileName(`${sceneName.trim()}.io`);
    setShowSaveDialog(false);
    setSceneName('');
    
    // Show success animation
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 1500);
  }, [sceneName, nodes, edges, savedScenes, setSavedScenes, setCurrentFileName]);
  
  const loadScene = useCallback((sceneName: string) => {
    const scene = savedScenes.find(s => s.name === sceneName);
    if (scene) {
      setNodes(scene.nodes);
      setEdges(scene.edges);
      setCurrentFileName(`${sceneName}.io`);
      setShowSavedScenesDropdown(false);
    }
  }, [savedScenes, setNodes, setEdges, setCurrentFileName]);
  
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
        <div className="blueprint-top-bar">
          <div className="blueprint-actions">
            <div className="blueprint-saved-scenes desktop-only" style={{ position: 'relative' }}>
              <button 
                className="blueprint-icon-btn"
                onClick={() => setShowSavedScenesDropdown(!showSavedScenesDropdown)}
                title="Saved Scenes"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              {showSavedScenesDropdown && (
                <div className="blueprint-scenes-dropdown">
                  {savedScenes.length === 0 ? (
                    <div className="blueprint-scenes-empty">No saved scenes</div>
                  ) : (
                    savedScenes.map((scene) => (
                      <div key={scene.name} className="blueprint-scene-item">
                        <button
                          className="blueprint-scene-load"
                          onClick={() => loadScene(scene.name)}
                        >
                          {scene.name}
                        </button>
                        <button
                          className="blueprint-scene-delete"
                          onClick={() => deleteScene(scene.name)}
                          title="Delete scene"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            {/* Mobile: Open button */}
            <button 
              className="blueprint-icon-btn mobile-only"
              onClick={() => setShowOpenModal(true)}
              title="Open Scene"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button 
              className={`blueprint-icon-btn ${saveSuccess ? 'save-success' : ''}`}
              onClick={() => setShowSaveDialog(true)}
              disabled={nodes.length === 0 || saveSuccess}
              title="Save Scene"
            >
              {saveSuccess ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="checkmark-icon">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              )}
            </button>
            <span className="blueprint-file-name">{currentFileName}</span>
            <span className="blueprint-actions-label desktop-only" style={{ marginLeft: '1rem' }}>Add:</span>
            <div className="blueprint-actions-buttons desktop-only">
              <button 
                className="blueprint-action-btn"
                onClick={(e) => onActionClick('deposit', e)}
              >
                Deposit
              </button>
              <button 
                className="blueprint-action-btn"
                onClick={(e) => onActionClick('swap', e)}
              >
                Swap
              </button>
              <button 
                className="blueprint-action-btn"
                onClick={(e) => onActionClick('withdraw', e)}
              >
                Withdraw
              </button>
              <button 
                className="blueprint-action-btn"
                onClick={(e) => onActionClick('strategy', e)}
              >
                Strategies
              </button>
            </div>
            <button 
              className="blueprint-restart-btn"
              onClick={onRestart}
              disabled={nodes.length === 0}
              title="Clear canvas"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
            <button 
              className="blueprint-execute-btn desktop-only"
              onClick={onExecuteStrategy}
              disabled={nodes.length === 0}
            >
              Test Strategy
            </button>
            {/* Mobile: Plus button - opens fullscreen modal (last on mobile) */}
            <button 
              className="blueprint-icon-btn mobile-only"
              onClick={() => setShowAddModal(true)}
              title="Add Node"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>
        
        {showSubmenu && (
          <div 
            ref={submenuRef}
            className="blueprint-submenu"
            style={{
              left: `${showSubmenu.x}px`,
              top: `${showSubmenu.y}px`
            }}
          >
            <div className="blueprint-submenu-header">
              {showSubmenu.type === 'deposit' 
                ? 'Deposit from:' 
                : showSubmenu.type === 'withdraw'
                ? 'Withdraw to:'
                : showSubmenu.type === 'swap'
                ? 'Swap on:'
                : 'Strategy:'}
            </div>
            {showSubmenu.type === 'strategy' ? (
              ['Buy Dip', 'Sell Rally', 'DCA'].map((strategy) => (
                <button
                  key={strategy}
                  className="blueprint-submenu-item"
                  onClick={() => onAddNode(showSubmenu.type, strategy)}
                >
                  {strategy}
                </button>
              ))
            ) : (showSubmenu.type === 'swap' ? dexes : chains).map((item) => (
              <button
                key={item}
                className="blueprint-submenu-item"
                onClick={() => onAddNode(showSubmenu.type, item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {showSaveDialog && (
          <div className="blueprint-save-dialog-overlay" onClick={() => {
            setShowSaveDialog(false);
            setSceneName('');
          }}>
            <div className="blueprint-save-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="blueprint-save-dialog-header">
                <h3>Save Scene</h3>
                <button 
                  className="blueprint-save-dialog-close"
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSceneName('');
                  }}
                >
                  ×
                </button>
              </div>
              <div className="blueprint-save-dialog-content">
                <input
                  type="text"
                  className="blueprint-save-dialog-input"
                  placeholder="Enter scene name"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveScene();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="blueprint-save-dialog-actions">
                <button 
                  className="blueprint-save-dialog-cancel"
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSceneName('');
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="blueprint-save-dialog-save"
                  onClick={saveScene}
                  disabled={!sceneName.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile: Add Node Fullscreen Modal */}
        {showAddModal && (
          <div className="blueprint-mobile-modal-overlay" onClick={() => {
            setShowAddModal(false);
            setSelectedAddType(null);
          }}>
            <div className="blueprint-mobile-modal" onClick={(e) => e.stopPropagation()}>
              <div className="blueprint-mobile-modal-header">
                <h3>{selectedAddType ? (
                  selectedAddType === 'deposit' ? 'Deposit from:' :
                  selectedAddType === 'withdraw' ? 'Withdraw to:' :
                  selectedAddType === 'swap' ? 'Swap on:' :
                  'Strategy:'
                ) : 'Add Node'}</h3>
                <button 
                  className="blueprint-mobile-modal-close"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedAddType(null);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="blueprint-mobile-modal-content">
                {!selectedAddType ? (
                  <>
                    <button 
                      className="blueprint-mobile-modal-btn"
                      onClick={() => setSelectedAddType('deposit')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Deposit</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    <button 
                      className="blueprint-mobile-modal-btn"
                      onClick={() => setSelectedAddType('swap')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />
                      </svg>
                      <span>Swap</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    <button 
                      className="blueprint-mobile-modal-btn"
                      onClick={() => setSelectedAddType('withdraw')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>Withdraw</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    <button 
                      className="blueprint-mobile-modal-btn"
                      onClick={() => setSelectedAddType('strategy')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                      <span>Strategies</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      className="blueprint-mobile-modal-back-btn"
                      onClick={() => setSelectedAddType(null)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      <span>Back</span>
                    </button>
                    {selectedAddType === 'strategy' ? (
                      ['Buy Dip', 'Sell Rally', 'DCA'].map((strategy) => (
                        <button
                          key={strategy}
                          className="blueprint-mobile-modal-btn"
                          onClick={() => {
                            onAddNode(selectedAddType, strategy);
                            setShowAddModal(false);
                            setSelectedAddType(null);
                          }}
                        >
                          <span>{strategy}</span>
                        </button>
                      ))
                    ) : selectedAddType === 'swap' ? (
                      dexes.map((dex) => (
                        <button
                          key={dex}
                          className="blueprint-mobile-modal-btn"
                          onClick={() => {
                            onAddNode(selectedAddType, dex);
                            setShowAddModal(false);
                            setSelectedAddType(null);
                          }}
                        >
                          <span>{dex}</span>
                        </button>
                      ))
                    ) : (
                      chains.map((chain) => (
                        <button
                          key={chain}
                          className="blueprint-mobile-modal-btn"
                          onClick={() => {
                            onAddNode(selectedAddType, chain);
                            setShowAddModal(false);
                            setSelectedAddType(null);
                          }}
                        >
                          <span>{chain}</span>
                        </button>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mobile: Open Scene Fullscreen Modal */}
        {showOpenModal && (
          <div className="blueprint-mobile-modal-overlay" onClick={() => setShowOpenModal(false)}>
            <div className="blueprint-mobile-modal" onClick={(e) => e.stopPropagation()}>
              <div className="blueprint-mobile-modal-header">
                <h3>Open Scene</h3>
                <button 
                  className="blueprint-mobile-modal-close"
                  onClick={() => setShowOpenModal(false)}
                >
                  ×
                </button>
              </div>
              <div className="blueprint-mobile-modal-content blueprint-mobile-modal-scenes">
                {savedScenes.length === 0 ? (
                  <div className="blueprint-mobile-modal-empty">No saved scenes</div>
                ) : (
                  savedScenes.map((scene) => (
                    <button
                      key={scene.name}
                      className="blueprint-mobile-modal-scene-btn"
                      onClick={() => {
                        loadScene(scene.name);
                        setShowOpenModal(false);
                      }}
                    >
                      <span>{scene.name}</span>
                      <button
                        className="blueprint-mobile-modal-scene-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteScene(scene.name);
                        }}
                        title="Delete scene"
                      >
                        ×
                      </button>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        
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
          nodeTypes={{
            custom: ({ data, id }) => {
              const isStrategy = data.type === 'strategy';
              const CustomNode = (
                <div 
                  className={`blueprint-custom-node ${isStrategy ? 'strategy-node' : ''}`} 
                  style={{ 
                    position: 'relative',
                    background: isStrategy ? 'rgba(255, 193, 7, 0.2)' : undefined,
                    border: isStrategy ? '1px solid rgba(255, 193, 7, 0.5)' : undefined
                  }}
                >
                  <Handle type="target" position={Position.Left} style={{ background: 'rgba(255, 255, 255, 0.3)' }} />
                  <div className="node-content">
                    <div className="node-title">{data.label}</div>
                    {data.type === 'deposit' && (
                      <div className="node-inputs">
                        <div className="node-input-row">
                          <select
                            className="node-select"
                            value={data.coin || ''}
                            onChange={(e) => updateNodeData(id, 'coin', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'white'
                            }}
                          >
                            <option value="" style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>Coin</option>
                            {tokens.map(token => <option key={token} value={token} style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>{token}</option>)}
                          </select>
                          <input
                            type="number"
                            className="node-input"
                            placeholder="Amount"
                            value={data.amount || ''}
                            onChange={(e) => updateNodeData(id, 'amount', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    )}
                    {data.type === 'swap' && (
                      <div className="node-inputs">
                        <div className="node-input-row">
                          <select
                            className="node-select"
                            value={data.coin || ''}
                            onChange={(e) => updateNodeData(id, 'coin', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'white'
                            }}
                          >
                            <option value="" style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>From</option>
                            {tokens.map(token => <option key={token} value={token} style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>{token}</option>)}
                          </select>
                          <input
                            type="number"
                            className="node-input"
                            placeholder="Amount"
                            value={data.amount || ''}
                            onChange={(e) => updateNodeData(id, 'amount', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="node-input-row">
                          <select
                            className="node-select"
                            value={data.toCoin || ''}
                            onChange={(e) => updateNodeData(id, 'toCoin', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'white'
                            }}
                          >
                            <option value="" style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>To</option>
                            {tokens.map(token => <option key={token} value={token} style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>{token}</option>)}
                          </select>
                          <input
                            type="text"
                            className="node-input readonly"
                            placeholder="≈ Amount"
                            value={data.toAmount || ''}
                            readOnly
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    )}
                    {data.type === 'withdraw' && (
                      <div className="node-inputs">
                        <div className="node-input-row">
                          <select
                            className="node-select"
                            value={data.coin || ''}
                            onChange={(e) => updateNodeData(id, 'coin', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'white'
                            }}
                          >
                            <option value="" style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>Coin</option>
                            {tokens.map(token => <option key={token} value={token} style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>{token}</option>)}
                          </select>
                          <input
                            type="number"
                            className="node-input"
                            placeholder="Amount"
                            value={data.amount || ''}
                            onChange={(e) => updateNodeData(id, 'amount', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="node-input-row">
                          <input
                            type="text"
                            className="node-input wallet-input"
                            placeholder="Wallet address"
                            value={data.wallet || ''}
                            onChange={(e) => updateNodeData(id, 'wallet', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    )}
                    {data.type === 'strategy' && (data.strategy === 'Buy Dip' || data.strategy === 'Sell Rally') && (
                      <div className="node-inputs">
                        <div className="node-input-row">
                          <input
                            type="number"
                            className="node-input"
                            placeholder="Price Goal"
                            value={data.priceGoal || ''}
                            onChange={(e) => updateNodeData(id, 'priceGoal', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    )}
                    {data.type === 'strategy' && data.strategy === 'DCA' && (
                      <div className="node-inputs">
                        <div className="node-input-row">
                          <select
                            className="node-select"
                            value={data.coin || ''}
                            onChange={(e) => updateNodeData(id, 'coin', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'white'
                            }}
                          >
                            <option value="" style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>Coin</option>
                            {tokens.map(token => <option key={token} value={token} style={{ background: 'rgba(0, 0, 0, 0.9)', color: 'white' }}>{token}</option>)}
                          </select>
                          <input
                            type="number"
                            className="node-input"
                            placeholder="Amount"
                            value={data.amount || ''}
                            onChange={(e) => updateNodeData(id, 'amount', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="node-input-row">
                          <input
                            type="number"
                            className="node-input"
                            placeholder="Intervals (days)"
                            value={data.intervals || ''}
                            onChange={(e) => updateNodeData(id, 'intervals', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <Handle type="source" position={Position.Right} style={{ background: 'rgba(255, 255, 255, 0.3)' }} />
                </div>
              );
              return CustomNode;
            }
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
      </ReactFlowProvider>
    </div>
  );
}

