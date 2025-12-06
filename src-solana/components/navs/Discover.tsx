"use client";

import { useState, useEffect, useRef } from "react";
import { ReactFlow, ReactFlowProvider, Background, Node, Edge, Handle, Position, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import "./Discover.css";

interface NodeData {
  label?: string;
  type?: 'deposit' | 'swap' | 'withdraw' | 'strategy';
  coin?: string;
  toCoin?: string;
  amount?: string;
  strategy?: string;
  chain?: string;
}

interface StrategyMetadata {
  name: string;
  author: string;
  nodes: number;
  usage: string | number;
  profit: string;
  description: string;
  category: string;
  chains: string[];
  networks: string[];
}

interface DiscoverProps {
  isLoaded?: boolean;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  setViewMode: (mode: 'blueprint' | 'run' | 'discover') => void;
  setCurrentFileName: (name: string) => void;
  savedScenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>;
  setSavedScenes: (scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }> | ((scenes: Array<{ name: string; nodes: Node[]; edges: Edge[] }>) => Array<{ name: string; nodes: Node[]; edges: Edge[] }>)) => void;
}

export default function Discover({
  isLoaded = true,
  setNodes,
  setEdges,
  setViewMode,
  setCurrentFileName,
  savedScenes,
  setSavedScenes
}: DiscoverProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | Set<string>>('all');
  const [selectedChains, setSelectedChains] = useState<Set<string>>(new Set());
  const [selectedNetworks, setSelectedNetworks] = useState<Set<string>>(new Set());
  const [discoverSearch, setDiscoverSearch] = useState<string>('');
  const [discoverSort, setDiscoverSort] = useState<string>('popular');
  const [discoverViewMode, setDiscoverViewMode] = useState<'cards' | 'list'>('cards');
  const [favoriteStrategies, setFavoriteStrategies] = useState<Set<string>>(new Set());
  const [featuredStrategyIndex, setFeaturedStrategyIndex] = useState(0);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyMetadata | null>(null);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [likedStrategies, setLikedStrategies] = useState<Set<string>>(new Set());
  const [modalStrategyNodes, setModalStrategyNodes] = useState<Node[]>([]);
  const [modalStrategyEdges, setModalStrategyEdges] = useState<Edge[]>([]);
  const [flowKey, setFlowKey] = useState(0);
  const [isFlowLoading, setIsFlowLoading] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  
  // Load strategy nodes when modal opens
  useEffect(() => {
    if (showStrategyModal && selectedStrategy) {
      setIsFlowLoading(true);
      const discoverStrategiesKey = 'siphon-discover-strategies';
      const stored = localStorage.getItem(discoverStrategiesKey);
      if (stored) {
        try {
          const strategiesData = JSON.parse(stored);
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
  
  
  // Featured strategies data
  const featuredStrategies = [
    {
      badge: 'Strategy of the Week',
      title: 'Cross-Chain Arbitrage Pro',
      description: 'Automated arbitrage detection across Solana, Ethereum, and Base networks. Maximize profits by finding price discrepancies in real-time.',
      stats: {
        apy: '+127.3%',
        users: '1,234',
        risk: 'Low'
      },
      networks: ['Solana', 'Ethereum', 'Base']
    },
    {
      badge: 'Strategy of the Month',
      title: 'Yield Farming Optimizer',
      description: 'Automatically rebalance across multiple yield farms to maximize returns. Dynamic allocation based on real-time APY data and risk assessment.',
      stats: {
        apy: '+89.5%',
        users: '3,456',
        risk: 'Medium'
      },
      networks: ['Ethereum', 'Polygon', 'Arbitrum']
    },
    {
      badge: 'Most Used Strategy',
      title: 'DCA Accumulation Bot',
      description: 'Dollar-cost averaging strategy with intelligent timing. Automatically purchases assets at optimal intervals to reduce volatility impact.',
      stats: {
        apy: '+45.2%',
        users: '8,901',
        risk: 'Low'
      },
      networks: ['Solana', 'Bitcoin', 'Ethereum']
    }
  ];
  
  // Auto-rotate featured strategies
  useEffect(() => {
    const interval = setInterval(() => {
      setFeaturedStrategyIndex((prev) => (prev + 1) % featuredStrategies.length);
    }, 5000); // Change every 5 seconds
    
    return () => clearInterval(interval);
  }, [featuredStrategies.length]);
  
  // Initialize discover strategies with node data
  useEffect(() => {
    const discoverStrategiesKey = 'siphon-discover-strategies';
    const stored = localStorage.getItem(discoverStrategiesKey);
    
    if (!stored) {
      // Create mock strategy data with nodes and edges matching the actual structure
      const timestamp1 = Date.now();
      const timestamp2 = Date.now() + 1000;
      const timestamp3 = Date.now() + 2000;
      const timestamp4 = Date.now() + 3000;
      
      const discoverStrategiesData = {
        'Buy High - Sell Low': {
          name: 'Buy High - Sell Low',
          nodes: [
            {
              id: `deposit-${timestamp1}`,
              type: 'custom',
              position: { x: 100, y: 200 },
              data: {
                label: 'Deposit from Ethereum',
                type: 'deposit',
                chain: 'Ethereum',
                dex: null,
                strategy: null
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }
            },
            {
              id: `strategy-${timestamp2}`,
              type: 'custom',
              position: { x: 400, y: 200 },
              data: {
                label: 'Buy High',
                type: 'strategy',
                chain: 'Ethereum',
                dex: null,
                strategy: 'buy-high'
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 193, 7, 0.2)',
                border: '1px solid rgba(255, 193, 7, 0.5)',
                color: 'white'
              }
            },
            {
              id: `swap-${timestamp3}`,
              type: 'custom',
              position: { x: 700, y: 200 },
              data: {
                label: 'Sell Low',
                type: 'swap',
                chain: 'Ethereum',
                dex: null,
                strategy: null
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }
            },
            {
              id: `withdraw-${timestamp4}`,
              type: 'custom',
              position: { x: 1000, y: 200 },
              data: {
                label: 'Withdraw to Ethereum',
                type: 'withdraw',
                chain: 'Ethereum',
                dex: null,
                strategy: null
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }
            }
          ],
          edges: [
            {
              id: `xy-edge__deposit-${timestamp1}-strategy-${timestamp2}`,
              source: `deposit-${timestamp1}`,
              target: `strategy-${timestamp2}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
            },
            {
              id: `xy-edge__strategy-${timestamp2}-swap-${timestamp3}`,
              source: `strategy-${timestamp2}`,
              target: `swap-${timestamp3}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
            },
            {
              id: `xy-edge__swap-${timestamp3}-withdraw-${timestamp4}`,
              source: `swap-${timestamp3}`,
              target: `withdraw-${timestamp4}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
            }
          ]
        },
        'DCA to Oblivion': {
          name: 'DCA to Oblivion',
          nodes: [
            {
              id: `deposit-${timestamp1 + 10000}`,
              type: 'custom',
              position: { x: 100, y: 150 },
              data: {
                label: 'Deposit from Solana',
                type: 'deposit',
                chain: 'Solana',
                dex: null,
                strategy: null
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }
            },
            {
              id: `strategy-${timestamp2 + 10000}`,
              type: 'custom',
              position: { x: 400, y: 150 },
              data: {
                label: 'DCA Start',
                type: 'strategy',
                chain: 'Solana',
                dex: null,
                strategy: 'dca'
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 193, 7, 0.2)',
                border: '1px solid rgba(255, 193, 7, 0.5)',
                color: 'white'
              }
            },
            {
              id: `swap-${timestamp3 + 10000}`,
              type: 'custom',
              position: { x: 700, y: 150 },
              data: {
                label: 'Buy BTC',
                type: 'swap',
                chain: 'Solana',
                dex: null,
                strategy: null
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }
            },
            {
              id: `strategy-${timestamp4 + 10000}`,
              type: 'custom',
              position: { x: 400, y: 300 },
              data: {
                label: 'Loop Forever',
                type: 'strategy',
                chain: 'Solana',
                dex: null,
                strategy: 'loop'
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 193, 7, 0.2)',
                border: '1px solid rgba(255, 193, 7, 0.5)',
                color: 'white'
              }
            },
            {
              id: `withdraw-${timestamp4 + 20000}`,
              type: 'custom',
              position: { x: 1000, y: 150 },
              data: {
                label: 'Withdraw to Solana',
                type: 'withdraw',
                chain: 'Solana',
                dex: null,
                strategy: null
              },
              sourcePosition: 'right',
              targetPosition: 'left',
              style: {
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white'
              }
            }
          ],
          edges: [
            {
              id: `xy-edge__deposit-${timestamp1 + 10000}-strategy-${timestamp2 + 10000}`,
              source: `deposit-${timestamp1 + 10000}`,
              target: `strategy-${timestamp2 + 10000}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
            },
            {
              id: `xy-edge__strategy-${timestamp2 + 10000}-swap-${timestamp3 + 10000}`,
              source: `strategy-${timestamp2 + 10000}`,
              target: `swap-${timestamp3 + 10000}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
            },
            {
              id: `xy-edge__swap-${timestamp3 + 10000}-strategy-${timestamp4 + 10000}`,
              source: `swap-${timestamp3 + 10000}`,
              target: `strategy-${timestamp4 + 10000}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
            },
            {
              id: `xy-edge__strategy-${timestamp4 + 10000}-strategy-${timestamp2 + 10000}`,
              source: `strategy-${timestamp4 + 10000}`,
              target: `strategy-${timestamp2 + 10000}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
            },
            {
              id: `xy-edge__swap-${timestamp3 + 10000}-withdraw-${timestamp4 + 20000}`,
              source: `swap-${timestamp3 + 10000}`,
              target: `withdraw-${timestamp4 + 20000}`,
              type: 'smoothstep',
              style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
            }
          ]
        }
      };
      localStorage.setItem(discoverStrategiesKey, JSON.stringify(discoverStrategiesData));
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
                      const isLiked = likedStrategies.has(strategy.title);
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
                      const isLiked = likedStrategies.has(strategy.title);
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
                                const strategiesData = JSON.parse(stored);
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
        {/* Mock strategy cards - in real app these would come from API */}
        {[
          { name: 'Buy High - Sell Low', author: '0x1234...5678', nodes: 2, usage: 12, profit: '-99.9%', description: 'The ultimate contrarian strategy. Buy at peaks, sell at valleys. Maximum loss, maximum style.', category: 'trading', chains: ['arbitrage', 'ethereum'], networks: ['Ethereum', 'Base'] },
          { name: 'DCA to Oblivion', author: '0xabcd...efgh', nodes: 4, usage: 8, profit: '+0.0%', description: 'Dollar-cost average forever. Never stop buying. Never check the price. Just keep going.', category: 'trading', chains: ['yields', 'base'], networks: ['Solana', 'Ethereum'] },
        ]
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
          const isFavorite = favoriteStrategies.has(strategy.name);
          const isLiked = likedStrategies.has(strategy.name);
          return (
            <div 
              key={index} 
              className="discover-strategy-card"
            >
              <div className="discover-card-header">
                <h3 className="discover-card-title">{strategy.name}</h3>
                <div className="discover-card-stats">
                  <button 
                    className="discover-like-stat"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newLiked = new Set(likedStrategies);
                      if (newLiked.has(strategy.name)) {
                        newLiked.delete(strategy.name);
                      } else {
                        newLiked.add(strategy.name);
                      }
                      setLikedStrategies(newLiked);
                    }}
                    title={isLiked ? 'Unlike' : 'Like'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span className="discover-like-count">{strategy.usage}</span>
                  </button>
                  <div className="discover-card-badge">
                    {strategy.profit}
                  </div>
                </div>
              </div>
              <p className="discover-card-description">{strategy.description}</p>
              <div className="discover-card-categories">
                {strategy.chains.map((chain, idx) => (
                  <span key={idx} className="discover-card-category-badge">
                    {chain.charAt(0).toUpperCase() + chain.slice(1)}
                  </span>
                ))}
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
                  className="discover-card-more-details"
                    onClick={(e) => {
                    e.stopPropagation();
                    // Load strategy node data immediately before opening modal
                    const discoverStrategiesKey = 'siphon-discover-strategies';
                    const stored = localStorage.getItem(discoverStrategiesKey);
                    if (stored) {
                      try {
                        const strategiesData = JSON.parse(stored);
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
        <div className="strategy-modal-overlay" onClick={() => {
          setShowStrategyModal(false);
        }}>
          <div className="strategy-modal" onClick={(e) => e.stopPropagation()}>
            <div className="strategy-modal-header">
              <div>
                <h2 className="strategy-modal-title">{selectedStrategy.name}</h2>
                <p className="strategy-modal-author">by {selectedStrategy.author}</p>
              </div>
              <div className="strategy-modal-header-actions">
                <div className="strategy-modal-stats-top">
                  <div className="strategy-modal-stat-item">
                    <span className="strategy-modal-stat-label">Runs</span>
                    <span className="strategy-modal-stat-value">{selectedStrategy.usage}</span>
                  </div>
                  <div className="strategy-modal-stat-item">
                    <span className="strategy-modal-stat-label">Profit</span>
                    <span className="strategy-modal-stat-value">{selectedStrategy.profit}</span>
                  </div>
                  <div className="strategy-modal-stat-item">
                    <span className="strategy-modal-stat-label">Likes</span>
                    <span className="strategy-modal-stat-value">{selectedStrategy.usage}</span>
                  </div>
                  <div className="strategy-modal-stat-item">
                    <span className="strategy-modal-stat-label">Cost of Run</span>
                    <span className="strategy-modal-stat-value">$0.05</span>
                  </div>
                  <div className="strategy-modal-stat-item">
                    <span className="strategy-modal-stat-label">Duration</span>
                    <span className="strategy-modal-stat-value">~2 min</span>
                  </div>
                </div>
                <button 
                  className="strategy-modal-close"
                  onClick={() => {
                    setShowStrategyModal(false);
                  }}
                  aria-label="Close modal"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="strategy-modal-content">
              <div className="strategy-modal-info">
                <div className="strategy-modal-categories">
                  {selectedStrategy.chains.map((chain: string, idx: number) => (
                    <span key={idx} className="strategy-modal-category-badge">
                      {chain.charAt(0).toUpperCase() + chain.slice(1)}
                    </span>
                  ))}
                  {selectedStrategy.networks.map((network: string, idx: number) => (
                    <span key={`net-${idx}`} className="strategy-modal-network-badge">
                      {network}
                    </span>
                  ))}
                </div>
                <p className="strategy-modal-description">{selectedStrategy.description}</p>
                
                {/* Input/Output Section */}
                {modalStrategyNodes.length > 0 && (() => {
                  const depositNodes = modalStrategyNodes.filter(node => (node.data as NodeData)?.type === 'deposit');
                  const strategyNodes = modalStrategyNodes.filter(node => (node.data as NodeData)?.type === 'strategy');
                  
                  // Get input coin from first deposit node, default to USDC
                  const inputCoin = depositNodes.length > 0 && (depositNodes[0].data as NodeData)?.coin 
                    ? (depositNodes[0].data as NodeData).coin 
                    : 'USDC';
                  
                  // Output is input coin + Logic if strategy nodes exist
                  const hasLogic = strategyNodes.length > 0;
                  const outputText = hasLogic ? `${inputCoin} + Logic` : inputCoin;
                  
                  return (
                    <div className="strategy-modal-io-section">
                  
                      <div className="strategy-modal-io-content">
                        <div className="strategy-modal-io-inputs">
                          <div className="strategy-modal-io-title">Input</div>
                          <div className="strategy-modal-io-items">
                            <div className="strategy-modal-io-item">
                              <span className="strategy-modal-io-coin">{inputCoin}</span>
                            </div>
                          </div>
                        </div>
                        <div className="strategy-modal-io-arrow">→</div>
                        <div className="strategy-modal-io-outputs">
                          <div className="strategy-modal-io-title">Output</div>
                          <div className="strategy-modal-io-items">
                            <div className="strategy-modal-io-item">
                              <span className="strategy-modal-io-coin">{outputText}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                <div className="strategy-modal-steps-section">
                  <div className="strategy-modal-steps-header">
                    <span className="strategy-modal-steps-label">Steps ({selectedStrategy.nodes})</span>
                  </div>
                  {modalStrategyNodes.length > 0 && (
                    <div className="strategy-steps-list">
                      {modalStrategyNodes.map((node, index) => {
                        const nodeData = node.data as NodeData;
                        return (
                          <div key={node.id} className="strategy-step-item">
                            <div className="strategy-step-number">{index + 1}</div>
                            <div className="strategy-step-content">
                              <div className="strategy-step-title">{nodeData?.label || `Step ${index + 1}`}</div>
                              <div className="strategy-step-details">
                                {nodeData?.type && (
                                  <span className="strategy-step-type">{nodeData.type}</span>
                                )}
                                {nodeData?.chain && (
                                  <span className="strategy-step-chain">{nodeData.chain}</span>
                                )}
                                {nodeData?.coin && (
                                  <span className="strategy-step-coin">{nodeData.coin}</span>
                                )}
                                {nodeData?.toCoin && (
                                  <span className="strategy-step-coin">→ {nodeData.toCoin}</span>
                                )}
                                {nodeData?.amount && (
                                  <span className="strategy-step-amount">{nodeData.amount}</span>
                                )}
                                {nodeData?.strategy && (
                                  <span className="strategy-step-strategy">{nodeData.strategy}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="strategy-modal-preview">
                <h3 className="strategy-preview-title">Strategy Preview</h3>
                <div className="strategy-preview-flow">
                  {isFlowLoading ? (
                    <div className="strategy-preview-placeholder">
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                      <p>Loading strategy preview...</p>
                    </div>
                  ) : modalStrategyNodes.length > 0 ? (
                    <div ref={flowRef} style={{ width: '100%', height: '100%', minHeight: '400px', position: 'relative' }}>
                      <ReactFlowProvider key={flowKey}>
                        <ReactFlow
                          key={`flow-${flowKey}`}
                          nodes={modalStrategyNodes}
                          edges={modalStrategyEdges}
                          onInit={(instance) => {
                            reactFlowInstance.current = instance;
                            setTimeout(() => {
                              instance.fitView({ padding: 0.2, duration: 400 });
                            }, 100);
                          }}
                          nodeTypes={{
                            custom: ({ data }: { data: NodeData }) => {
                              const nodeData = data as NodeData;
                              const isStrategy = nodeData.type === 'strategy';
                              return (
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
                                    <div className="node-title">{nodeData.label}</div>
                                    {nodeData.type === 'deposit' && nodeData.coin && (
                                      <div className="node-preview-info" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.5rem' }}>
                                        {nodeData.coin} {nodeData.amount ? `- ${nodeData.amount}` : ''}
                                      </div>
                                    )}
                                    {nodeData.type === 'swap' && (
                                      <div className="node-preview-info" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.5rem' }}>
                                        {nodeData.coin || 'From'} → {nodeData.toCoin || 'To'} {nodeData.amount ? `- ${nodeData.amount}` : ''}
                                      </div>
                                    )}
                                    {nodeData.type === 'withdraw' && (
                                      <div className="node-preview-info" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.5rem' }}>
                                        {nodeData.coin || 'Coin'} {nodeData.amount ? `- ${nodeData.amount}` : ''}
                                      </div>
                                    )}
                                    {nodeData.type === 'strategy' && nodeData.strategy && (
                                      <div className="node-preview-info" style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.5rem' }}>
                                        {nodeData.strategy} {nodeData.coin ? `- ${nodeData.coin}` : ''} {nodeData.amount ? `- ${nodeData.amount}` : ''}
                                      </div>
                                    )}
                                    {nodeData.chain && (
                                      <div className="node-preview-info" style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.25rem' }}>
                                        {nodeData.chain}
                                      </div>
                                    )}
                                  </div>
                                  <Handle type="source" position={Position.Right} style={{ background: 'rgba(255, 255, 255, 0.3)' }} />
                                </div>
                              );
                            }
                          }}
                          defaultEdgeOptions={{
                            style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 },
                            type: 'smoothstep'
                          }}
                          fitView
                          minZoom={0.3}
                          maxZoom={1.5}
                          nodesDraggable={false}
                          nodesConnectable={false}
                          elementsSelectable={false}
                          panOnDrag={true}
                          zoomOnScroll={true}
                          zoomOnPinch={true}
                          proOptions={{ hideAttribution: true }}
                        >
                          <Background color="rgba(255, 255, 255, 0.02)" gap={16} size={1} />
                        </ReactFlow>
                      </ReactFlowProvider>
                    </div>
                  ) : (
                    <div className="strategy-preview-placeholder">
                      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                      <p>Loading strategy preview...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="strategy-modal-actions">
              <button 
                className="strategy-modal-btn strategy-modal-btn-run"
                onClick={() => {
                  // Load and run strategy
                  console.log('Running strategy:', selectedStrategy.name);
                  setShowStrategyModal(false);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run
              </button>
              <button 
                className={`strategy-modal-btn strategy-modal-btn-like ${likedStrategies.has(selectedStrategy.name) ? 'active' : ''}`}
                onClick={() => {
                  const newLiked = new Set(likedStrategies);
                  if (newLiked.has(selectedStrategy.name)) {
                    newLiked.delete(selectedStrategy.name);
                  } else {
                    newLiked.add(selectedStrategy.name);
                  }
                  setLikedStrategies(newLiked);
                }}
                title={likedStrategies.has(selectedStrategy.name) ? 'Remove from Favourites' : 'Add to Favourites'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={likedStrategies.has(selectedStrategy.name) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {likedStrategies.has(selectedStrategy.name) ? 'Remove from Favourites' : 'Add to Favourites'}
              </button>
              <button 
                className="strategy-modal-btn strategy-modal-btn-edit"
                onClick={() => {
                  // Load strategy from localStorage
                  const discoverStrategiesKey = 'siphon-discover-strategies';
                  const stored = localStorage.getItem(discoverStrategiesKey);
                  if (stored) {
                    try {
                      const strategiesData = JSON.parse(stored);
                      const strategyData = strategiesData[selectedStrategy.name];
                      if (strategyData && strategyData.nodes && strategyData.edges) {
                        // Load the strategy into the blueprint view
                        setNodes(strategyData.nodes as Node[]);
                        setEdges(strategyData.edges as Edge[]);
                        setCurrentFileName(`${selectedStrategy.name}.io`);
                        setViewMode('blueprint');
                        setShowStrategyModal(false);
                        
                        // Also save it to saved scenes if not already there
                        const existingScene = savedScenes.find(s => s.name === selectedStrategy.name);
                        if (!existingScene) {
                          const newScene = {
                            name: selectedStrategy.name,
                            nodes: strategyData.nodes as Node[],
                            edges: strategyData.edges as Edge[]
                          };
                          const updatedScenes = [...savedScenes, newScene];
                          setSavedScenes(updatedScenes);
                          localStorage.setItem('siphon-blueprint-scenes', JSON.stringify(updatedScenes));
                        }
                      }
                    } catch (error) {
                      console.error('Failed to load strategy for editing:', error);
                    }
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

