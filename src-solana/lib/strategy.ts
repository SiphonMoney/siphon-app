import { ensureFheReady, encryptBound, decryptResult } from "./fhe";
import { loadClientKey } from "./fheKeyStore";

export interface StrategyParams {
  user_id: string;
  strategy_type: string;
  asset_in: string;
  asset_out: string;
  amount: number;
  recipient_address: string;
  price_goal?: number;
}

// Single backend host (Caddy routes /createStrategy, /strategies, /uploadServerKey, etc. to
// the trade-executor). The payload-generator is no longer used — encryption happens in-browser.
export const API_BASE = process.env.NEXT_PUBLIC_PAYLOAD_GENERATOR_URL || "https://35.177.18.115.sslip.io";

export async function createStrategy(strategyData: StrategyParams) {
  try {
    const apiToken = process.env.NEXT_PUBLIC_API_TOKEN || "";
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (apiToken) headers["X-API-TOKEN"] = apiToken;

    console.log("[Strategy] Encrypting bounds in-browser (client-side FHE)...");

    // 1) Ensure we have a client key locally and the server key is uploaded (one-time).
    const clientKey = await ensureFheReady(strategyData.user_id, API_BASE);

    // 2) Encrypt price bounds locally. The plaintext bounds never leave the browser.
    const [encryptedUpper, encryptedLower] = await Promise.all([
      encryptBound(strategyData.price_goal || 0, clientKey),
      encryptBound(0, clientKey),
    ]);

    // 3) Send ciphertext (no keys) straight to the trade-executor.
    const response = await fetch(`${API_BASE}/createStrategy`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: strategyData.user_id,
        strategy_type: strategyData.strategy_type,
        asset_in: strategyData.asset_in,
        asset_out: strategyData.asset_out,
        amount: strategyData.amount,
        recipient_address: strategyData.recipient_address,
        encrypted_upper_bound: encryptedUpper,
        encrypted_lower_bound: encryptedLower,
        zk_proof: {},
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Strategy creation failed: ${text}` };
    }

    const result = await response.json();
    console.log("[Strategy] Strategy created successfully");

    if (result.status === "success") {
      return { success: true, data: { strategy_id: result.strategy_id } };
    } else {
      return { success: false, error: result.error || result.message || "Strategy creation failed" };
    }
  } catch (error: unknown) {
    console.error("[Strategy] Failed to create strategy:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Interface for strategy status from backend
export interface StrategyStatus {
  id: string;
  strategy_type: string;
  asset_in: string;
  asset_out: string;
  amount: number;
  status: 'PENDING' | 'ARMED' | 'EXECUTED' | 'FAILED';
  tx_hash: string | null;
  executed_at: string | null;
  created_at: string;
  // Latest encrypted evaluation result (hex). The browser decrypts this locally.
  encrypted_result?: string | null;
  result_updated_at?: string | null;
}

// Get Solana Explorer URL for a transaction
export function getSolanaExplorerUrl(txHash: string, network: string = 'devnet'): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${txHash}${cluster}`;
}

// Fetch user's strategies with execution status and tx_hash
export async function getStrategies(userId: string): Promise<{ success: boolean; strategies?: StrategyStatus[]; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/strategies/${userId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Failed to fetch strategies: ${text}` };
    }

    const result = await response.json();

    if (result.status === "success") {
      return { success: true, strategies: result.strategies };
    } else {
      return { success: false, error: result.error || "Failed to fetch strategies" };
    }
  } catch (error: unknown) {
    console.error("[Strategy] Failed to fetch strategies:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Browser-in-the-loop execution. The FHE engine can only produce an ENCRYPTED trigger result,
 * so the browser must decrypt it and authorize execution. Call this on a poll (e.g. every few
 * seconds while the dashboard is open): it fetches the user's strategies, decrypts the result
 * of each ARMED one locally with the client key, and calls /executeStrategy for any that
 * triggered. Returns the ids it authorized for execution.
 *
 * Requires the client key to already exist locally (it does once the user has created a
 * strategy from this browser). Strategies created on a different device cannot be executed here.
 */
export async function processArmedStrategies(userId: string): Promise<string[]> {
  const clientKey = await loadClientKey(userId);
  if (!clientKey) return []; // no local key on this device — nothing we can decrypt

  const { success, strategies } = await getStrategies(userId);
  if (!success || !strategies) return [];

  const executed: string[] = [];
  for (const s of strategies) {
    if (s.status !== "ARMED" || !s.encrypted_result) continue;
    try {
      const triggered = await decryptResult(s.encrypted_result, clientKey);
      if (!triggered) continue;

      console.log(`[Strategy] ${s.id} triggered — authorizing execution...`);
      const res = await fetch(`${API_BASE}/executeStrategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: s.id, user_id: userId }),
      });
      if (res.ok) executed.push(s.id);
      else console.error(`[Strategy] executeStrategy failed for ${s.id}: ${await res.text()}`);
    } catch (e) {
      console.error(`[Strategy] Failed to process ${s.id}:`, e);
    }
  }
  return executed;
}
