import { decryptResult, getStoredClientKey } from "@/lib/fhe";
import { getNetwork, getSelectedChainId } from "@/lib/networks";
import { authorizeExecution, fetchStrategyResult } from "@/lib/strategyAuthorizer";
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
  has_encrypted_result?: boolean;
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

/** IDs currently being submitted to /executeStrategy (dedupe across pollers). */
const executingIds = new Set<string>();

/** Decrypt ARMED results locally and authorize any that triggered. */
export async function processArmedStrategies(userId: string): Promise<string[]> {
  const clientKey = getStoredClientKey(userId);
  if (!clientKey) {
    console.warn("[strategyApi] No FHE client key on this device — cannot decrypt ARMED results.");
    return [];
  }

  const { success, strategies } = await getStrategies(userId);
  if (!success || !strategies) return [];

  const armed = strategies.filter((s) => s.status === "ARMED");
  const executed: string[] = [];

  for (const s of armed) {
    if (executingIds.has(s.id)) continue;
    try {
      const result = await fetchStrategyResult(s.id);
      if (!result.encrypted_result) continue;

      const triggered = await decryptResult(result.encrypted_result, clientKey);
      console.log(`[strategyApi] ${s.id.slice(0, 8)}… decrypt → ${triggered ? "TRIGGERED" : "not yet"}`);

      if (!triggered) continue;

      executingIds.add(s.id);
      console.log(`[strategyApi] ${s.id} triggered — calling /executeStrategy…`);
      try {
        const exec = await authorizeExecution(s.id, userId);
        if (exec.error || exec.status === "error") {
          console.error(`[strategyApi] execute failed for ${s.id}:`, exec.error);
          continue;
        }
        executed.push(s.id);
      } finally {
        executingIds.delete(s.id);
      }
    } catch (e) {
      executingIds.delete(s.id);
      console.error(`[strategyApi] process ${s.id}:`, e);
    }
  }
  return executed;
}

/** Manually try to authorize one ARMED strategy (user-initiated). */
export async function tryAuthorizeStrategy(
  strategyId: string,
  userId: string,
): Promise<{ ok: boolean; txHash?: string; error?: string; triggered?: boolean }> {
  const clientKey = getStoredClientKey(userId);
  if (!clientKey) {
    return { ok: false, error: "No FHE key on this device. Re-submit from the same browser." };
  }
  try {
    const result = await fetchStrategyResult(strategyId);
    if (!result.encrypted_result) {
      return { ok: false, error: "Waiting for scheduler evaluation…" };
    }
    const triggered = await decryptResult(result.encrypted_result, clientKey);
    if (!triggered) {
      return { ok: false, triggered: false, error: "Price condition not met yet (decrypted locally)." };
    }
    const exec = await authorizeExecution(strategyId, userId);
    if (exec.error || exec.status === "error") {
      return { ok: false, error: exec.error || "Execution failed" };
    }
    return { ok: true, txHash: exec.tx_hash, triggered: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
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
