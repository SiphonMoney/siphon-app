import type { StrategyKind } from "../lib/strategySpec";
import type { BlockType } from "./types";

export const SUPPORTED_TOKENS = ["ETH", "USDC", "SOL", "USDT", "WBTC", "XMR"] as const;
export const ACTIVE_TOKENS = ["ETH", "USDC"] as const;

export const DEFAULT_CHAIN = "Sepolia";
export const DEFAULT_DEX = "Uniswap";

export const CANONICAL_FLOW: BlockType[] = ["deposit", "strategy", "swap", "withdraw"];

export const STRATEGY_KEYWORDS: Array<{ kind: StrategyKind; patterns: RegExp[] }> = [
  {
    kind: "Stop Loss",
    patterns: [/\bstop[\s-]?loss\b/i, /\bstop\s+out\b/i, /\bprotect\s+downside\b/i],
  },
  {
    kind: "Take Profit",
    patterns: [
      /\btake[\s-]?profit\b/i,
      /\bprofit\s+target\b/i,
      /\block\s+in\s+gains\b/i,
      /\bsell\s+rally\b/i,
      /\bsell\s+when\b/i,
    ],
  },
  {
    kind: "Range",
    patterns: [/\brange\b/i, /\bgrid\b/i, /\bbetween\s+\$?\d/i, /\bprice\s+band\b/i],
  },
  {
    kind: "TWAP",
    patterns: [/\btwap\b/i, /\btime[\s-]?weighted\b/i, /\bover\s+\d+\s*(?:min|hour|h)/i, /\bslices?\b/i],
  },
  {
    kind: "Limit Order",
    patterns: [
      /\blimit\b/i,
      /\bwhen\s+price\b/i,
      /\bat\s+\$?\d/i,
      /\bprice\s+hits?\b/i,
      /\bbuy\s+(?:the\s+)?dip\b/i,
    ],
  },
  {
    kind: "DCA",
    patterns: [/\bdca\b/i, /\bdollar[\s-]?cost\b/i, /\bperiodic\b/i, /\bevery\s+\d+/i],
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
