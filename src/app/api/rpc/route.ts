import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_CHAIN_IDS } from '@/lib/networks';
import { getServerRpcUrls } from '@/lib/rpcServer';

export const runtime = 'nodejs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Proxy JSON-RPC to upstream nodes with fallback + 429 backoff. */
export async function POST(req: NextRequest) {
  const chainId = parseInt(req.nextUrl.searchParams.get('chainId') || '', 10);
  if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32600, message: 'Unsupported chainId' }, id: null },
      { status: 400 },
    );
  }

  const body = await req.text();
  let urls: string[];
  try {
    urls = getServerRpcUrls(chainId);
  } catch (err) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: String(err) }, id: null },
      { status: 500 },
    );
  }

  let lastText = '';
  let lastStatus = 502;

  for (const upstream of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(upstream, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const text = await res.text();
        lastText = text;
        lastStatus = res.status;

        if (res.status === 429) {
          await sleep(300 * 2 ** attempt);
          continue;
        }

        // HTTP-level failure (e.g. 401/403 from a restricted key, 5xx) — don't surface it to
        // the client; fall through to the next upstream RPC. A 2xx (even one carrying a
        // JSON-RPC error like an eth_call revert) is a legitimate response and is returned.
        if (!res.ok) break;

        return new NextResponse(text, {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        lastText = JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: `RPC proxy failed: ${String(err)}` },
          id: null,
        });
        lastStatus = 502;
      }
    }
  }

  return new NextResponse(lastText, {
    status: lastStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}
