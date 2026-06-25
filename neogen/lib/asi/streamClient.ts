export type AsiHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AsiQueryOptions = {
  baseUrl?: string;
  query: string;
  history?: AsiHistoryTurn[];
  conversationId?: string | null;
  authBearer?: string;
};

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getDefaultAsiBaseUrl(): string {
  const fromPublic =
    process.env.NEXT_PUBLIC_ASI_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_ASI_API?.trim();
  return fromPublic ?? "";
}

export type AsiQueryStreamOptions = AsiQueryOptions & {
  onEvent: (ev: Record<string, unknown>) => void;
  enablePriceWidget?: boolean;
  enableOpportunitiesWidget?: boolean;
  walletAddress?: string | null;
  walletChainId?: number | null;
  enableWalletWidget?: boolean;
  enableMcpEnrichment?: boolean;
  mcpServer?: string | null;
};

export async function asiQueryStream({
  onEvent,
  baseUrl = getDefaultAsiBaseUrl(),
  query,
  history = [],
  conversationId = null,
  authBearer,
  enablePriceWidget = true,
  enableOpportunitiesWidget = true,
  walletAddress = null,
  walletChainId = null,
  enableWalletWidget = true,
  enableMcpEnrichment = false,
  mcpServer = null,
}: AsiQueryStreamOptions) {
  if (!baseUrl) {
    throw new Error("Set NEXT_PUBLIC_ASI_API_BASE_URL or pass baseUrl");
  }
  const body: Record<string, unknown> = {
    query,
    history: history ?? [],
    ...(conversationId ? { conversation_id: conversationId } : {}),
    enable_price_widget: enablePriceWidget,
    enable_opportunities_widget: enableOpportunitiesWidget,
    enable_wallet_widget: enableWalletWidget,
    enable_mcp_enrichment: enableMcpEnrichment,
    ...(mcpServer ? { mcp_server: mcpServer } : {}),
    ...(walletAddress ? { wallet_address: walletAddress } : {}),
    ...(walletChainId != null ? { wallet_chain_id: walletChainId } : {}),
  };
  const res = await fetch(`${trimSlash(baseUrl)}/v1/channel/web/query/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(authBearer ? { Authorization: `Bearer ${authBearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ASI stream ${res.status}: ${text}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const block of parts) {
      const line = block.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
      try {
        onEvent(JSON.parse(json.trim()) as Record<string, unknown>);
      } catch {
        // keep stream alive on malformed frames
      }
    }
  }
}
