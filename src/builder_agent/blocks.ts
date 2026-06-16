import type { BlockType, StrategyKind } from "./types";

export const SUPPORTED_TOKENS = ["ETH", "USDC", "SOL", "USDT", "WBTC", "XMR"] as const;
export const ACTIVE_TOKENS = ["ETH", "USDC"] as const;

export const DEFAULT_CHAIN = "Sepolia";
export const DEFAULT_DEX = "Uniswap";

export const CANONICAL_FLOW: BlockType[] = ["deposit", "strategy", "swap", "withdraw"];

export const STRATEGY_KEYWORDS: Array<{ kind: StrategyKind; patterns: RegExp[] }> = [
  {
    kind: "Buy Dip",
    patterns: [/\bbuy\s+dip\b/i, /\bbuy\s+the\s+dip\b/i, /\bbelow\b/i, /\bdip\b/i],
  },
  {
    kind: "Sell Rally",
    patterns: [/\bsell\s+rally\b/i, /\btake\s+profit\b/i, /\brally\b/i, /\bsell\s+when\b/i],
  },
  {
    kind: "DCA",
    patterns: [/\bdca\b/i, /\bdollar[\s-]?cost\b/i, /\bperiodic\b/i, /\bevery\s+\d+/i],
  },
  {
    kind: "Limit Order",
    patterns: [/\blimit\b/i, /\bwhen\s+price\b/i, /\bat\s+\$?\d/i, /\bprice\s+hits?\b/i],
  },
];

export function isActiveToken(symbol: string): boolean {
  return (ACTIVE_TOKENS as readonly string[]).includes(symbol.toUpperCase());
}

export function normalizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return SUPPORTED_TOKENS.includes(upper as (typeof SUPPORTED_TOKENS)[number]) ? upper : null;
}
