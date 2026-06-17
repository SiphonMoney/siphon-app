/**
 * Strategies Data and Utilities
 * 
 * Contains all strategy-related data, metadata, and initialization logic
 */

import { Node, Edge, Position } from '@xyflow/react';

export interface StrategyMetadata {
  name: string;
  author: string;
  nodes: number;
  usage: string | number;
  profit: string;
  description: string;
  category: string;
  chains: string[];
  networks: string[];
  activeNetworks?: string[]; // Networks that are currently active for this strategy
  isActive?: boolean;
}

export interface FeaturedStrategy {
  badge: string;
  title: string;
  description: string;
  stats: {
    apy: string;
    users: string;
    risk: string;
  };
  networks: string[];
}

export interface StrategyData {
  name?: string;
  nodes: Node[];
  edges: Edge[];
  author?: string;
  usage?: number;
  profit?: string;
  category?: string;
  chains?: string[];
  networks?: string[];
}

/**
 * Strategy list metadata
 */
export const strategyList: StrategyMetadata[] = [
  { 
    name: 'Limit Order', 
    author: 'Siphon Team', 
    nodes: 4, 
    usage: 25, 
    profit: '+5.2%', 
    description: 'Set your desired price and wait for the market to reach it. Execute trades at your specified price level for better control.', 
    category: 'trading', 
    chains: ['ethereum', 'base'], 
    networks: ['Ethereum', 'Base'],
    activeNetworks: ['Sepolia'], // Only Sepolia (Ethereum) is active
    isActive: true 
  },
  { 
    name: 'DCA Accumulator', 
    author: 'Siphon Team', 
    nodes: 4, 
    usage: 18, 
    profit: '+2.1%', 
    description: 'Conservative DCA template for testing scheduled recurring buys with small sizes and explicit withdrawal routing.', 
    category: 'trading', 
    chains: ['ethereum', 'base'], 
    networks: ['Ethereum', 'Base'],
    activeNetworks: ['Sepolia'],
    isActive: true
  },
  { 
    name: 'Grid Trading', 
    author: 'Siphon Team', 
    nodes: 4, 
    usage: 14, 
    profit: '+3.4%', 
    description: 'Range-based grid strategy template with bounded low/high levels and moderate grid count for safer test execution.', 
    category: 'trading', 
    chains: ['ethereum', 'base'], 
    networks: ['Ethereum', 'Base'],
    activeNetworks: ['Sepolia'],
    isActive: true
  },
];

/**
 * Featured strategies data
 */
export const featuredStrategies: FeaturedStrategy[] = [
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

/**
 * Create Limit Order strategy nodes and edges
 */
export const createLimitOrderStrategy = (): { nodes: Node[]; edges: Edge[] } => {
  const limitOrderNodes: Node[] = [
    {
      id: 'deposit-1',
      type: 'custom',
      position: { x: 100, y: 200 },
      data: {
        label: 'Deposit',
        type: 'deposit',
        coin: 'USDC',
        amount: '1000',
        chain: 'Ethereum'
      },
      style: {
        background: 'rgba(255, 255, 255, 0.12)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
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
    },
    {
      id: 'strategy-1',
      type: 'custom',
      position: { x: 400, y: 200 },
      data: {
        label: 'Limit Order',
        type: 'strategy',
        strategy: 'Limit Order',
        priceGoal: '1.05',
        intervals: '1h'
      },
      style: {
        background: 'rgba(255, 193, 7, 0.2)',
        border: '1px solid rgba(255, 193, 7, 0.5)',
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
    },
    {
      id: 'swap-1',
      type: 'custom',
      position: { x: 700, y: 200 },
      data: {
        label: 'Swap',
        type: 'swap',
        coin: 'USDC',
        toCoin: 'ETH',
        amount: '1000',
        dex: 'Uniswap'
      },
      style: {
        background: 'rgba(255, 255, 255, 0.12)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
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
    },
    {
      id: 'withdraw-1',
      type: 'custom',
      position: { x: 1000, y: 200 },
      data: {
        label: 'Withdraw',
        type: 'withdraw',
        coin: 'ETH',
        amount: '0.5',
        wallet: '0x...'
      },
      style: {
        background: 'rgba(255, 255, 255, 0.12)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
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
    }
  ];
  
  const limitOrderEdges: Edge[] = [
    {
      id: 'e-deposit-strategy',
      source: 'deposit-1',
      target: 'strategy-1',
      type: 'smoothstep',
      animated: true
    },
    {
      id: 'e-strategy-swap',
      source: 'strategy-1',
      target: 'swap-1',
      type: 'smoothstep',
      animated: true
    },
    {
      id: 'e-swap-withdraw',
      source: 'swap-1',
      target: 'withdraw-1',
      type: 'smoothstep',
      animated: true
    }
  ];
  
  return { nodes: limitOrderNodes, edges: limitOrderEdges };
};

/**
 * Create other strategy nodes and edges
 */
export const createOtherStrategies = (): Record<string, StrategyData> => {
  const timestamp1 = Date.now();
  const timestamp2 = Date.now() + 1000;
  const timestamp3 = Date.now() + 2000;
  const timestamp4 = Date.now() + 3000;
  
  return {
    'DCA Accumulator (Safe Test)': {
      name: 'DCA Accumulator (Safe Test)',
      nodes: [
        {
          id: `deposit-${timestamp1}`,
          type: 'custom',
          position: { x: 100, y: 200 },
          data: {
            label: 'Deposit',
            type: 'deposit',
            chain: 'Sepolia',
            coin: 'USDC',
            amount: '300'
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
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
            label: 'DCA',
            type: 'strategy',
            strategy: 'DCA',
            intervals: '1 day'
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
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
            label: 'Swap',
            type: 'swap',
            dex: 'Uniswap',
            coin: 'USDC',
            toCoin: 'ETH',
            amount: '300'
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
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
            label: 'Withdraw',
            type: 'withdraw',
            chain: 'Sepolia',
            coin: 'ETH',
            amount: '0.1',
            wallet: '0x...'
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
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
    'Grid Trading (Safe Test)': {
      name: 'Grid Trading (Safe Test)',
      nodes: [
        {
          id: `deposit-${timestamp1 + 10000}`,
          type: 'custom',
          position: { x: 100, y: 200 },
          data: {
            label: 'Deposit',
            type: 'deposit',
            chain: 'Sepolia',
            coin: 'USDC',
            amount: '1200'
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            background: 'rgba(255, 255, 255, 0.12)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white'
          }
        },
        {
          id: `strategy-${timestamp2 + 10000}`,
          type: 'custom',
          position: { x: 400, y: 200 },
          data: {
            label: 'Range',
            type: 'strategy',
            strategy: 'Range',
            rangeLow: '2600',
            rangeHigh: '3200',
            gridLevels: '5'
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            background: 'rgba(255, 193, 7, 0.2)',
            border: '1px solid rgba(255, 193, 7, 0.5)',
            color: 'white'
          }
        },
        {
          id: `swap-${timestamp3 + 10000}`,
          type: 'custom',
          position: { x: 700, y: 200 },
          data: {
            label: 'Swap',
            type: 'swap',
            dex: 'Uniswap',
            coin: 'USDC',
            toCoin: 'ETH',
            amount: '1200'
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            background: 'rgba(255, 255, 255, 0.12)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white'
          }
        },
        {
          id: `withdraw-${timestamp4 + 20000}`,
          type: 'custom',
          position: { x: 1000, y: 200 },
          data: {
            label: 'Withdraw',
            type: 'withdraw',
            chain: 'Sepolia',
            coin: 'ETH',
            amount: '0.2',
            wallet: '0x...'
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
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
          id: `xy-edge__swap-${timestamp3 + 10000}-withdraw-${timestamp4 + 20000}`,
          source: `swap-${timestamp3 + 10000}`,
          target: `withdraw-${timestamp4 + 20000}`,
          type: 'smoothstep',
          style: { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }
        }
      ]
    }
  };
};

/**
 * Initialize Limit Order strategy in localStorage
 */
export const initializeLimitOrderStrategy = (): void => {
  const discoverStrategiesKey = 'siphon-discover-strategies';
  const stored = localStorage.getItem(discoverStrategiesKey);
  let discoverStrategies: Record<string, StrategyData> = {};
  
  if (stored) {
    try {
      discoverStrategies = JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse discover strategies:', error);
    }
  }
  
  // Only initialize if Limit Order doesn't exist
  if (!discoverStrategies['Limit Order']) {
    const { nodes, edges } = createLimitOrderStrategy();
    
    discoverStrategies['Limit Order'] = {
      nodes,
      edges,
      author: 'Siphon Team',
      usage: 25,
      profit: '+5.2%',
      category: 'trading',
      chains: ['base', 'ethereum', 'solana', 'btc'],
      networks: ['Base', 'Ethereum', 'Solana', 'Bitcoin']
    };
    
    localStorage.setItem(discoverStrategiesKey, JSON.stringify(discoverStrategies));
  }
};

/**
 * Initialize all discover strategies in localStorage
 */
export const initializeDiscoverStrategies = (): void => {
  const discoverStrategiesKey = 'siphon-discover-strategies';
  const stored = localStorage.getItem(discoverStrategiesKey);

  const templates = createOtherStrategies();
  if (!stored) {
    localStorage.setItem(discoverStrategiesKey, JSON.stringify(templates));
    return;
  }

  try {
    const current = JSON.parse(stored) as Record<string, StrategyData>;
    const merged: Record<string, StrategyData> = { ...current };
    Object.entries(templates).forEach(([name, strategy]) => {
      if (!merged[name]) {
        merged[name] = strategy;
      }
    });
    localStorage.setItem(discoverStrategiesKey, JSON.stringify(merged));
  } catch {
    localStorage.setItem(discoverStrategiesKey, JSON.stringify(templates));
  }
};


