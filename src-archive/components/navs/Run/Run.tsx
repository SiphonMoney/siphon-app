"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Node, Edge } from '@xyflow/react';
import StratDetails from "@/components/navs/Run/StratDetails";
import { useWallet } from '@solana/wallet-adapter-react';
import { createStrategy, StrategyParams } from '@/lib/strategy';
import { payStrategyFee, calculateStrategyCost as calculateExecutionCost, getZkPoolBalance, reserveFundsForStrategy } from '@/lib/zkPoolHandler';
import StrategiesList from '@/components/navs/UserDash/StrategiesList';
import DetailsModal from '@/components/navs/Discover/DetailsModal';
import { strategyList, initializeLimitOrderStrategy } from '@/components/navs/Discover/strategies';
import type { StrategyMetadata, StrategyData } from '@/components/navs/Discover/strategies';
import "./Run.css";

// Fee recipient address (protocol treasury)
const FEE_RECIPIENT = process.env.NEXT_PUBLIC_FEE_RECIPIENT || 'DTqtRSGtGf414yvMPypCv2o1P8trwb9SJXibxLgAWYhw';

// Fetch token prices from Pyth API
async function fetchPythPrices(): Promise<Record<string, number>> {
  try {
    const response = await fetch('/api/pyth_price?coin=all');
    if (!response.ok) {
      throw new Error('Failed to fetch prices');
    }
    const data = await response.json();
    return data.prices || {};
  } catch (error) {
    console.error('[Run] Error fetching Pyth prices:', error);
    // Fallback prices
    return { 'SOL': 108.39, 'USDC': 1, 'USDT': 1, 'ETH': 3500, 'BTC': 100000 };
  }
}

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
  const wallet = useWallet();
  const [strategyViewMode] = useState<'cards' | 'list'>('cards');
  const [runSectionTab, setRunSectionTab] = useState<'alphas' | 'runs'>('alphas');
  const [selectedStrategy, setSelectedStrategy] = useState<{ name: string; nodes: Node[]; edges: Edge[] } | null>(null);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [showLimitOrderPreExecuteModal, setShowLimitOrderPreExecuteModal] = useState(false);
  const [limitOrderModalNodes, setLimitOrderModalNodes] = useState<Node[]>([]);
  const [limitOrderModalEdges, setLimitOrderModalEdges] = useState<Edge[]>([]);
  const [limitOrderFlowKey, setLimitOrderFlowKey] = useState(0);
  const [limitOrderFlowLoading, setLimitOrderFlowLoading] = useState(false);
  const [limitOrderIsRunMode, setLimitOrderIsRunMode] = useState(false);
  const [limitOrderRunModeValues, setLimitOrderRunModeValues] = useState<Record<string, Record<string, string>>>({});
  const [limitOrderRunDuration, setLimitOrderRunDuration] = useState<string>('1h');
  const [limitOrderIsFading, setLimitOrderIsFading] = useState(false);
  const [limitOrderShowSuccessNotification, setLimitOrderShowSuccessNotification] = useState(false);
  const [publishedStrategies, setPublishedStrategies] = useState<Set<string>>(new Set());

  const limitOrderMetadata = useMemo((): StrategyMetadata | null => {
    return strategyList.find((s) => s.name === 'Limit Order') ?? null;
  }, []);

  useEffect(() => {
    if (showLimitOrderPreExecuteModal && limitOrderMetadata) {
      initializeLimitOrderStrategy();
      setLimitOrderFlowLoading(true);
      const key = 'siphon-discover-strategies';
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const data = JSON.parse(stored) as Record<string, StrategyData>;
          const limitOrder = data['Limit Order'];
          if (limitOrder?.nodes?.length && limitOrder?.edges) {
            const nodes = limitOrder.nodes.map((n: Node) => ({
              ...n,
              type: n.type || 'custom',
              position: n.position || { x: 0, y: 0 },
            }));
            const edges = limitOrder.edges.map((e: Edge) => ({ ...e, type: e.type || 'smoothstep' }));
            setLimitOrderModalNodes(nodes);
            setLimitOrderModalEdges(edges);
            setLimitOrderFlowKey((k) => k + 1);
          }
        } catch {
          setLimitOrderModalNodes([]);
          setLimitOrderModalEdges([]);
        }
      }
      setTimeout(() => setLimitOrderFlowLoading(false), 200);
    } else {
      setLimitOrderModalNodes([]);
      setLimitOrderModalEdges([]);
    }
  }, [showLimitOrderPreExecuteModal, limitOrderMetadata]);

  const [executingStrategies, setExecutingStrategies] = useState<Set<string>>(new Set());
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const pricesFetchedRef = useRef(false);

  // Fetch Pyth prices on mount
  useEffect(() => {
    if (!pricesFetchedRef.current) {
      pricesFetchedRef.current = true;
      fetchPythPrices().then(prices => {
        console.log('[Run] Fetched Pyth prices:', prices);
        setTokenPrices(prices);
      });
    }
  }, []);

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

  const startStrategy = useCallback(async (sceneName: string, runDuration: string = '24h') => {
    // Find the scene
    const scene = savedScenes.find(s => s.name === sceneName);
    if (!scene) {
      alert(`Strategy "${sceneName}" not found`);
      return;
    }

    // Check wallet connection
    if (!wallet.publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    // Mark as executing
    setExecutingStrategies(prev => new Set(prev).add(sceneName));

    try {
      // Parse nodes to extract strategy parameters
      const depositNode = scene.nodes.find(n => n.data.type === 'deposit');
      const swapNode = scene.nodes.find(n => n.data.type === 'swap');
      const strategyNode = scene.nodes.find(n => n.data.type === 'strategy');

      if (!depositNode || !swapNode || !strategyNode) {
        alert('Strategy must include: Deposit → Strategy → Swap nodes');
        return;
      }

      if (!depositNode.data.coin || !depositNode.data.amount) {
        alert('Deposit node must specify coin and amount');
        return;
      }

      if (!swapNode.data.coin || !swapNode.data.toCoin) {
        alert('Swap node must specify input and output tokens');
        return;
      }

      if (!strategyNode.data.priceGoal) {
        alert('Strategy node must specify a price goal');
        return;
      }

      // Extract strategy parameters
      const assetIn = String(depositNode.data.coin);
      const assetOut = String(swapNode.data.toCoin);
      const amount = parseFloat(String(depositNode.data.amount));
      const priceGoal = parseFloat(String(strategyNode.data.priceGoal));

      console.log('[Run] Starting strategy:', sceneName);
      console.log('[Run] Parameters:', { assetIn, assetOut, amount, priceGoal });

      // Step 1: Calculate strategy execution cost
      const { totalCost } = calculateExecutionCost(runDuration);
      console.log('[Run] Execution cost:', totalCost, 'USD');

      // Step 2: Fetch current token prices from Pyth
      let currentPrices = tokenPrices;
      if (Object.keys(currentPrices).length === 0) {
        console.log('[Run] Fetching fresh Pyth prices...');
        currentPrices = await fetchPythPrices();
        setTokenPrices(currentPrices);
      }
      console.log('[Run] Current Pyth prices:', currentPrices);

      // Step 3: Check ZK pool balance (must cover fee + strategy amount)
      const zkBalance = getZkPoolBalance(assetIn);
      console.log('[Run] ZK pool balance:', zkBalance, assetIn);

      // Get current token price from Pyth for fee calculation
      const tokenPrice = currentPrices[assetIn] || 1;
      console.log(`[Run] ${assetIn} price from Pyth: $${tokenPrice}`);
      const feeInToken = totalCost / tokenPrice;

      // Total required = fee + strategy amount
      const totalRequired = feeInToken + amount;
      console.log('[Run] Total required:', totalRequired, assetIn, '(fee:', feeInToken, '+ amount:', amount, ')');

      if (zkBalance < totalRequired) {
        alert(`Insufficient ZK pool balance.\nNeed: ${totalRequired.toFixed(6)} ${assetIn} (${feeInToken.toFixed(6)} fee + ${amount} strategy)\nHave: ${zkBalance.toFixed(6)} ${assetIn}\n\nPlease deposit more funds to the ZK pool first.`);
        return;
      }

      // Step 3a: Pay execution fee from ZK pool
      console.log('[Run] Paying execution fee:', feeInToken, assetIn);
      const feeResult = await payStrategyFee(assetIn, feeInToken, FEE_RECIPIENT);

      if (!feeResult.success) {
        alert(`Fee payment failed: ${feeResult.error}`);
        console.error('[Run] Fee payment failed:', feeResult.error);
        return;
      }

      if (feeResult.skipped) {
        console.log('[Run] Fee payment skipped (below minimum threshold)');
      } else {
        console.log('[Run] Fee payment successful:', feeResult.signature);
      }
      console.log('[Run] Remaining balance:', feeResult.remainingBalance, assetIn);

      // Step 3b: Reserve strategy amount (mark UTXOs as spent)
      console.log('[Run] Reserving strategy amount:', amount, assetIn);
      const reserveResult = reserveFundsForStrategy(assetIn, amount);

      if (!reserveResult.success) {
        alert(`Failed to reserve funds: ${reserveResult.error}`);
        console.error('[Run] Reserve funds failed:', reserveResult.error);
        return;
      }
      console.log('[Run] Reserved UTXOs:', reserveResult.reservedCommitments);

      // Step 4: Create strategy via FHE + executor backend
      console.log('[Run] Creating encrypted strategy...');
      const strategyParams: StrategyParams = {
        user_id: wallet.publicKey.toBase58(),
        strategy_type: 'LIMIT_ORDER',  // FHE engine expects: LIMIT_ORDER, LIMIT_BUY_DIP, LIMIT_SELL_RALLY, BRACKET_ORDER_SHORT
        asset_in: assetIn,
        asset_out: assetOut,
        amount: amount,
        recipient_address: wallet.publicKey.toBase58(),
        price_goal: priceGoal,
      };

      const result = await createStrategy(strategyParams);

      if (result.success) {
        console.log('[Run] Strategy created:', result.data);

        // Mark as running in UI
        const newRunning = new Map(runningStrategies);
        const existing = newRunning.get(sceneName);
        newRunning.set(sceneName, {
          startTime: Date.now(),
          isRunning: true,
          loop: existing?.loop || false
        });
        setRunningStrategies(newRunning);

        alert(`Strategy "${sceneName}" started!\n\nFee paid: ${feeInToken.toFixed(6)} ${assetIn} ($${totalCost.toFixed(2)})\nStrategy ID: ${result.data?.strategy_id || 'unknown'}\n\nThe executor will monitor prices and execute when ${assetIn} reaches $${priceGoal}.`);
      } else {
        alert(`Failed to start strategy: ${result.error}`);
        console.error('[Run] Strategy creation failed:', result.error);
      }
    } catch (error) {
      console.error('[Run] Error starting strategy:', error);
      alert(`Error starting strategy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExecutingStrategies(prev => {
        const next = new Set(prev);
        next.delete(sceneName);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedScenes, wallet, runningStrategies, setRunningStrategies]);

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
          </div>
        </div>
      </div>

      <div className="run-mode-tabs">
        <button
          type="button"
          className={`run-mode-tab ${runSectionTab === 'alphas' ? 'active' : ''}`}
          onClick={() => setRunSectionTab('alphas')}
        >
          My Alphas
        </button>
        <button
          type="button"
          className={`run-mode-tab ${runSectionTab === 'runs' ? 'active' : ''}`}
          onClick={() => setRunSectionTab('runs')}
        >
          My Runs
        </button>
      </div>

      {runSectionTab === 'alphas' && (
      <div className={`run-mode-list ${strategyViewMode === 'list' ? 'list-view' : 'cards-view'}`}>
        {savedScenes.length > 0 && (
          savedScenes
            .filter(() => true)
            .map((scene) => {
              const isRunning = runningStrategies.has(scene.name);
              const isExecuting = executingStrategies.has(scene.name);
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
                      ) : isExecuting ? (
                        <button
                          className="strategy-play-btn executing"
                          disabled
                          title="Starting strategy..."
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
                            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
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
                          if (scene.name === 'Limit Order') {
                            setShowLimitOrderPreExecuteModal(true);
                          } else {
                            setSelectedStrategy(scene);
                            setShowStrategyModal(true);
                          }
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
      )}

      {runSectionTab === 'runs' && (
      <div className="run-mode-backend-strategies" style={{ marginTop: '0', padding: '0 20px' }}>
        <StrategiesList isLoaded={isLoaded} />
      </div>
      )}

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

      {showLimitOrderPreExecuteModal && limitOrderMetadata && (
        <DetailsModal
          selectedStrategy={limitOrderMetadata}
          isOpen={showLimitOrderPreExecuteModal}
          onClose={() => {
            setShowLimitOrderPreExecuteModal(false);
            setLimitOrderIsRunMode(false);
            setLimitOrderRunModeValues({});
          }}
          isRunMode={limitOrderIsRunMode}
          setIsRunMode={setLimitOrderIsRunMode}
          modalStrategyNodes={limitOrderModalNodes}
          modalStrategyEdges={limitOrderModalEdges}
          runModeValues={limitOrderRunModeValues}
          setRunModeValues={setLimitOrderRunModeValues}
          runDuration={limitOrderRunDuration}
          setRunDuration={setLimitOrderRunDuration}
          isFading={limitOrderIsFading}
          setIsFading={setLimitOrderIsFading}
          flowKey={limitOrderFlowKey}
          isFlowLoading={limitOrderFlowLoading}
          runningStrategies={runningStrategies}
          setRunningStrategies={setRunningStrategies}
          setNodes={setNodes}
          setEdges={setEdges}
          setViewMode={setViewMode}
          setCurrentFileName={setCurrentFileName}
          savedScenes={savedScenes}
          setSavedScenes={setSavedScenes}
          setShowSuccessNotification={setLimitOrderShowSuccessNotification}
        />
      )}

    </div>
  );
}


