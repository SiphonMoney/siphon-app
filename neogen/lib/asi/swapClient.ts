export type SquidSwapPrefillIntent = {
  to_chain_id: number;
  from_token: string;
  to_token: string;
  from_amount_wei: string;
  to_address: string;
  slippage_pct?: number;
  quote_only?: boolean;
};

export type SquidSwapPrefillRequest = {
  wallet_address: string;
  balance_wei: string;
  from_chain_id: number;
  intent: SquidSwapPrefillIntent;
};

export type SwapProvider = "0x" | "squid";
export type SwapPrefillRequest = SquidSwapPrefillRequest & {
  provider?: SwapProvider;
};
export type SwapBestQuoteRequest = SquidSwapPrefillRequest;

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function fetchSwapBestQuote(
  baseUrl: string,
  body: SwapBestQuoteRequest,
  options?: { authBearer?: string },
): Promise<unknown> {
  const res = await fetch(`${trimSlash(baseUrl)}/v1/swap/best-quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.authBearer
        ? { Authorization: `Bearer ${options.authBearer}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Swap best-quote ${res.status}: ${text}`);
  }
  return res.json() as Promise<unknown>;
}

export async function fetchSwapPrefill(
  baseUrl: string,
  body: SwapPrefillRequest,
  options?: { authBearer?: string },
): Promise<unknown> {
  const res = await fetch(`${trimSlash(baseUrl)}/v1/swap/prefill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.authBearer
        ? { Authorization: `Bearer ${options.authBearer}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Swap prefill ${res.status}: ${text}`);
  }
  return res.json() as Promise<unknown>;
}
