/**
 * Base URL for trade-executor API calls.
 *
 * The browser calls the trade-executor DIRECTLY (CORS is configured for the app origin),
 * NOT through the Next.js `/api/trade-executor` proxy. Vercel serverless functions cap the
 * request body at ~4.5MB, so routing large FHE payloads through the proxy fails with HTTP 413.
 *
 * Set `NEXT_PUBLIC_TRADE_EXECUTOR_URL` for a custom host (e.g. `http://localhost:5005` in dev).
 */
export const DEFAULT_TRADE_EXECUTOR_URL = "https://3-81-144-108.sslip.io";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getTradeExecutorBaseUrl(): string {
  const fromEnv = normalizeBaseUrl(
    process.env.TRADE_EXECUTOR_URL ||
      process.env.NEXT_PUBLIC_TRADE_EXECUTOR_URL ||
      "",
  );

  if (typeof window !== "undefined") {
    const browserUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_TRADE_EXECUTOR_URL || "");
    return browserUrl || DEFAULT_TRADE_EXECUTOR_URL;
  }

  return fromEnv || DEFAULT_TRADE_EXECUTOR_URL;
}
