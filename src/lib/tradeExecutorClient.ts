/**
 * Base URL for trade-executor API calls.
 *
 * The browser calls the trade-executor DIRECTLY (it has CORS configured for the app origin),
 * NOT through the Next.js `/api/trade-executor` proxy. Vercel serverless functions cap the
 * request body at ~4.5MB, so routing the large FHE payloads (compressed server key ~23MB,
 * encrypted strategy) through the proxy fails with HTTP 413 (FUNCTION_PAYLOAD_TOO_LARGE).
 * Direct calls have no such limit.
 *
 * Requires NEXT_PUBLIC_TRADE_EXECUTOR_URL to be set (and baked into the Vercel build). If it's
 * missing we fall back to the same-origin proxy — fine for small reads, but large POSTs (server
 * key / createStrategy) will 413 until the env var is configured.
 */
export function getTradeExecutorBaseUrl(): string {
  const direct = (process.env.NEXT_PUBLIC_TRADE_EXECUTOR_URL || '').replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    return direct || '/api/trade-executor';
  }
  const upstream =
    process.env.TRADE_EXECUTOR_URL ||
    process.env.NEXT_PUBLIC_TRADE_EXECUTOR_URL ||
    'http://localhost:5005';
  return upstream.replace(/\/+$/, '');
}
