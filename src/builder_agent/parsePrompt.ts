import {
  DEFAULT_CHAIN,
  DEFAULT_DEX,
  STRATEGY_KEYWORDS,
  isActiveToken,
  normalizeToken,
} from "./blocks";
import type { ParsedPrompt, StrategyKind } from "./types";

const TOKEN_PATTERN = /\b(eth|usdc|usdt|wbtc|sol|xmr)\b/gi;
const WALLET_PATTERN = /0x[a-fA-F0-9]{40}/;
const AMOUNT_PATTERN = /\b(\d+(?:\.\d+)?)\s*(eth|usdc|usdt|wbtc|sol|xmr)?\b/i;
const PRICE_PATTERN =
  /(?:at|@|price(?:\s+goal)?|hits?|reach(?:es)?|above|below|target)\s*\$?(\d+(?:\.\d+)?)/i;
const INTERVAL_PATTERN = /every\s+(\d+\s*(?:h|hr|hrs|hour|hours|d|day|days|w|week|weeks))/i;

function detectStrategy(prompt: string): StrategyKind {
  for (const entry of STRATEGY_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(prompt))) {
      return entry.kind;
    }
  }
  return "Limit Order";
}

function extractTokens(prompt: string): string[] {
  const matches = [...prompt.matchAll(TOKEN_PATTERN)];
  const tokens = matches
    .map((match) => normalizeToken(match[1]))
    .filter((token): token is string => Boolean(token));
  return [...new Set(tokens)];
}

function pickTradableToken(tokens: string[]): string | null {
  const active = tokens.find((token) => isActiveToken(token));
  return active ?? tokens[0] ?? null;
}

export function parsePrompt(prompt: string): ParsedPrompt {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const tokens = extractTokens(trimmed);
  const coin = pickTradableToken(tokens);
  const toCoin =
    tokens.find((token) => token !== coin && isActiveToken(token)) ??
    (coin === "ETH" ? "USDC" : coin === "USDC" ? "ETH" : null);

  const amountMatch = trimmed.match(AMOUNT_PATTERN);
  const amountToken = amountMatch?.[2] ? normalizeToken(amountMatch[2]) : null;
  const amount =
    amountMatch?.[1] ??
    (amountToken && amountToken === coin ? amountMatch?.[1] : null) ??
    null;

  const priceMatch = trimmed.match(PRICE_PATTERN);
  const intervalMatch = trimmed.match(INTERVAL_PATTERN);
  const walletMatch = trimmed.match(WALLET_PATTERN);

  const includeSwap =
    /\bswap\b/i.test(trimmed) ||
    /\bconvert\b/i.test(trimmed) ||
    /\bexchange\b/i.test(trimmed) ||
    Boolean(toCoin && coin && toCoin !== coin);

  const includeWithdraw =
    /\bwithdraw\b/i.test(trimmed) ||
    /\bsend\s+to\b/i.test(trimmed) ||
    /\bwallet\b/i.test(trimmed) ||
    Boolean(walletMatch);

  return {
    raw: trimmed,
    strategy: detectStrategy(trimmed),
    depositChain: DEFAULT_CHAIN,
    withdrawChain: DEFAULT_CHAIN,
    dex: DEFAULT_DEX,
    coin,
    toCoin: includeSwap ? toCoin : null,
    amount,
    priceGoal: priceMatch?.[1] ?? null,
    intervals: intervalMatch?.[1] ?? (lower.includes("dca") ? "1 day" : null),
    wallet: walletMatch?.[0] ?? null,
    includeSwap,
    includeWithdraw: includeWithdraw || Boolean(walletMatch),
  };
}
