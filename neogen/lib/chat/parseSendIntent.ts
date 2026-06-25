export type SendIntentPrefill = {
  amount: string;
  symbol: "ETH";
  toAddress: string;
};

/** Native ETH transfer parsed from chat, e.g. "send 0.001 eth to 0x…". */
export function parseSendIntent(query: string): SendIntentPrefill | null {
  const m = query.trim().match(
    /\b(?:send|transfer)\s+([0-9]+(?:\.[0-9]+)?)\s*(?:eth|ether)\b[\s\S]*?(0x[a-fA-F0-9]{40})\b/i,
  );
  if (!m) return null;
  return {
    amount: m[1],
    symbol: "ETH",
    toAddress: m[2],
  };
}

export function looksLikeSendQuery(query: string): boolean {
  return parseSendIntent(query) !== null;
}
