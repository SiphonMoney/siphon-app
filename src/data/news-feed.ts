export type MockNewsItem = {
  id: string;
  title: string;
  excerpt: string;
  source: string;
  time: string;
};

export const mockNews: MockNewsItem[] = [
  {
    id: "n1",
    title: "ETH staking inflows climb as L2 fees compress",
    excerpt: "Restaking and L2 adoption continue to reshape yield curves across majors.",
    source: "DeFi Pulse",
    time: "12m ago",
  },
  {
    id: "n2",
    title: "Stablecoin velocity ticks up on Base and Arbitrum",
    excerpt: "Bridged USDC volumes rose week-over-week across major L2 networks.",
    source: "On-chain",
    time: "38m ago",
  },
  {
    id: "n3",
    title: "Funding rates normalize after volatile macro session",
    excerpt: "Perp basis compressed as spot led the recovery into the close.",
    source: "Markets",
    time: "1h ago",
  },
  {
    id: "n4",
    title: "Layer-2 TVL hits new highs amid bridge activity",
    excerpt: "Capital rotation favors low-fee environments with deep liquidity.",
    source: "L2Beat",
    time: "2h ago",
  },
];
