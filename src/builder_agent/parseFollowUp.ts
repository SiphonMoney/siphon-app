import { isActiveToken, normalizeToken } from "./blocks";
import type { MissingField, ParsedPrompt, StrategySide } from "./types";

const TOKEN_PATTERN = /\b(eth|usdc|usdt|wbtc|sol|xmr)\b/i;
const WALLET_PATTERN = /0x[a-fA-F0-9]{40}/;
const NUMBER_PATTERN = /\d+(?:\.\d+)?/;

function extractToken(answer: string): string | null {
  const match = answer.match(TOKEN_PATTERN);
  return match ? normalizeToken(match[1]) : normalizeToken(answer.trim());
}

function parseSide(answer: string): StrategySide | null {
  const lower = answer.toLowerCase();
  if (/\b(buy|long)\b/.test(lower)) return "buy";
  if (/\b(sell|short)\b/.test(lower)) return "sell";
  return null;
}

export function applyFollowUpAnswer(
  field: MissingField,
  answer: string,
  parsed: ParsedPrompt
): ParsedPrompt {
  const trimmed = answer.trim();
  const next: ParsedPrompt = { ...parsed };

  switch (field) {
    case "coin":
    case "inactiveToken": {
      const token = extractToken(trimmed);
      if (token && (field === "inactiveToken" ? isActiveToken(token) : true)) {
        next.coin = token;
      }
      break;
    }
    case "amount": {
      const match = trimmed.match(NUMBER_PATTERN);
      if (match) next.amount = match[0];
      break;
    }
    case "side": {
      const side = parseSide(trimmed);
      if (side) next.side = side;
      break;
    }
    case "priceGoal":
    case "rangeLow":
    case "rangeHigh":
    case "gridLevels":
    case "sliceCount":
    case "intervalSeconds": {
      const match = trimmed.match(NUMBER_PATTERN);
      if (match) next[field] = match[0];
      break;
    }
    case "intervals": {
      const intervalMatch = trimmed.match(
        /every\s+(\d+\s*(?:h|hr|hrs|hour|hours|d|day|days|w|week|weeks))/i
      );
      next.intervals = intervalMatch?.[1] ?? trimmed;
      break;
    }
    case "toCoin": {
      const token = extractToken(trimmed);
      if (token) next.toCoin = token;
      break;
    }
    case "wallet": {
      const walletMatch = trimmed.match(WALLET_PATTERN);
      if (walletMatch) next.wallet = walletMatch[0];
      break;
    }
  }

  next.raw = `${parsed.raw}\n${trimmed}`.trim();
  return next;
}

export function applyIntentFromMessage(
  message: string,
  parsed: ParsedPrompt
): ParsedPrompt {
  const walletMatch = message.match(WALLET_PATTERN);
  const side = parseSide(message);

  return {
    ...parsed,
    side: parsed.side ?? side,
    includeSwap:
      parsed.includeSwap ||
      /\b(swap|convert|exchange)\b/i.test(message),
    includeWithdraw:
      parsed.includeWithdraw ||
      /\b(withdraw|send\s+to)\b/i.test(message) ||
      (/\bwallet\b/i.test(message) && Boolean(walletMatch)),
    wallet: parsed.wallet ?? walletMatch?.[0] ?? null,
  };
}

export function mergeParsed(
  base: ParsedPrompt,
  patch: Partial<ParsedPrompt>
): ParsedPrompt {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== null && value !== undefined)
    ),
  } as ParsedPrompt;
}
