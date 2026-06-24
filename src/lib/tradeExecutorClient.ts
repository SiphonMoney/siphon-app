/** Base URL for trade-executor API calls (browser uses same-origin proxy to avoid CORS). */
export function getTradeExecutorBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api/trade-executor';
  }
  const upstream =
    process.env.TRADE_EXECUTOR_URL ||
    process.env.NEXT_PUBLIC_TRADE_EXECUTOR_URL ||
    'http://localhost:5005';
  return upstream.replace(/\/+$/, '');
}
