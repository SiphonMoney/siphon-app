import {
  DEFAULT_CHAIN,
  DEFAULT_DEX,
  STRATEGY_KEYWORDS,
  isActiveToken,
  normalizeToken,
} from "./blocks";
import { defaultSideForKind } from "../lib/strategySpec";
import type { ParsedPrompt, StrategyKind, StrategySide } from "./types";

const TOKEN_PATTERN = /\b(eth|usdc|usdt|wbtc|sol|xmr)\b/gi;
const WALLET_PATTERN = /0x[a-fA-F0-9]{40}/;
const AMOUNT_PATTERN = /\b(\d+(?:\.\d+)?)\s*(eth|usdc|usdt|wbtc|sol|xmr)?\b/i;
const PRICE_PATTERN =
  /(?:at|@|price(?:\s+goal)?|hits?|reach(?:es)?|above|below|target|stop)\s*\$?(\d+(?:\.\d+)?)/i;
const RANGE_PATTERN =
  /(?:between|from)\s*\$?(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*\$?(\d+(?:\.\d+)?)/i;
const GRID_PATTERN = /(\d+)\s*(?:grid|levels?|steps?)/i;
const SLICE_PATTERN = /(\d+)\s*slices?/i;
const INTERVAL_SEC_PATTERN = /every\s+(\d+)\s*(?:s|sec|secs|second|seconds|min|mins|minute|minutes)/i;
const INTERVAL_PATTERN = /every\s+(\d+\s*(?:h|hr|hrs|hour|hours|d|day|days|w|week|weeks))/i;
const SLIPPAGE_PATTERN = /(\d+(?:\.\d+)?)\s*(?:%|bps)\s*slippage/i;

function detectStrategy(prompt: string): StrategyKind {
  for (const entry of STRATEGY_KEYWORDS) {
    if (entry.patterns.some((pattern) => pattern.test(prompt))) {
      return entry.kind;
    }
  }
  return "Limit Order";
}

function detectSide(prompt: string, strategy: StrategyKind): StrategySide | null {
  if (/\b(buy|long)\b/i.test(prompt)) return "buy";
  if (/\b(sell|short)\b/i.test(prompt)) return "sell";
  if (strategy === "Limit Order") return null;
  return defaultSideForKind(strategy);
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

function parseIntervalSeconds(prompt: string): string | null {
  const match = prompt.match(INTERVAL_SEC_PATTERN);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[0].toLowerCase();
  if (unit.includes("min")) return String(value * 60);
  return String(value);
}

export function parsePrompt(prompt: string): ParsedPrompt {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const strategy = detectStrategy(trimmed);
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
  const rangeMatch = trimmed.match(RANGE_PATTERN);
  const gridMatch = trimmed.match(GRID_PATTERN);
  const sliceMatch = trimmed.match(SLICE_PATTERN);
  const intervalSecMatch = parseIntervalSeconds(trimmed);
  const intervalMatch = trimmed.match(INTERVAL_PATTERN);
  const slippageMatch = trimmed.match(SLIPPAGE_PATTERN);
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
    strategy,
    side: detectSide(trimmed, strategy),
    depositChain: DEFAULT_CHAIN,
    withdrawChain: DEFAULT_CHAIN,
    dex: DEFAULT_DEX,
    coin,
    toCoin: includeSwap ? toCoin : null,
    amount,
    priceGoal: priceMatch?.[1] ?? null,
    rangeLow: rangeMatch?.[1] ?? null,
    rangeHigh: rangeMatch?.[2] ?? null,
    gridLevels: gridMatch?.[1] ?? null,
    sliceCount: sliceMatch?.[1] ?? null,
    intervalSeconds: intervalSecMatch,
    maxSlippageBps: slippageMatch?.[1] ?? null,
    intervals: intervalMatch?.[1] ?? (lower.includes("dca") ? "1 day" : null),
    wallet: walletMatch?.[0] ?? null,
    includeSwap,
    includeWithdraw: includeWithdraw || Boolean(walletMatch),
  };
}
