export async function createStrategy(strategyData: unknown) {
  try {
    // Use localhost instead of 0.0.0.0 (browsers can't connect to 0.0.0.0)
    const BASE_URL = process.env.NEXT_PUBLIC_PAYLOAD_GENERATOR_URL || "http://localhost:5009";
    // Get API token from environment (for production)
    const apiToken = process.env.NEXT_PUBLIC_API_TOKEN || "";
    
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    
    if (apiToken) {
      headers["X-API-TOKEN"] = apiToken;
    }
    
    const response = await fetch(`${BASE_URL}/generatePayload`, {
      method: "POST",
      headers,
      body: JSON.stringify(strategyData),
    });

    const text = await response.text();

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = JSON.parse(text);
    console.log("Payload Generator response:", data);
    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to call payload generator:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}