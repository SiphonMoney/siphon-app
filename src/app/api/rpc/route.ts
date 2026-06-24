import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_CHAIN_IDS } from '@/lib/networks';
import { getServerRpcUrl } from '@/lib/rpcServer';

export const runtime = 'nodejs';

/** Proxy JSON-RPC to the upstream node (avoids browser CORS + hides API keys). */
export async function POST(req: NextRequest) {
  const chainId = parseInt(req.nextUrl.searchParams.get('chainId') || '', 10);
  if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
    return NextResponse.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Unsupported chainId' }, id: null }, { status: 400 });
  }

  const body = await req.text();
  let upstream: string;
  try {
    upstream = getServerRpcUrl(chainId);
  } catch (err) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: String(err) }, id: null },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: `RPC proxy failed: ${String(err)}` }, id: null },
      { status: 502 },
    );
  }
}
