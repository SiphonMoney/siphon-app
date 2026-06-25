export type MockCoin = {
  rank: number;
  symbol: string;
  name: string;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  volume24h: string;
  marketCap: string;
  sparkUp: boolean;
};

export const mockCoins: MockCoin[] = [
  { rank: 1, symbol: "BTC", name: "Bitcoin", price: 98420, change1h: 0.2, change24h: 1.2, change7d: 4.5, volume24h: "$42B", marketCap: "$1.9T", sparkUp: true },
  { rank: 2, symbol: "ETH", name: "Ethereum", price: 3420, change1h: -0.1, change24h: -0.4, change7d: 2.1, volume24h: "$18B", marketCap: "$410B", sparkUp: false },
  { rank: 3, symbol: "SOL", name: "Solana", price: 178.5, change1h: 0.8, change24h: 3.1, change7d: 8.2, volume24h: "$4.2B", marketCap: "$82B", sparkUp: true },
  { rank: 4, symbol: "BNB", name: "BNB", price: 612, change1h: 0.1, change24h: 0.6, change7d: 1.8, volume24h: "$1.8B", marketCap: "$94B", sparkUp: true },
  { rank: 5, symbol: "XRP", name: "XRP", price: 2.45, change1h: -0.3, change24h: -1.2, change7d: -2.4, volume24h: "$2.1B", marketCap: "$140B", sparkUp: false },
  { rank: 6, symbol: "USDC", name: "USD Coin", price: 1.0, change1h: 0, change24h: 0, change7d: 0, volume24h: "$8B", marketCap: "$34B", sparkUp: true },
];

export function top4ByMarketCap(coins: MockCoin[]) {
  return [...coins].sort((a, b) => a.rank - b.rank).slice(0, 4);
}

export function top4Movers24h(coins: MockCoin[]) {
  return [...coins].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 4);
}

export function top4Trending(coins: MockCoin[]) {
  return [...coins].sort((a, b) => b.change7d - a.change7d).slice(0, 4);
}
