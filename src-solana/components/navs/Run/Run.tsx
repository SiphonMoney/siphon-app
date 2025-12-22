"use client";

import { useState, useCallback, useEffect } from "react";
import { Node, Edge } from '@xyflow/react';
import StratDetails from "@/components/navs/Run/StratDetails";
import "./Run.css";

interface RunProps {
  isLoaded?: boolean;
  savedScenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>;
  setSavedScenes: (scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }> | ((scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>) => Array<{ name: string; nodes: Node[]; edges: Edge[] }>)) => void;
  favoriteStrategies: Set<string>;
  showFavoritesOnly: boolean;
  setShowFavoritesOnly: (show: boolean) => void;
  runningStrategies: Map<string, { startTime: number; isRunning: boolean; loop: boolean }>;
  setRunningStrategies: (strategies: Map<string, { startTime: number; isRunning: boolean; loop: boolean }> | ((prev: Map<string, { startTime: number; isRunning: boolean; loop: boolean }>) => Map<string, { startTime: number; isRunning: boolean; loop: boolean }>)) => void;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  setCurrentFileName: (name: string) => void;
  setViewMode: (mode: 'blueprint' | 'run' | 'discover') => void;
}

export default function Run({
  isLoaded = true,
  savedScenes,
  setSavedScenes,
  favoriteStrategies,
  showFavoritesOnly,
  setShowFavoritesOnly,
  runningStrategies,
  setRunningStrategies,
  setNodes,
  setEdges,
  setCurrentFileName,
  setViewMode
}: RunProps) {
  const [strategyViewMode] = useState<'cards' | 'list'>('cards');
  const [selectedStrategy, setSelectedStrategy] = useState<{ name: string; nodes: Node[]; edges: Edge[] } | null>(null);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [publishedStrategies, setPublishedStrategies] = useState<Set<string>>(new Set());

  // Load published strategies from localStorage
  useEffect(() => {
    const discoverStrategiesKey = 'siphon-discover-strategies';
    const stored = localStorage.getItem(discoverStrategiesKey);
    if (stored) {
      try {
        const strategiesData = JSON.parse(stored);
        const published = new Set(Object.keys(strategiesData));
        setPublishedStrategies(published);
      } catch (error) {
        console.error('Failed to load published strategies:', error);
      }
    }
  }, []);

  const onEditStrategy = useCallback((sceneName: string) => {
    const scene = savedScenes.find(s => s.name === sceneName);
    if (scene) {
      setNodes(scene.nodes);
      setEdges(scene.edges);
      setCurrentFileName(`${sceneName}.io`);
      setViewMode('blueprint');
    }
  }, [savedScenes, setNodes, setEdges, setCurrentFileName, setViewMode]);

  const startStrategy = useCallback((sceneName: string) => {
    const newRunning = new Map(runningStrategies);
    const existing = newRunning.get(sceneName);
    newRunning.set(sceneName, { 
      startTime: Date.now(), 
      isRunning: true,
      loop: existing?.loop || false
    });
    setRunningStrategies(newRunning);
  }, [runningStrategies, setRunningStrategies]);

  const stopStrategy = useCallback((sceneName: string) => {
    const newRunning = new Map(runningStrategies);
    newRunning.delete(sceneName);
    setRunningStrategies(newRunning);
  }, [runningStrategies, setRunningStrategies]);

  const toggleLoop = useCallback((sceneName: string) => {
    const newRunning = new Map(runningStrategies);
    const existing = newRunning.get(sceneName);
    if (existing) {
      newRunning.set(sceneName, { ...existing, loop: !existing.loop });
    } else {
      newRunning.set(sceneName, { startTime: Date.now(), isRunning: false, loop: true });
    }
    setRunningStrategies(newRunning);
  }, [runningStrategies, setRunningStrategies]);

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

  const calculateExpectedInput = useCallback((scene: { nodes: Node[]; edges: Edge[] }) => {
    // Calculate expected input from deposit nodes
    const depositNode = scene.nodes.find(n => n.data.type === 'deposit');
    if (depositNode && depositNode.data.amount && depositNode.data.coin) {
      return `${depositNode.data.amount} ${depositNode.data.coin}`;
    }
    return 'N/A';
  }, []);

  const calculateEstimatedOutput = useCallback((scene: { nodes: Node[]; edges: Edge[] }) => {
    // Calculate estimated output from swap/withdraw nodes
    const swapNode = scene.nodes.find(n => n.data.type === 'swap');
    if (swapNode && swapNode.data.toAmount && swapNode.data.toCoin) {
      return `${swapNode.data.toAmount} ${swapNode.data.toCoin}`;
    }
    const withdrawNode = scene.nodes.find(n => n.data.type === 'withdraw');
    if (withdrawNode && withdrawNode.data.amount && withdrawNode.data.coin) {
      return `${withdrawNode.data.amount} ${withdrawNode.data.coin}`;
    }
    return 'N/A';
  }, []);

  const onDeleteStrategy = useCallback((sceneName: string) => {
    if (confirm(`Delete strategy "${sceneName}"?`)) {
      setSavedScenes((scenes) => {
        const updated = scenes.filter(s => s.name !== sceneName);
        localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updated));
        return updated;
      });
      // Also stop if running
      if (runningStrategies.has(sceneName)) {
        stopStrategy(sceneName);
      }
    }
  }, [setSavedScenes, runningStrategies, stopStrategy]);

  const togglePublishStrategy = useCallback((sceneName: string) => {
    const scene = savedScenes.find(s => s.name === sceneName);
    if (!scene) return;

    const discoverStrategiesKey = 'siphon-discover-strategies';
    const stored = localStorage.getItem(discoverStrategiesKey);
    let discoverStrategies: Record<string, { nodes: Node[]; edges: Edge[]; author?: string; usage?: number; profit?: string; category?: string; chains?: string[]; networks?: string[] }> = {};
    
    if (stored) {
      try {
        discoverStrategies = JSON.parse(stored);
      } catch (error) {
        console.error('Failed to load discover strategies:', error);
      }
    }

    const isCurrentlyPublished = publishedStrategies.has(sceneName);
    const newPublished = new Set(publishedStrategies);

    if (isCurrentlyPublished) {
      // Unpublish - remove from discover strategies
      delete discoverStrategies[sceneName];
      newPublished.delete(sceneName);
    } else {
      // Publish - add to discover strategies
      discoverStrategies[sceneName] = {
        nodes: scene.nodes,
        edges: scene.edges,
        author: 'You',
        usage: 0,
        profit: '+0.00%',
        category: 'Custom',
        chains: [],
        networks: []
      };
      newPublished.add(sceneName);
    }
    
    localStorage.setItem(discoverStrategiesKey, JSON.stringify(discoverStrategies));
    setPublishedStrategies(newPublished);
  }, [savedScenes, publishedStrategies]);

  return (
    <div className={`run-mode-view ${isLoaded ? 'loaded' : ''}`}>
      <div className="run-mode-header">
        <div className="run-mode-header-content">
          <div>
            <h2 className="run-mode-title">Strategies</h2>
            <p className="run-mode-subtitle">Run and monitor your saved trading strategies</p>
          </div>
          <div className="run-mode-header-right">
          
            <div className="run-mode-controls-stack">
              <button
                className={`run-mode-favorites-toggle ${showFavoritesOnly ? 'active' : ''}`}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                title={showFavoritesOnly ? 'Show all strategies' : 'Show favorites only'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
         
            </div>
          </div>
        </div>
      </div>
      <div className={`run-mode-list ${strategyViewMode === 'list' ? 'list-view' : 'cards-view'}`}>
        {savedScenes.length === 0 ? (
          <div className="run-mode-empty">
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
                if (parts.length === 2) return `${parts[0]} -> ${parts[1]}`;
                return `${parts[0]} -> ${parts.slice(1, -1).join(' -> ')} -> ${parts[parts.length - 1]}`;
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
                      </div>
                      <p className="strategy-card-description">{getStrategyDescription()}</p>
                      <div className="strategy-card-meta">
                        <div className="strategy-meta-row">
                          <span className="strategy-meta-label">Steps</span>
                          <span className="strategy-meta-value">{nodeCount} step{nodeCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="strategy-meta-row">
                          <span className="strategy-meta-label">Est. Cost</span>
                          <span className="strategy-meta-value">${cost.toFixed(4)}</span>
                        </div>
                        <div className="strategy-meta-row">
                          <span className="strategy-meta-label">Expected Input</span>
                          <span className="strategy-meta-value">{calculateExpectedInput(scene)}</span>
                        </div>
                        <div className="strategy-meta-row">
                          <span className="strategy-meta-label">Estimated Output</span>
                          <span className="strategy-meta-value">{calculateEstimatedOutput(scene)}</span>
                        </div>
                        {isLooping && (
                          <div className="strategy-meta-row">
                            <span className="strategy-meta-label">Loop</span>
                            <span className="strategy-meta-item loop-indicator">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                              </svg>
                              Enabled
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="strategy-card-actions">
                    <div className="strategy-card-actions-group">
                      <button
                        className={`strategy-publish-btn ${publishedStrategies.has(scene.name) ? 'active' : ''}`}
                        onClick={() => togglePublishStrategy(scene.name)}
                        title={publishedStrategies.has(scene.name) ? 'Make private' : 'Make public'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={publishedStrategies.has(scene.name) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                          <line x1="4" y1="22" x2="4" y2="15" />
                        </svg>
                        <span>{publishedStrategies.has(scene.name) ? 'Public' : 'Public'}</span>
                      </button>
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
                        className="strategy-details-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStrategy(scene);
                          setShowStrategyModal(true);
                        }}
                        title="More Details"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                      </button>
                      <button
                        className="strategy-delete-btn"
                        onClick={() => onDeleteStrategy(scene.name)}
                        title="Delete strategy"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
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
      
      {/* Strategy Details Modal */}
      <StratDetails
        isOpen={showStrategyModal}
        onClose={() => {
          setShowStrategyModal(false);
          setSelectedStrategy(null);
        }}
        strategy={selectedStrategy ? (() => {
          const nodeTypes = selectedStrategy.nodes.map(n => n.data.type);
          const hasDeposit = nodeTypes.includes('deposit');
          const hasSwap = nodeTypes.includes('swap');
          const hasWithdraw = nodeTypes.includes('withdraw');
          const hasStrategy = nodeTypes.includes('strategy');
          
          const parts = [];
          if (hasDeposit) parts.push('Deposit');
          if (hasSwap) parts.push('Swap');
          if (hasStrategy) parts.push('Strategy');
          if (hasWithdraw) parts.push('Withdraw');
          
          let description = 'Empty strategy';
          if (parts.length === 1) description = `${parts[0]} operation`;
          else if (parts.length === 2) description = `${parts[0]} -> ${parts[1]}`;
          else if (parts.length > 2) description = `${parts[0]} -> ${parts.slice(1, -1).join(' -> ')} -> ${parts[parts.length - 1]}`;
          
          return {
            name: selectedStrategy.name,
            nodes: selectedStrategy.nodes,
            edges: selectedStrategy.edges,
            cost: calculateStrategyCost(selectedStrategy),
            description: description
          };
        })() : null}
        onEdit={() => {
          if (selectedStrategy) {
            onEditStrategy(selectedStrategy.name);
            setShowStrategyModal(false);
            setSelectedStrategy(null);
          }
        }}
        onRun={() => {
          if (selectedStrategy) {
            startStrategy(selectedStrategy.name);
            setShowStrategyModal(false);
            setSelectedStrategy(null);
          }
        }}
        onFavorite={() => {
          if (selectedStrategy) {
            const newFavorites = new Set(favoriteStrategies);
            if (newFavorites.has(selectedStrategy.name)) {
              newFavorites.delete(selectedStrategy.name);
            } else {
              newFavorites.add(selectedStrategy.name);
            }
            // Save to localStorage
            localStorage.setItem('siphon-favorite-strategies', JSON.stringify(Array.from(newFavorites)));
            // Note: The parent component (ProSwapMode) will reload favorites on next render
            setShowStrategyModal(false);
            setSelectedStrategy(null);
          }
        }}
        isFavorite={selectedStrategy ? favoriteStrategies.has(selectedStrategy.name) : false}
      />
    </div>
  );
}


