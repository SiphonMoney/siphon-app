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
    chains: ['base', 'ethereum', 'solana', 'btc'], 
    networks: ['Base', 'Ethereum', 'Solana', 'Bitcoin'], 
    isActive: true 
  },
  { 
    name: 'Buy High - Sell Low', 
    author: '0x1234...5678', 
    nodes: 2, 
    usage: 12, 
    profit: '-99.9%', 
    description: 'The ultimate contrarian strategy. Buy at peaks, sell at valleys. Maximum loss, maximum style.', 
    category: 'trading', 
    chains: ['arbitrage', 'ethereum'], 
    networks: ['Ethereum', 'Base'], 
    isActive: false 
  },
  { 
    name: 'DCA to Oblivion', 
    author: '0xabcd...efgh', 
    nodes: 4, 
    usage: 8, 
    profit: '+0.0%', 
    description: 'Dollar-cost average forever. Never stop buying. Never check the price. Just keep going.', 
    category: 'trading', 
    chains: ['yields', 'base'], 
    networks: ['Solana', 'Ethereum'], 
    isActive: false 
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
export const createOtherStrategies = (): Record<string, any> => {
  const timestamp1 = Date.now();
  const timestamp2 = Date.now() + 1000;
  const timestamp3 = Date.now() + 2000;
  const timestamp4 = Date.now() + 3000;
  
  return {
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
};

/**
 * Initialize Limit Order strategy in localStorage
 */
export const initializeLimitOrderStrategy = (): void => {
  const discoverStrategiesKey = 'siphon-discover-strategies';
  const stored = localStorage.getItem(discoverStrategiesKey);
  let discoverStrategies: Record<string, any> = {};
  
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
  
  if (!stored) {
    // Create mock strategy data with nodes and edges matching the actual structure
    const otherStrategies = createOtherStrategies();
    
    localStorage.setItem(discoverStrategiesKey, JSON.stringify(otherStrategies));
  }
};


