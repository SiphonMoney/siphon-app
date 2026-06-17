/**
 * Strategies Data and Utilities
 * 
 * Contains all strategy-related data, metadata, and initialization logic
 */

import { Node, Edge, Position } from '@xyflow/react';
import { layoutStrategyNodes } from '../../../lib/builderLayout';
import { formatGraphForPreview } from '../../../lib/repeatGraph';
import { applySwapToWithdrawLink } from '../../../lib/graphLinks';
import { REPEAT_GROUP_DEFAULT_SIZE, syncRepeatGroups } from '../../../lib/repeatGraph';

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
    description: 'Simple DCA: deposit once, then loop swap + withdraw on a cadence until funds end.', 
    category: 'trading', 
    chains: ['ethereum', 'base'], 
    networks: ['Ethereum', 'Base'],
    activeNetworks: ['Sepolia'],
    isActive: true
  },
  { 
    name: 'Grid Trading', 
    author: 'Siphon Team', 
    nodes: 5, 
    usage: 14, 
    profit: '+3.4%', 
    description: 'Range-based grid strategy with bounded low/high levels and configurable grid count.', 
    category: 'trading', 
    chains: ['ethereum', 'base'], 
    networks: ['Ethereum', 'Base'],
    activeNetworks: [],
    isActive: false
  },
  { 
    name: 'TWAP Executor', 
    author: 'Siphon Team', 
    nodes: 5, 
    usage: 9, 
    profit: '+4.1%', 
    description: 'Slice large orders over time with fixed intervals and slippage controls.', 
    category: 'trading', 
    chains: ['ethereum'], 
    networks: ['Ethereum'],
    activeNetworks: [],
    isActive: false
  },
  { 
    name: 'Range Grid Bot', 
    author: 'Siphon Team', 
    nodes: 6, 
    usage: 11, 
    profit: '+6.8%', 
    description: 'Automated buy/sell legs across a price range — coming soon to the library.', 
    category: 'trading', 
    chains: ['ethereum', 'base'], 
    networks: ['Ethereum', 'Base'],
    activeNetworks: [],
    isActive: false
  },
  { 
    name: 'Stop-Loss Shield', 
    author: 'Siphon Team', 
    nodes: 4, 
    usage: 7, 
    profit: '+1.9%', 
    description: 'Protect downside with trigger-based exits and partial position unwinds.', 
    category: 'trading', 
    chains: ['ethereum'], 
    networks: ['Ethereum'],
    activeNetworks: [],
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

type BlockType = 'deposit' | 'strategy' | 'swap' | 'withdraw' | 'control' | 'repeatGroup';

interface StrategyNodeTemplate {
  id: string;
  x: number;
  y: number;
  parentId?: string;
  nodeType?: 'custom' | 'repeatGroup';
  data: {
    label: string;
    type: BlockType;
    chain?: string;
    coin?: string;
    amount?: string;
    strategy?: string;
    side?: string;
    priceGoal?: string;
    rangeLow?: string;
    rangeHigh?: string;
    gridLevels?: string;
    sliceCount?: string;
    intervalSeconds?: string;
    maxSlippageBps?: string;
    positionPct?: string;
    controlKind?: string;
    repeatMode?: string;
    repeatCount?: string;
    loopIntervalValue?: string;
    loopIntervalUnit?: string;
    loopIntervalSec?: string;
    scheduleTrigger?: string;
    scheduleValue?: string;
    scheduleUnit?: string;
    scheduleDelaySec?: string;
    amountSource?: string;
    linkedFromNodeId?: string;
    dex?: string;
    toCoin?: string;
    wallet?: string;
  };
}

interface StrategyEdgeTemplate {
  source: string;
  target: string;
}

interface StrategyTemplateSpec {
  nodes: StrategyNodeTemplate[];
  edges: StrategyEdgeTemplate[];
}

const BASE_NODE_STYLE = {
  color: 'white',
  borderRadius: '8px',
  padding: '0.75rem',
  minWidth: '200px',
  textAlign: 'center' as const,
  fontFamily: 'var(--font-source-code), monospace',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px'
};

const DEFAULT_NODE_STYLE = {
  ...BASE_NODE_STYLE,
  background: 'rgba(255, 255, 255, 0.12)',
  border: '1px solid rgba(255, 255, 255, 0.3)'
};

const STRATEGY_NODE_STYLE = {
  ...BASE_NODE_STYLE,
  background: 'rgba(255, 193, 7, 0.2)',
  border: '1px solid rgba(255, 193, 7, 0.5)'
};

const CONTROL_NODE_STYLE = {
  ...BASE_NODE_STYLE,
  background: 'rgba(59, 130, 246, 0.2)',
  border: '1px solid rgba(59, 130, 246, 0.5)'
};

const EDGE_STYLE = { stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 };

// Declarative library: graph specs only, composed into existing Build nodes.
const STRATEGY_LIBRARY_SPECS: Record<string, StrategyTemplateSpec> = {
  'Limit Order': {
    nodes: [
      { id: 'deposit', x: 100, y: 200, data: { label: 'Deposit', type: 'deposit', chain: 'Sepolia', coin: 'USDC', amount: '1000' } },
      { id: 'strategy', x: 400, y: 200, data: { label: 'Limit Order', type: 'strategy', strategy: 'Limit Order', priceGoal: '1.05' } },
      { id: 'swap', x: 700, y: 200, data: { label: 'Swap', type: 'swap', dex: 'Uniswap', coin: 'USDC', toCoin: 'ETH', amount: '1000' } },
      { id: 'withdraw', x: 1000, y: 200, data: { label: 'Withdraw', type: 'withdraw', chain: 'Sepolia', coin: 'ETH', amount: '', amountSource: 'output', linkedFromNodeId: 'swap', wallet: '0x...' } },
    ],
    edges: [
      { source: 'deposit', target: 'strategy' },
      { source: 'strategy', target: 'swap' },
      { source: 'swap', target: 'withdraw' },
    ],
  },
  'DCA Accumulator': {
    nodes: [
      { id: 'deposit', x: 100, y: 200, data: { label: 'Deposit', type: 'deposit', chain: 'Sepolia', coin: 'USDC', amount: '300' } },
      {
        id: 'repeat',
        x: 320,
        y: 170,
        nodeType: 'repeatGroup',
        data: {
          label: 'Loop',
          type: 'repeatGroup',
          repeatMode: 'until_funds',
          repeatCount: '',
          loopIntervalValue: '24',
          loopIntervalUnit: 'hours',
          loopIntervalSec: '86400',
        },
      },
      {
        id: 'swap',
        parentId: 'repeat',
        x: 20,
        y: 52,
        data: { label: 'Swap', type: 'swap', dex: 'Uniswap', coin: 'USDC', toCoin: 'ETH', amount: '300' },
      },
      {
        id: 'withdraw',
        parentId: 'repeat',
        x: 230,
        y: 52,
        data: { label: 'Withdraw', type: 'withdraw', chain: 'Sepolia', coin: 'ETH', amount: '', amountSource: 'output', linkedFromNodeId: 'swap', wallet: '0x...' },
      },
    ],
    edges: [
      { source: 'deposit', target: 'repeat' },
      { source: 'swap', target: 'withdraw' },
    ],
  },
  'Grid Trading': {
    nodes: [
      { id: 'deposit', x: 100, y: 200, data: { label: 'Deposit', type: 'deposit', chain: 'Sepolia', coin: 'USDC', amount: '1200' } },
      { id: 'entry', x: 340, y: 200, data: { label: 'Limit Order', type: 'strategy', strategy: 'Limit Order', priceGoal: '2800' } },
      { id: 'exit', x: 560, y: 200, data: { label: 'Take Profit', type: 'strategy', strategy: 'Take Profit', priceGoal: '3050', positionPct: '50' } },
      { id: 'swap', x: 780, y: 200, data: { label: 'Swap', type: 'swap', dex: 'Uniswap', coin: 'USDC', toCoin: 'ETH', amount: '1200' } },
      { id: 'withdraw', x: 1000, y: 200, data: { label: 'Withdraw', type: 'withdraw', chain: 'Sepolia', coin: 'ETH', amount: '', amountSource: 'output', linkedFromNodeId: 'swap', wallet: '0x...' } },
    ],
    edges: [
      { source: 'deposit', target: 'entry' },
      { source: 'entry', target: 'exit' },
      { source: 'exit', target: 'swap' },
      { source: 'swap', target: 'withdraw' },
    ],
  },
};

function composeStrategyGraph(name: string): { nodes: Node[]; edges: Edge[] } {
  const spec = STRATEGY_LIBRARY_SPECS[name];
  if (!spec) return { nodes: [], edges: [] };

  const nodes: Node[] = spec.nodes.map((node) => {
    const isRepeat = node.nodeType === 'repeatGroup' || node.data.type === 'repeatGroup';
    const isStrategy = node.data.type === 'strategy';
    const isControl = node.data.type === 'control';
    const isChild = Boolean(node.parentId);

    return {
      id: node.id,
      type: isRepeat ? 'repeatGroup' : 'custom',
      parentId: node.parentId,
      extent: node.parentId ? 'parent' : undefined,
      position: { x: node.x, y: node.y },
      data: {
        ...node.data,
        childCount: isRepeat
          ? spec.nodes.filter((n) => n.parentId === node.id).length
          : undefined,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      zIndex: isChild ? 10 : isRepeat ? 1 : 0,
      style: isRepeat
        ? {
            width: REPEAT_GROUP_DEFAULT_SIZE.width,
            height: REPEAT_GROUP_DEFAULT_SIZE.height,
            padding: 0,
            background: 'transparent',
            border: 'none',
          }
        : isStrategy
          ? STRATEGY_NODE_STYLE
          : isControl
            ? CONTROL_NODE_STYLE
            : DEFAULT_NODE_STYLE,
    };
  });

  const edges: Edge[] = spec.edges.map((edge, idx) => ({
    id: `xy-edge__${edge.source}-${edge.target}-${idx}`,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    style: EDGE_STYLE,
  }));

  let laidOut = layoutStrategyNodes(nodes, edges);
  for (const edge of spec.edges) {
    laidOut = applySwapToWithdrawLink(laidOut, {
      source: edge.source,
      target: edge.target,
      sourceHandle: null,
      targetHandle: null,
    });
  }

  return { nodes: laidOut, edges };
}

export function formatStrategyGraphForModal(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: formatGraphForPreview(nodes),
    edges,
  };
}

/**
 * Create Limit Order strategy nodes and edges
 */
export const createLimitOrderStrategy = (): { nodes: Node[]; edges: Edge[] } => {
  return composeStrategyGraph('Limit Order');
};

/**
 * Create other strategy nodes and edges
 */
export const createOtherStrategies = (): Record<string, StrategyData> => {
  return {
    'DCA Accumulator': { name: 'DCA Accumulator', ...composeStrategyGraph('DCA Accumulator') },
    'Grid Trading': { name: 'Grid Trading', ...composeStrategyGraph('Grid Trading') },
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

    // Migrate previous template names to current display names.
    if (!merged['DCA Accumulator'] && merged['DCA Accumulator (Safe Test)']) {
      merged['DCA Accumulator'] = merged['DCA Accumulator (Safe Test)'];
    }
    if (!merged['Grid Trading'] && merged['Grid Trading (Safe Test)']) {
      merged['Grid Trading'] = merged['Grid Trading (Safe Test)'];
    }
    delete merged['DCA Accumulator (Safe Test)'];
    delete merged['Grid Trading (Safe Test)'];

    Object.entries(templates).forEach(([name, strategy]) => {
      merged[name] = {
        ...(merged[name] ?? {}),
        ...strategy,
        name,
        nodes: strategy.nodes,
        edges: strategy.edges,
      };
    });
    localStorage.setItem(discoverStrategiesKey, JSON.stringify(merged));
  } catch {
    localStorage.setItem(discoverStrategiesKey, JSON.stringify(templates));
  }
};


