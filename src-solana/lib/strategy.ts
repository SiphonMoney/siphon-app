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
    const PAYLOAD_URL = process.env.NEXT_PUBLIC_PAYLOAD_GENERATOR_URL || "http://43.207.34.231:5009";
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
