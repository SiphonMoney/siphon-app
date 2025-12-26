"use client";

import React, { useState, useEffect } from "react";
import { Node, Edge } from '@xyflow/react';
import DetailsModal from "./DetailsModal";
import "./Discover.css";
import {
  formatAmount,
  calculateExchange,
  calculateVariableCost,
  calculateFixedCost,
  getTransactionOutputForCost,
  fetchCoinPrices
} from "./price_utils";
import {
  StrategyMetadata,
  StrategyData,
  strategyList,
  featuredStrategies,
  initializeLimitOrderStrategy,
  initializeDiscoverStrategies
} from "./strategies";

interface DiscoverProps {
  isLoaded?: boolean;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  setViewMode: (mode: 'blueprint' | 'run' | 'discover') => void;
  setCurrentFileName: (name: string) => void;
  savedScenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>;
  setSavedScenes: (scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }> | ((scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>) => Array<{ name: string; nodes: Node[]; edges: Edge[] }>)) => void;
  runningStrategies?: Map<string, { startTime: number; isRunning: boolean; loop: boolean }>;
  setRunningStrategies?: (strategies: Map<string, { startTime: number; isRunning: boolean; loop: boolean }> | ((prev: Map<string, { startTime: number; isRunning: boolean; loop: boolean }>) => Map<string, { startTime: number; isRunning: boolean; loop: boolean }>)) => void;
  favoriteStrategies?: Set<string>;
  setFavoriteStrategies?: (strategies: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

export default function Discover({
  isLoaded = true,
  setNodes,
  setEdges,
  setViewMode,
  setCurrentFileName,
  savedScenes,
  setSavedScenes,
  runningStrategies,
  setRunningStrategies,
  favoriteStrategies,
  setFavoriteStrategies
}: DiscoverProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | Set<string>>('all');
  const [selectedChains] = useState<Set<string>>(new Set()); // Keep for potential future use
  const [selectedNetworks, setSelectedNetworks] = useState<Set<string>>(new Set());
  const [discoverSearch, setDiscoverSearch] = useState<string>('');
  const [discoverSort, setDiscoverSort] = useState<string>('popular');
  const [discoverViewMode, setDiscoverViewMode] = useState<'cards' | 'list'>('cards');
  const [featuredStrategyIndex, setFeaturedStrategyIndex] = useState(0);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyMetadata | null>(null);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [modalStrategyNodes, setModalStrategyNodes] = useState<Node[]>([]);
  const [modalStrategyEdges, setModalStrategyEdges] = useState<Edge[]>([]);
  const [flowKey, setFlowKey] = useState(0);
  const [isFlowLoading, setIsFlowLoading] = useState(false);
  const [isRunMode, setIsRunMode] = useState(false);
  const [runModeValues, setRunModeValues] = useState<Record<string, Record<string, string>>>({});
  const [runDuration, setRunDuration] = useState<string>('1h');
  const [coinPrices, setCoinPrices] = useState<Record<string, number>>({});
  const [isFading, setIsFading] = useState(false);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  
  // Execution time in seconds (fixed)
  const executionTime = 2;
  
  // Wrapper for calculateExchange that uses coinPrices from state
  const calculateExchangeWithPrices = (
    inputAmount: number,
    coinA: string,
    coinB: string
  ): number => {
    return calculateExchange(inputAmount, coinA, coinB, coinPrices);
  };
  
  // Fetch coin prices from Pyth Network API - only once on mount
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const prices = await fetchCoinPrices();
        if (Object.keys(prices).length > 0) {
          setCoinPrices(prices);
        } else {
          // Fallback prices
          console.warn('[Discover] Using fallback prices');
          setCoinPrices({
            'ETH': 3000,
            'USDC': 1,
            'SOL': 192,
            'BTC': 45000,
          });
        }
      } catch (error) {
        console.error('[Discover] Error fetching prices:', error);
        // Fallback prices
        console.warn('[Discover] Using fallback prices');
        setCoinPrices({
          'ETH': 3000,
          'USDC': 1,
          'SOL': 192,
          'BTC': 45000,
        });
      }
    };
    fetchPrices();
  }, []);
  
  // Log when coin prices change
  useEffect(() => {
    if (Object.keys(coinPrices).length > 0) {
      console.log('[Discover] Coin prices updated:', coinPrices);
      if (coinPrices.ETH) {
        console.log('[Discover] ✓ Ethereum price available:', coinPrices.ETH, 'USD');
      } else {
        console.warn('[Discover] ⚠ Ethereum price not available');
      }
    }
  }, [coinPrices]);
  
  // Calculate costs using utility functions
  const transactionOutputUSD = getTransactionOutputForCost(
    modalStrategyNodes,
    runModeValues,
    coinPrices,
    calculateExchangeWithPrices
  );
  const variableCost = calculateVariableCost(runDuration);
  const fixedCost = calculateFixedCost(transactionOutputUSD);
  const totalCost = variableCost + fixedCost;
  
  // Initialize Limit Order strategy in localStorage
  useEffect(() => {
    initializeLimitOrderStrategy();
  }, []);
  
  // Load strategy nodes when modal opens
  useEffect(() => {
    if (showStrategyModal && selectedStrategy) {
      setIsFlowLoading(true);
      const discoverStrategiesKey = 'siphon-discover-strategies';
      const stored = localStorage.getItem(discoverStrategiesKey);
      if (stored) {
        try {
          const strategiesData = JSON.parse(stored) as Record<string, StrategyData>;
          const strategyData = strategiesData[selectedStrategy.name];
          if (strategyData && strategyData.nodes && strategyData.edges) {
            // Ensure nodes have proper structure
            const formattedNodes = strategyData.nodes.map((node: Node) => ({
              ...node,
              type: node.type || 'custom',
              position: node.position || { x: 0, y: 0 }
            }));
            const formattedEdges = strategyData.edges.map((edge: Edge) => ({
              ...edge,
              type: edge.type || 'smoothstep'
            }));
            setModalStrategyNodes(formattedNodes);
            setModalStrategyEdges(formattedEdges);
            setFlowKey(prev => prev + 1); // Force React Flow to re-render
            console.log('Loaded strategy nodes:', formattedNodes.length, 'edges:', formattedEdges.length);
          } else {
            // If no data found, clear the nodes
            setModalStrategyNodes([]);
            setModalStrategyEdges([]);
          }
        } catch (error) {
          console.error('Failed to load strategy data:', error);
          setModalStrategyNodes([]);
          setModalStrategyEdges([]);
        }
      } else {
        setModalStrategyNodes([]);
        setModalStrategyEdges([]);
      }
      // Small delay to ensure React Flow initializes properly
      setTimeout(() => {
        setIsFlowLoading(false);
      }, 200);
    } else {
      setModalStrategyNodes([]);
      setModalStrategyEdges([]);
      setIsFlowLoading(false);
    }
  }, [showStrategyModal, selectedStrategy]);
  
  
  // Auto-rotate featured strategies
  useEffect(() => {
    const interval = setInterval(() => {
      setFeaturedStrategyIndex((prev) => (prev + 1) % featuredStrategies.length);
    }, 5000); // Change every 5 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // Initialize discover strategies with node data
  useEffect(() => {
    initializeDiscoverStrategies();
    
    // Load favorites
    const favorites = localStorage.getItem('siphon-favorite-strategies');
    if (favorites && setFavoriteStrategies) {
      try {
        setFavoriteStrategies(new Set(JSON.parse(favorites)));
      } catch (error) {
        console.error('Failed to load favorites:', error);
      }
    }
  }, [setFavoriteStrategies]);

  return (
    <div className={`discover-view ${isLoaded ? 'loaded' : ''}`}>
      <div className="discover-content-wrapper">
        <div className="discover-left-content">
          {/* Mobile: Featured section first */}
          <div className="discover-featured-section-mobile">
            <div className="discover-strategy-of-week">
              <div className="strategy-slider-container">
                <div className="strategy-slider-wrapper">
                  <div 
                    className="strategy-slider-track"
                    style={{ transform: `translateX(-${featuredStrategyIndex * 100}%)` }}
                  >
                    {featuredStrategies.map((strategy, index) => {
                      // const isLiked = likedStrategies.has(strategy.title); // Removed unused variable
                      return (
                        <div key={index} className="strategy-slide">
                          <div className="strategy-of-week-content">
                            <h3 className="strategy-of-week-title">{strategy.title}</h3>
                            <p className="strategy-of-week-description">{strategy.description}</p>
                            <div className="strategy-of-week-stats">
                              <div className="strategy-of-week-stat">
                                <span className="stat-label">APY</span>
                                <span className="stat-value">{strategy.stats.apy}</span>
                              </div>
                              <div className="strategy-of-week-stat">
                                <span className="stat-label">Users</span>
                                <span className="stat-value">{strategy.stats.users}</span>
                              </div>
                              <div className="strategy-of-week-stat">
                                <span className="stat-label">Risk</span>
                                <span className="stat-value">{strategy.stats.risk}</span>
                              </div>
                            </div>
                            <div className="strategy-of-week-networks">
                              {strategy.networks.map((network, netIndex) => (
                                <span key={netIndex} className="network-tag">{network}</span>
                              ))}
                            </div>
                          </div>
                          <span className="strategy-of-week-badge">{strategy.badge}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Hero text - moved higher, right after featured card */}
            <div className="discover-header">
              <h2 className="discover-title">Strategy Library</h2>
              <p className="discover-subtitle">Explore DeFi strategies created by the community</p>
            </div>
          </div>

          {/* Desktop layout */}
          <div className="discover-top-section">
            <div className="discover-left-block">
              <div className="discover-header">
                <h2 className="discover-title">Strategy Library</h2>
                <p className="discover-subtitle">Explore DeFi strategies created by the community</p>
              </div>
              <div className="discover-filters-section">
                <div className="discover-categories">
                  {['all', 'arbitrage', 'yield', 'trading', 'liquidity', 'defi'].map((category) => {
                    const isSelected = selectedCategory === category || (typeof selectedCategory === 'object' && selectedCategory instanceof Set && selectedCategory.has(category));
                    return (
                      <button
                        key={category}
                        className={`discover-category-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          if (category === 'all') {
                            setSelectedCategory('all');
                          } else {
                            const currentCategories: Set<string> = typeof selectedCategory === 'object' && selectedCategory instanceof Set 
                              ? new Set<string>(selectedCategory) 
                              : selectedCategory === 'all' 
                                ? new Set<string>() 
                                : new Set<string>([selectedCategory]);
                            
                            if (currentCategories.has(category)) {
                              currentCategories.delete(category);
                              if (currentCategories.size === 0) {
                                setSelectedCategory('all');
                              } else {
                                setSelectedCategory(currentCategories);
                              }
                            } else {
                              currentCategories.add(category);
                              setSelectedCategory(currentCategories);
                            }
                          }
                        }}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </button>
                    );
                  })}
                </div>
                <div className="discover-networks">
                  {['Solana', 'Ethereum', 'Base', 'Bitcoin', 'Polygon', 'Arbitrum'].map((network) => (
                    <button
                      key={network}
                      className={`discover-network-btn ${selectedNetworks.has(network) ? 'active' : ''}`}
                      onClick={() => {
                        const newNetworks = new Set(selectedNetworks);
                        if (newNetworks.has(network)) {
                          newNetworks.delete(network);
                        } else {
                          newNetworks.add(network);
                        }
                        setSelectedNetworks(newNetworks);
                      }}
                    >
                      {network}
                    </button>
                  ))}
                </div>
                <div className="discover-search-section">
                  <div className="discover-search-wrapper">
                    <svg className="discover-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                      type="text"
                      className="discover-search"
                      placeholder="Search strategies..."
                      value={discoverSearch}
                      onChange={(e) => setDiscoverSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="discover-strategy-of-week">
              <div className="strategy-slider-container">
                <div className="strategy-slider-wrapper">
                  <div 
                    className="strategy-slider-track"
                    style={{ transform: `translateX(-${featuredStrategyIndex * 100}%)` }}
                  >
                    {featuredStrategies.map((strategy, index) => {
                      // const isLiked = likedStrategies.has(strategy.title); // Removed unused variable
                      return (
                        <div 
                          key={index} 
                          className="strategy-slide"
                          onClick={() => {
                            // Create a mock strategy object for the modal
                            const mockStrategy = {
                              name: strategy.title,
                              author: 'Community',
                              nodes: 4,
                              usage: strategy.stats.users,
                              profit: strategy.stats.apy,
                              description: strategy.description,
                              category: 'all',
                              chains: strategy.networks.map(n => n.toLowerCase()),
                              networks: strategy.networks
                            };
                            
                            // Load strategy node data if available
                            const discoverStrategiesKey = 'siphon-discover-strategies';
                            const stored = localStorage.getItem(discoverStrategiesKey);
                            if (stored) {
                              try {
                                const strategiesData = JSON.parse(stored) as Record<string, StrategyData>;
                                // Try to find matching strategy by name
                                const strategyData = strategiesData[strategy.title] || strategiesData['Buy High - Sell Low'];
                                if (strategyData && strategyData.nodes && strategyData.edges) {
                                  const formattedNodes = strategyData.nodes.map((node: Node) => ({
                                    ...node,
                                    type: node.type || 'custom',
                                    position: node.position || { x: 0, y: 0 }
                                  }));
                                  const formattedEdges = strategyData.edges.map((edge: Edge) => ({
                                    ...edge,
                                    type: edge.type || 'smoothstep'
                                  }));
                                  setModalStrategyNodes(formattedNodes);
                                  setModalStrategyEdges(formattedEdges);
                                  setFlowKey(prev => prev + 1);
                                } else {
                                  setModalStrategyNodes([]);
                                  setModalStrategyEdges([]);
                                }
                              } catch (error) {
                                console.error('Failed to load strategy data:', error);
                                setModalStrategyNodes([]);
                                setModalStrategyEdges([]);
                              }
                            } else {
                              setModalStrategyNodes([]);
                              setModalStrategyEdges([]);
                            }
                            
                            setSelectedStrategy(mockStrategy);
                            setIsFlowLoading(false);
                            setShowStrategyModal(true);
                          }}
                        >
                          <div className="strategy-of-week-content">
                            <h3 className="strategy-of-week-title">{strategy.title}</h3>
                            <p className="strategy-of-week-description">{strategy.description}</p>
                            <div className="strategy-of-week-stats">
                              <div className="strategy-of-week-stat">
                                <span className="stat-label">APY</span>
                                <span className="stat-value">{strategy.stats.apy}</span>
                              </div>
                              <div className="strategy-of-week-stat">
                                <span className="stat-label">Users</span>
                                <span className="stat-value">{strategy.stats.users}</span>
                              </div>
                              <div className="strategy-of-week-stat">
                                <span className="stat-label">Risk</span>
                                <span className="stat-value">{strategy.stats.risk}</span>
                              </div>
                            </div>
                            <div className="strategy-of-week-networks">
                              {strategy.networks.map((network, netIndex) => (
                                <span key={netIndex} className="network-tag">{network}</span>
                              ))}
                            </div>
                          </div>
                          <span className="strategy-of-week-badge">{strategy.badge}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Filters section - full width on mobile */}
          <div className="discover-filters-section-mobile">
            {/* Protocol filters - full width, 1 line, marquee right to left */}
            <div className="discover-protocol-filters">
              <div className="discover-categories-marquee discover-marquee-rtl">
                <div className="discover-marquee-content">
                  {['all', 'arbitrage', 'yield', 'trading', 'liquidity', 'defi'].map((category) => {
                    const isSelected = selectedCategory === category || (typeof selectedCategory === 'object' && selectedCategory.has && selectedCategory.has(category));
                    return (
                      <button
                        key={category}
                        className={`discover-category-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          if (category === 'all') {
                            setSelectedCategory('all');
                          } else {
                            const currentCategories: Set<string> = typeof selectedCategory === 'object' && selectedCategory instanceof Set 
                              ? new Set<string>(selectedCategory) 
                              : selectedCategory === 'all' 
                                ? new Set<string>() 
                                : new Set<string>([selectedCategory]);
                            
                            if (currentCategories.has(category)) {
                              currentCategories.delete(category);
                              if (currentCategories.size === 0) {
                                setSelectedCategory('all');
                              } else {
                                setSelectedCategory(currentCategories);
                              }
                            } else {
                              currentCategories.add(category);
                              setSelectedCategory(currentCategories);
                            }
                          }
                        }}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </button>
                    );
                  })}
                  {/* Duplicate for seamless loop */}
                  {['all', 'arbitrage', 'yield', 'trading', 'liquidity', 'defi'].map((category) => {
                    const isSelected = selectedCategory === category || (typeof selectedCategory === 'object' && selectedCategory.has && selectedCategory.has(category));
                    return (
                      <button
                        key={`${category}-dup`}
                        className={`discover-category-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          if (category === 'all') {
                            setSelectedCategory('all');
                          } else {
                            const currentCategories: Set<string> = typeof selectedCategory === 'object' && selectedCategory instanceof Set 
                              ? new Set<string>(selectedCategory) 
                              : selectedCategory === 'all' 
                                ? new Set<string>() 
                                : new Set<string>([selectedCategory]);
                            
                            if (currentCategories.has(category)) {
                              currentCategories.delete(category);
                              if (currentCategories.size === 0) {
                                setSelectedCategory('all');
                              } else {
                                setSelectedCategory(currentCategories);
                              }
                            } else {
                              currentCategories.add(category);
                              setSelectedCategory(currentCategories);
                            }
                          }
                        }}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Chains filters - full width, 1 line, marquee left to right */}
            <div className="discover-chains-filters">
              <div className="discover-networks-marquee discover-marquee-ltr">
                <div className="discover-marquee-content">
                  {['Solana', 'Ethereum', 'Base', 'Bitcoin', 'Polygon', 'Arbitrum'].map((network) => (
                    <button
                      key={network}
                      className={`discover-network-btn ${selectedNetworks.has(network) ? 'active' : ''}`}
                      onClick={() => {
                        const newNetworks = new Set(selectedNetworks);
                        if (newNetworks.has(network)) {
                          newNetworks.delete(network);
                        } else {
                          newNetworks.add(network);
                        }
                        setSelectedNetworks(newNetworks);
                      }}
                    >
                      {network}
                    </button>
                  ))}
                  {/* Duplicate for seamless loop */}
                  {['Solana', 'Ethereum', 'Base', 'Bitcoin', 'Polygon', 'Arbitrum'].map((network) => (
                    <button
                      key={`${network}-dup`}
                      className={`discover-network-btn ${selectedNetworks.has(network) ? 'active' : ''}`}
                      onClick={() => {
                        const newNetworks = new Set(selectedNetworks);
                        if (newNetworks.has(network)) {
                          newNetworks.delete(network);
                        } else {
                          newNetworks.add(network);
                        }
                        setSelectedNetworks(newNetworks);
                      }}
                    >
                      {network}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Sort options - marquee infinite scroll from right to left */}
            <div className="discover-sort-filters-mobile">
              <div className="discover-sort-marquee discover-marquee-rtl">
                <div className="discover-marquee-content">
                  {['popular', 'recent', 'profitable'].map((sort) => (
                    <button
                      key={sort}
                      className={`discover-sort-btn ${discoverSort === sort ? 'active' : ''}`}
                      onClick={() => setDiscoverSort(sort)}
                    >
                      {sort === 'popular' ? 'Most Popular' : sort === 'recent' ? 'Most Recent' : 'Most Profitable'}
                    </button>
                  ))}
                  {/* Duplicate for seamless loop */}
                  {['popular', 'recent', 'profitable'].map((sort) => (
                    <button
                      key={`${sort}-dup`}
                      className={`discover-sort-btn ${discoverSort === sort ? 'active' : ''}`}
                      onClick={() => setDiscoverSort(sort)}
                    >
                      {sort === 'popular' ? 'Most Popular' : sort === 'recent' ? 'Most Recent' : 'Most Profitable'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Search section */}
            <div className="discover-search-section">
              <div className="discover-search-wrapper">
                <svg className="discover-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  className="discover-search"
                  placeholder="Search strategies..."
                  value={discoverSearch}
                  onChange={(e) => setDiscoverSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          {/* Other filters - scrollable from right to left */}
          <div className="discover-bottom-row">
            <div className="discover-pagination-options">
              <div className="discover-view-options">
                <button
                  className={`discover-view-btn ${discoverViewMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setDiscoverViewMode('cards')}
                  title="Card view"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                </button>
                <button
                  className={`discover-view-btn ${discoverViewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setDiscoverViewMode('list')}
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

      </div>
      <div className={`discover-grid ${discoverViewMode === 'list' ? 'list-view' : 'cards-view'}`}>
        {/* Strategy cards from strategies.tsx */}
        {strategyList
        .filter(strategy => {
          if (selectedCategory === 'all') return true;
          if (typeof selectedCategory === 'object' && selectedCategory instanceof Set) {
            return selectedCategory.has(strategy.category);
          }
          return strategy.category === selectedCategory;
        })
        .filter(strategy => {
          if (selectedChains.size === 0) return true;
          return strategy.chains.some(chain => selectedChains.has(chain));
        })
        .filter(strategy => {
          if (selectedNetworks.size === 0) return true;
          return strategy.networks.some(network => selectedNetworks.has(network));
        })
        .filter(strategy => !discoverSearch || strategy.name.toLowerCase().includes(discoverSearch.toLowerCase()) || strategy.description.toLowerCase().includes(discoverSearch.toLowerCase()))
        .map((strategy, index) => {
          const isFavorite = favoriteStrategies?.has(strategy.name) || false;
          const activeNetworks = strategy.activeNetworks || strategy.networks;
          
          return (
            <div 
              key={index} 
              className={`discover-strategy-card ${!strategy.isActive ? 'inactive' : ''}`}
            >
              <div className="discover-card-header">
                <h3 className="discover-card-title">{strategy.name}</h3>
                <div className="discover-card-stats">
                  <button 
                    className="discover-like-stat"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!setFavoriteStrategies) return;
                      
                      const newFavorites = new Set<string>(favoriteStrategies || new Set<string>());
                      if (newFavorites.has(strategy.name)) {
                        newFavorites.delete(strategy.name);
                        // Remove from savedScenes
                        setSavedScenes(savedScenes.filter(s => s.name !== strategy.name));
                      } else {
                        newFavorites.add(strategy.name);
                        // Save strategy to savedScenes for Run library
                        const discoverStrategiesKey = 'siphon-discover-strategies';
                        const stored = localStorage.getItem(discoverStrategiesKey);
                        if (stored) {
                          try {
                            const strategiesData = JSON.parse(stored) as Record<string, StrategyData>;
                            const strategyData = strategiesData[strategy.name];
                            if (strategyData && strategyData.nodes && strategyData.edges) {
                              const newScene = {
                                name: strategy.name,
                                nodes: strategyData.nodes,
                                edges: strategyData.edges
                              };
                              setSavedScenes([...savedScenes.filter(s => s.name !== strategy.name), newScene]);
                              localStorage.setItem('siphon-blueprint-scenes', JSON.stringify([...savedScenes.filter(s => s.name !== strategy.name), newScene]));
                            }
                          } catch (error) {
                            console.error('Failed to save favorite strategy:', error);
                          }
                        }
                      }
                      setFavoriteStrategies(newFavorites);
                      localStorage.setItem('siphon-favorite-strategies', JSON.stringify(Array.from(newFavorites)));
                    }}
                    title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="discover-card-description">{strategy.description}</p>
              <div className="discover-card-categories">
                {strategy.networks.map((network, idx) => {
                  const isActive = activeNetworks.includes(network);
                  return (
                    <span 
                      key={idx} 
                      className={`discover-card-category-badge ${isActive ? 'active' : 'inactive'}`}
                      title={isActive ? 'Active' : 'Inactive'}
                    >
                      {network}
                    </span>
                  );
                })}
              </div>
              <div className="discover-card-category-label">
                <span className="discover-category-text">{strategy.category.charAt(0).toUpperCase() + strategy.category.slice(1)}</span>
              </div>
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
                  <span style={{ marginLeft: '0.5rem' }}>{strategy.usage} users</span>
                </div>
              </div>
              <div className="discover-card-actions">
                <button 
                  className={`discover-card-more-details ${!strategy.isActive ? 'inactive' : ''}`}
                    onClick={(e) => {
                    e.stopPropagation();
                    if (!strategy.isActive) return;
                    // Load strategy node data immediately before opening modal
                    const discoverStrategiesKey = 'siphon-discover-strategies';
                    const stored = localStorage.getItem(discoverStrategiesKey);
                    if (stored) {
                      try {
                        const strategiesData = JSON.parse(stored) as Record<string, StrategyData>;
                        const strategyData = strategiesData[strategy.name];
                        if (strategyData && strategyData.nodes && strategyData.edges) {
                          // Ensure nodes have proper structure
                          const formattedNodes = strategyData.nodes.map((node: Node) => ({
                            ...node,
                            type: node.type || 'custom',
                            position: node.position || { x: 0, y: 0 }
                          }));
                          const formattedEdges = strategyData.edges.map((edge: Edge) => ({
                            ...edge,
                            type: edge.type || 'smoothstep'
                          }));
                          setModalStrategyNodes(formattedNodes);
                          setModalStrategyEdges(formattedEdges);
                          setFlowKey(prev => prev + 1);
                        } else {
                          setModalStrategyNodes([]);
                          setModalStrategyEdges([]);
                        }
                      } catch (error) {
                        console.error('Failed to load strategy data:', error);
                        setModalStrategyNodes([]);
                        setModalStrategyEdges([]);
                      }
                    } else {
                      setModalStrategyNodes([]);
                      setModalStrategyEdges([]);
                    }
                    setSelectedStrategy(strategy);
                    setIsFlowLoading(false);
                    setShowStrategyModal(true);
                  }}
                >
                  More Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Strategy Modal */}
      {showStrategyModal && selectedStrategy && (
        <DetailsModal
          selectedStrategy={selectedStrategy}
          isOpen={showStrategyModal}
          onClose={() => {
            setShowStrategyModal(false);
            setIsRunMode(false);
            setRunModeValues({});
          }}
          isRunMode={isRunMode}
          setIsRunMode={setIsRunMode}
          modalStrategyNodes={modalStrategyNodes}
          modalStrategyEdges={modalStrategyEdges}
          runModeValues={runModeValues}
          setRunModeValues={setRunModeValues}
          runDuration={runDuration}
          setRunDuration={setRunDuration}
          executionTime={executionTime}
          variableCost={variableCost}
          fixedCost={fixedCost}
          totalCost={totalCost}
          isFading={isFading}
          setIsFading={setIsFading}
          flowKey={flowKey}
          isFlowLoading={isFlowLoading}
          runningStrategies={runningStrategies}
          setRunningStrategies={setRunningStrategies}
          setNodes={setNodes}
          setEdges={setEdges}
          setViewMode={setViewMode}
          setCurrentFileName={setCurrentFileName}
          savedScenes={savedScenes}
          setSavedScenes={setSavedScenes}
          setShowSuccessNotification={setShowSuccessNotification}
          calculateExchange={calculateExchangeWithPrices}
          formatAmount={formatAmount}
        />
      )}
      
      {/* Success Notification Popup */}
      {showSuccessNotification && selectedStrategy && (
        <div className="strategy-success-notification">
          <div className="strategy-success-notification-content">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div className="strategy-success-notification-text">
              <p className="strategy-success-notification-title">Strategy Started Successfully</p>
              <p className="strategy-success-notification-message">
                Your strategy &quot;{selectedStrategy.name}&quot; is now running. You can find it in the <strong>Run</strong> tab under <strong>Running</strong>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
