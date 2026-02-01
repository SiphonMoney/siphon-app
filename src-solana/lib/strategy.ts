export interface StrategyParams {
  user_id: string;
  strategy_type: string;
  asset_in: string;
  asset_out: string;
  amount: number;
  recipient_address: string;
  price_goal?: number;
}

export async function createStrategy(strategyData: StrategyParams) {
  try {
    const PAYLOAD_URL = process.env.NEXT_PUBLIC_PAYLOAD_GENERATOR_URL || "https://43.207.34.231.sslip.io";
    const apiToken = process.env.NEXT_PUBLIC_API_TOKEN || "";

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (apiToken) {
      headers["X-API-TOKEN"] = apiToken;
    }

    console.log("[Strategy] Creating strategy with FHE encryption...");

    // Send to FHE payload generator which encrypts price bounds and forwards to trade executor
    const payloadResponse = await fetch(`${PAYLOAD_URL}/generatePayload`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: strategyData.user_id,
        strategy_type: strategyData.strategy_type,
        asset_in: strategyData.asset_in,
        asset_out: strategyData.asset_out,
        amount: strategyData.amount,
        upper_bound: strategyData.price_goal || 0,
        lower_bound: 0,
        recipient_address: strategyData.recipient_address,
        zk_proof: {}, // Empty - no ZK proof needed for strategy creation
      }),
    });

    if (!payloadResponse.ok) {
      const text = await payloadResponse.text();
      return { success: false, error: `Strategy creation failed: ${text}` };
    }

    const result = await payloadResponse.json();
    console.log("[Strategy] Strategy created successfully");

    if (result.status === "success") {
      return {
        success: true,
        data: {
          strategy_id: result.payload?.payload_id,
          ...result.payload
        }
      };
    } else {
      return { success: false, error: result.message || "Strategy creation failed" };
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
  status: 'PENDING' | 'EXECUTED' | 'FAILED';
  tx_hash: string | null;
  executed_at: string | null;
  created_at: string;
}

// Get Solana Explorer URL for a transaction
export function getSolanaExplorerUrl(txHash: string, network: string = 'devnet'): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${txHash}${cluster}`;
}

// Fetch user's strategies with execution status and tx_hash
export async function getStrategies(userId: string): Promise<{ success: boolean; strategies?: StrategyStatus[]; error?: string }> {
  try {
    const API_URL = process.env.NEXT_PUBLIC_PAYLOAD_GENERATOR_URL || "https://43.207.34.231.sslip.io";

    const response = await fetch(`${API_URL}/strategies/${userId}`, {
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
