"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, Connection, Node, Edge, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import "./ProSwapMode.css";

interface ProSwapModeProps {
  isLoaded?: boolean;
  isDemoMode?: boolean;
}

export default function ProSwapMode({
  isLoaded = true,
  isDemoMode = false
}: ProSwapModeProps) {
  const [viewMode, setViewMode] = useState<'blueprint' | 'run' | 'discover'>('blueprint');
  const [runningStrategies, setRunningStrategies] = useState<Map<string, { startTime: number; isRunning: boolean; loop: boolean }>>(new Map());
  const [strategyViewMode, setStrategyViewMode] = useState<'cards' | 'list'>('cards');
  const [showSubmenu, setShowSubmenu] = useState<{ type: 'deposit' | 'withdraw' | 'swap' | 'strategy'; x: number; y: number } | null>(null);
  const [savedScenes, setSavedScenes] = useState<Array<{ name: string; nodes: Node[]; edges: Edge[] }>>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sceneName, setSceneName] = useState('');
  const [showSavedScenesDropdown, setShowSavedScenesDropdown] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string>('untitled.io');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [discoverSearch, setDiscoverSearch] = useState<string>('');
  const [discoverSort, setDiscoverSort] = useState<string>('popular');
  const [favoriteStrategies, setFavoriteStrategies] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  
  // React Flow state
  const initialNodes: Node[] = [];
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );
  
  const chains = ['Solana', 'Zcash', 'Bitcoin', 'XMR', 'Ethereum'];
  const dexes = ['Raydium', 'Jupiter', 'Orca', 'Serum', 'Meteora', 'Uniswap'];
  const tokens = ['SOL', 'USDC', 'USDT', 'WBTC', 'XMR'];
  
  const submenuRef = useRef<HTMLDivElement>(null);
  
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
  }, [setNodes, setEdges]);

  // Load saved scenes from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('siphon-blueprint-scenes');
    if (stored) {
      try {
        const scenes = JSON.parse(stored);
        setSavedScenes(scenes);
      } catch (error) {
        console.error('Failed to load saved scenes:', error);
      }
    }
    
    // Load favorites
    const favorites = localStorage.getItem('siphon-favorite-strategies');
    if (favorites) {
      try {
        setFavoriteStrategies(new Set(JSON.parse(favorites)));
      } catch (error) {
        console.error('Failed to load favorites:', error);
      }
    }
  }, []);
  
  const toggleFavorite = useCallback((strategyName: string, strategyData?: { nodes: Node[]; edges: Edge[] }) => {
    setFavoriteStrategies((prev) => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(strategyName)) {
        newFavorites.delete(strategyName);
        // Remove from saved scenes if it was a favorite
        setSavedScenes((scenes) => {
          const filtered = scenes.filter(s => s.name !== strategyName);
          localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(filtered));
          return filtered;
        });
      } else {
        newFavorites.add(strategyName);
        // If strategy data provided, save it as a scene
        if (strategyData) {
          const favoriteScene = {
            name: strategyName,
            nodes: strategyData.nodes || [],
            edges: strategyData.edges || []
          };
          setSavedScenes((scenes) => {
            const updated = [...scenes.filter(s => s.name !== strategyName), favoriteScene];
            localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updated));
            return updated;
          });
        }
      }
      localStorage.setItem('siphon-favorite-strategies', JSON.stringify(Array.from(newFavorites)));
      return newFavorites;
    });
  }, []);
  
  const onEditStrategy = useCallback((sceneName: string) => {
    const scene = savedScenes.find(s => s.name === sceneName);
    if (scene) {
      setNodes(scene.nodes);
      setEdges(scene.edges);
      setCurrentFileName(`${sceneName}.io`);
      setViewMode('blueprint');
    }
  }, [savedScenes, setNodes, setEdges]);

  const saveScene = useCallback(() => {
    if (!sceneName.trim()) {
      alert('Please enter a scene name');
      return;
    }
    
    const scene = {
      name: sceneName.trim(),
      nodes: nodes.map(node => ({
        ...node,
        // Store all node data including position
        data: node.data
      })),
      edges: edges.map(edge => ({
        ...edge,
        // Store edge data
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
  }, [sceneName, nodes, edges, savedScenes]);

  const loadScene = useCallback((sceneName: string) => {
    const scene = savedScenes.find(s => s.name === sceneName);
    if (scene) {
      setNodes(scene.nodes);
      setEdges(scene.edges);
      setCurrentFileName(`${sceneName}.io`);
      setShowSavedScenesDropdown(false);
    }
  }, [savedScenes, setNodes, setEdges]);

  const deleteScene = useCallback((sceneName: string) => {
    if (confirm(`Delete scene "${sceneName}"?`)) {
      const updatedScenes = savedScenes.filter(s => s.name !== sceneName);
      setSavedScenes(updatedScenes);
      localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updatedScenes));
      // Stop if running
      if (runningStrategies.has(sceneName)) {
        const newRunning = new Map(runningStrategies);
        newRunning.delete(sceneName);
        setRunningStrategies(newRunning);
      }
    }
  }, [savedScenes, runningStrategies]);

  const startStrategy = useCallback((sceneName: string) => {
    const newRunning = new Map(runningStrategies);
    const existing = newRunning.get(sceneName);
    newRunning.set(sceneName, { 
      startTime: Date.now(), 
      isRunning: true,
      loop: existing?.loop || false
    });
    setRunningStrategies(newRunning);
  }, [runningStrategies]);

  const stopStrategy = useCallback((sceneName: string) => {
    const newRunning = new Map(runningStrategies);
    newRunning.delete(sceneName);
    setRunningStrategies(newRunning);
  }, [runningStrategies]);

  const toggleLoop = useCallback((sceneName: string) => {
    const newRunning = new Map(runningStrategies);
    const existing = newRunning.get(sceneName);
    if (existing) {
      newRunning.set(sceneName, { ...existing, loop: !existing.loop });
    } else {
      newRunning.set(sceneName, { startTime: Date.now(), isRunning: false, loop: true });
    }
    setRunningStrategies(newRunning);
  }, [runningStrategies]);

  const formatDuration = useCallback((startTime: number) => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }, []);

  const calculateStrategyCost = useCallback((scene: { nodes: Node[]; edges: Edge[] }) => {
    // Mock cost calculation based on nodes
    let cost = 0;
    scene.nodes.forEach(node => {
      if (node.data.type === 'deposit') cost += 0.01;
      if (node.data.type === 'swap') cost += 0.05;
      if (node.data.type === 'withdraw') cost += 0.03;
      if (node.data.type === 'strategy') cost += 0.02;
    });
    return cost;
  }, []);

  return (
    <div className="pro-mode-wrapper">
      {/* Mode Selector */}
      <div className="pro-mode-selector">
        <div className="mode-selector-container">
          <button
            className={`mode-selector-btn ${viewMode === 'blueprint' ? 'active' : ''}`}
            onClick={() => setViewMode('blueprint')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            Build
          </button>
          <button
            className={`mode-selector-btn ${viewMode === 'run' ? 'active' : ''}`}
            onClick={() => setViewMode('run')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Run
          </button>
          <button
            className={`mode-selector-btn ${viewMode === 'discover' ? 'active' : ''}`}
            onClick={() => setViewMode('discover')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            Discover
          </button>
        </div>
      </div>

      {/* Blurred Content */}
      <div className={isDemoMode ? "pro-mode-content" : "pro-mode-blur-overlay"}>
        {viewMode === 'discover' ? (
          <div className={`discover-view ${isLoaded ? 'loaded' : ''}`}>
            <div className="discover-header">
              <div>
                <h2 className="discover-title">Strategy Library</h2>
                <p className="discover-subtitle">Explore DeFi strategies created by the community</p>
              </div>
            </div>
            <div className="discover-filters-section">
              <div className="discover-categories">
                {['all', 'arbitrage', 'yield', 'trading', 'liquidity', 'defi'].map((category) => (
                  <button
                    key={category}
                    className={`discover-category-btn ${selectedCategory === category ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </button>
                ))}
              </div>
              <div className="discover-filters">
                <input
                  type="text"
                  className="discover-search"
                  placeholder="Search strategies..."
                  value={discoverSearch}
                  onChange={(e) => setDiscoverSearch(e.target.value)}
                />
                <select 
                  className="discover-sort"
                  value={discoverSort}
                  onChange={(e) => setDiscoverSort(e.target.value)}
                >
                  <option value="popular">Most Popular</option>
                  <option value="recent">Most Recent</option>
                  <option value="profitable">Most Profitable</option>
                </select>
              </div>
            </div>
            <div className="discover-grid">
              {/* Mock strategy cards - in real app these would come from API */}
              {[
                { name: 'Buy High - Sell Low', author: '0x1234...5678', nodes: 2, usage: 12, profit: '-99.9%', description: 'The ultimate contrarian strategy. Buy at peaks, sell at valleys. Maximum loss, maximum style.', category: 'trading' },
                { name: 'DCA to Oblivion', author: '0xabcd...efgh', nodes: 4, usage: 8, profit: '+0.0%', description: 'Dollar-cost average forever. Never stop buying. Never check the price. Just keep going.', category: 'trading' },
              ]
              .filter(strategy => selectedCategory === 'all' || strategy.category === selectedCategory)
              .filter(strategy => !discoverSearch || strategy.name.toLowerCase().includes(discoverSearch.toLowerCase()) || strategy.description.toLowerCase().includes(discoverSearch.toLowerCase()))
              .map((strategy, index) => {
                const isFavorite = favoriteStrategies.has(strategy.name);
                const isLiked = false; // You can add liked state if needed
                return (
                  <div key={index} className="discover-strategy-card">
                    <div className="discover-card-header">
                      <h3 className="discover-card-title">{strategy.name}</h3>
                      <div className="discover-card-stats">
                        <div className="discover-like-stat">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 10v12M2 13l5-10 5 10M13 11h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-5V11z" />
                          </svg>
                          <span className="discover-like-count">{strategy.usage}</span>
                        </div>
                        <div className="discover-card-badge">
                          {strategy.profit}
                        </div>
                      </div>
                    </div>
                    <p className="discover-card-description">{strategy.description}</p>
                    <div className="discover-card-meta">
                      <div className="discover-meta-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <span>{strategy.author}</span>
                      </div>
                      <div className="discover-meta-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        <span>{strategy.nodes} steps</span>
                      </div>
                      <div className="discover-meta-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>{strategy.usage} users</span>
                      </div>
                    </div>
                    <div className="discover-card-actions">
                      <button 
                        className="discover-card-button-icon primary"
                        onClick={() => {
                          // Load and run strategy
                          console.log('Running strategy:', strategy.name);
                        }}
                        title="Run Strategy"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </button>
                      <button 
                        className="discover-card-button-icon secondary"
                        onClick={() => {
                          // Open in builder - create mock nodes/edges for now
                          const mockNodes: Node[] = [];
                          const mockEdges: Edge[] = [];
                          toggleFavorite(strategy.name, { nodes: mockNodes, edges: mockEdges });
                          setViewMode('blueprint');
                          setNodes(mockNodes);
                          setEdges(mockEdges);
                          setCurrentFileName(`${strategy.name}.io`);
                        }}
                        title="Edit in Builder"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button 
                        className={`discover-card-button-icon favorite ${isFavorite ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(strategy.name);
                        }}
                        title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'run' ? (
          <div className={`run-mode-view ${isLoaded ? 'loaded' : ''}`}>
            <div className="run-mode-header">
              <div className="run-mode-header-content">
                <div>
                  <h2 className="run-mode-title">Strategies</h2>
                  <p className="run-mode-subtitle">Run and monitor your saved trading strategies</p>
                </div>
                <div className="run-mode-header-right">
                  <button
                    className={`run-mode-favorites-toggle ${showFavoritesOnly ? 'active' : ''}`}
                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                    title={showFavoritesOnly ? 'Show all strategies' : 'Show favorites only'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                  <div className="run-mode-view-toggle">
                  <button
                    className={`view-toggle-btn ${strategyViewMode === 'cards' ? 'active' : ''}`}
                    onClick={() => setStrategyViewMode('cards')}
                    title="Card view"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </button>
                  <button
                    className={`view-toggle-btn ${strategyViewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setStrategyViewMode('list')}
                    title="List view"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </button>
                  </div>
                </div>
              </div>
            </div>
            <div className={`run-mode-list ${strategyViewMode === 'list' ? 'list-view' : 'cards-view'}`}>
              {savedScenes.length === 0 ? (
                <div className="run-mode-empty">
                  <div className="run-mode-empty-icon">📊</div>
                  <p className="run-mode-empty-title">No strategies saved</p>
                  <p className="run-mode-empty-hint">Create and save strategies in Build mode to run them here</p>
                </div>
              ) : (
                savedScenes
                  .filter(scene => !showFavoritesOnly || favoriteStrategies.has(scene.name))
                  .map((scene) => {
                  const isRunning = runningStrategies.has(scene.name);
                  const runningData = runningStrategies.get(scene.name);
                  const cost = calculateStrategyCost(scene);
                  const nodeCount = scene.nodes.length;
                  const isLooping = runningData?.loop || false;
                  
                  // Generate brief description based on nodes
                  const getStrategyDescription = () => {
                    const nodeTypes = scene.nodes.map(n => n.data.type);
                    const hasDeposit = nodeTypes.includes('deposit');
                    const hasSwap = nodeTypes.includes('swap');
                    const hasWithdraw = nodeTypes.includes('withdraw');
                    const hasStrategy = nodeTypes.includes('strategy');
                    
                    const parts = [];
                    if (hasDeposit) parts.push('Deposit');
                    if (hasSwap) parts.push('Swap');
                    if (hasStrategy) parts.push('Strategy');
                    if (hasWithdraw) parts.push('Withdraw');
                    
                    if (parts.length === 0) return 'Empty strategy';
                    if (parts.length === 1) return `${parts[0]} operation`;
                    if (parts.length === 2) return `${parts[0]} → ${parts[1]}`;
                    return `${parts[0]} → ${parts.slice(1, -1).join(' → ')} → ${parts[parts.length - 1]}`;
                  };
                  
                  return (
                    <div key={scene.name} className={`run-mode-strategy-card ${isRunning ? 'running' : ''} ${strategyViewMode === 'list' ? 'list-item' : ''}`}>
                      {isRunning && (
                        <div className="strategy-running-indicator">
                          <span className="status-dot"></span>
                        </div>
                      )}
                      <div className="strategy-card-main">
                        <div className="strategy-card-info">
                          <div className="strategy-card-header-row">
                            <h3 className="strategy-card-title">{scene.name}</h3>
                            <div className="strategy-card-controls">
                              <button
                                className="strategy-edit-btn"
                                onClick={() => onEditStrategy(scene.name)}
                                title="Edit strategy"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                className={`strategy-loop-toggle ${isLooping ? 'active' : ''}`}
                                onClick={() => toggleLoop(scene.name)}
                                title={isLooping ? 'Disable loop' : 'Enable loop'}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="23 4 23 10 17 10" />
                                  <polyline points="1 20 1 14 7 14" />
                                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                </svg>
                              </button>
                              <div className="strategy-card-action">
                                {isRunning ? (
                                  <button
                                    className="strategy-stop-btn"
                                    onClick={() => stopStrategy(scene.name)}
                                    title="Stop strategy"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                      <rect x="6" y="6" width="12" height="12" rx="2" />
                                    </svg>
                                  </button>
                                ) : (
                                  <button
                                    className="strategy-play-btn"
                                    onClick={() => startStrategy(scene.name)}
                                    title="Start strategy"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                      <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <p className="strategy-card-description">{getStrategyDescription()}</p>
                          <div className="strategy-card-meta">
                            <span className="strategy-meta-item">{nodeCount} step{nodeCount !== 1 ? 's' : ''}</span>
                            <span className="strategy-meta-item">${cost.toFixed(4)} est. cost</span>
                            {isLooping && (
                              <span className="strategy-meta-item loop-indicator">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="23 4 23 10 17 10" />
                                  <polyline points="1 20 1 14 7 14" />
                                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                                </svg>
                                Loop
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isRunning && runningData && (
                        <div className="strategy-card-footer">
                          <div className="strategy-footer-stat">
                            <span className="strategy-footer-label">Duration</span>
                            <span className="strategy-footer-value">{formatDuration(runningData.startTime)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className={`blueprint-view ${isLoaded ? 'loaded' : ''}`}>
            <ReactFlowProvider>
              <div className="blueprint-top-bar">
                <div className="blueprint-actions">
                  <div className="blueprint-saved-scenes" style={{ position: 'relative' }}>
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
                  <span className="blueprint-actions-label" style={{ marginLeft: '1rem' }}>Add:</span>
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
                <div className="blueprint-actions-right">
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
                    className="blueprint-execute-btn"
                    onClick={onExecuteStrategy}
                    disabled={nodes.length === 0}
                  >
                    Test Strategy
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
              
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodesDelete={(nodesToDelete) => {
                  nodesToDelete.forEach((node) => onDeleteNode(node.id));
                }}
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
                fitView
                proOptions={{ hideAttribution: true }}
                deleteKeyCode="Delete"
              >
                <Background />
                <Controls />
                <MiniMap />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
        )}
      </div>


    </div>
  );
}
