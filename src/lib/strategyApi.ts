import { decryptResult, getStoredClientKey } from "@/lib/fhe";
import { getNetwork, getSelectedChainId } from "@/lib/networks";
import { authorizeExecution } from "@/lib/strategyAuthorizer";
import { getTradeExecutorBaseUrl } from "@/lib/tradeExecutorClient";

export type StrategyStatusValue = "PENDING" | "ARMED" | "EXECUTED" | "FAILED";

export interface StrategyRecord {
  id: string;
  strategy_type: string;
  asset_in: string;
  asset_out: string;
  amount: number;
  status: StrategyStatusValue;
  tx_hash: string | null;
  executed_at: string | null;
  created_at: string;
  encrypted_result?: string | null;
  result_updated_at?: string | null;
}

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const token = process.env.NEXT_PUBLIC_API_TOKEN || "";
  if (token) headers["X-API-TOKEN"] = token;
  return headers;
}

export function getExplorerTxUrl(txHash: string, chainId?: number): string {
  const id = chainId ?? getSelectedChainId();
  const net = getNetwork(id);
  return `${net.explorer}/tx/${txHash}`;
}

export async function getStrategies(
  userId: string,
): Promise<{ success: boolean; strategies?: StrategyRecord[]; error?: string }> {
  try {
    const base = getTradeExecutorBaseUrl();
    const res = await fetch(`${base}/strategies/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text.slice(0, 200) || `HTTP ${res.status}` };
    }
    const json = await res.json();
    if (json.status === "success" && Array.isArray(json.strategies)) {
      return { success: true, strategies: json.strategies };
    }
    return { success: false, error: json.error || "Failed to fetch strategies" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Decrypt ARMED results locally and authorize any that triggered. */
export async function processArmedStrategies(userId: string): Promise<string[]> {
  const clientKey = getStoredClientKey(userId);
  if (!clientKey) return [];

  const { success, strategies } = await getStrategies(userId);
  if (!success || !strategies) return [];

  const executed: string[] = [];
  for (const s of strategies) {
    if (s.status !== "ARMED" || !s.encrypted_result) continue;
    try {
      const triggered = await decryptResult(s.encrypted_result, clientKey);
      if (!triggered) continue;
      const exec = await authorizeExecution(s.id, userId);
      if (!exec.error && exec.status !== "error") executed.push(s.id);
    } catch (e) {
      console.error(`[strategyApi] process ${s.id}:`, e);
    }
  }
  return executed;
}

export function formatStrategyStatus(status: string): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "ARMED":
      return "Armed";
    case "EXECUTED":
      return "Executed";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

export function isActiveStatus(status: string): boolean {
  return status === "PENDING" || status === "ARMED";
}
