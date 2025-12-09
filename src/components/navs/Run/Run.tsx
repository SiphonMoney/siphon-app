"use client";

import { useState, useCallback } from "react";
import { Node, Edge } from '@xyflow/react';
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
  const [strategyViewMode, setStrategyViewMode] = useState<'cards' | 'list'>('cards');

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

  const onPublishStrategy = useCallback((sceneName: string) => {
    const scene = savedScenes.find(s => s.name === sceneName);
    if (scene) {
      // Save to discover strategies (published strategies)
      const discoverStrategiesKey = 'siphon-discover-strategies';
      const stored = localStorage.getItem(discoverStrategiesKey);
      let discoverStrategies: Record<string, any> = {};
      
      if (stored) {
        try {
          discoverStrategies = JSON.parse(stored);
        } catch (error) {
          console.error('Failed to load discover strategies:', error);
        }
      }
      
      // Add to discover strategies
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
      
      localStorage.setItem(discoverStrategiesKey, JSON.stringify(discoverStrategies));
      alert(`Strategy "${sceneName}" published to Discover!`);
    }
  }, [savedScenes]);

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
                            className="strategy-publish-btn"
                            onClick={() => onPublishStrategy(scene.name)}
                            title="Publish strategy"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
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
                        <span className="strategy-meta-item">Expected Input: {calculateExpectedInput(scene)}</span>
                        <span className="strategy-meta-item">Estimated Output: {calculateEstimatedOutput(scene)}</span>
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
  );
}


