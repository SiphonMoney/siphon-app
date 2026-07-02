import { NextRequest, NextResponse } from 'next/server';
import { NETWORKS } from '@/lib/networks';
import { getServerRpcUrls } from '@/lib/rpcServer';

export const runtime = 'nodejs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Proxy JSON-RPC to upstream nodes with fallback + 429 backoff. */
export async function POST(req: NextRequest) {
  const chainId = parseInt(req.nextUrl.searchParams.get('chainId') || '', 10);
  if (!NETWORKS[chainId]) {
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

  // For log queries, push nodes that CAP eth_getLogs on their free tier to the BACK so a
  // large-range-capable node is tried FIRST and we don't waste a round-trip on a guaranteed reject:
  //   - publicnode rejects historical getLogs as "archive" without a paid token
  //   - free-tier Alchemy caps getLogs at a 10-BLOCK range (rejects our 9000-block chunks)
  //   - free-tier Infura throttles
  // e.g. on Base this makes the reliable 10k-range public node (mainnet.base.org) the first hop
  // instead of wasting one on the free Alchemy key set as BASE_MAINNET_RPC. Paid Alchemy still
  // works when it's the only option — it just isn't tried first for logs.
  if (body.includes('eth_getLogs')) {
    // Nodes whose FREE tier can't reliably serve our getLogs scans go to the BACK:
    //   - publicnode rejects historical getLogs as "archive" without a paid token
    //   - free-tier Alchemy caps getLogs at a 10-BLOCK range
    //   - free-tier Infura throttles (429 as JSON-RPC -32005)
    //   - free-tier dRPC (base.drpc.org) times out even single-block scans with
    //     `code 30: Request timeout on the free tier` — the exact failure seen on Base withdraws.
    // A paid key for any of these still works when it's the only option; it just isn't tried first.
    const capped = (u: string) =>
      u.includes('publicnode') || u.includes('alchemy') || u.includes('infura') || u.includes('drpc');
    urls = [...urls].sort((a, b) => (capped(a) ? 1 : 0) - (capped(b) ? 1 : 0));
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

        // Rate limited / free-tier overloaded — either an HTTP 429, or a JSON-RPC error wrapped in
        // a 200: Infura's -32005 / "Too Many Requests", or dRPC's free-tier `code 30 / Request
        // timeout on the free tier`. Back off + retry this node, then fall through to the next
        // upstream. Without the dRPC case this surfaced straight to the client and aborted the
        // whole leaf scan → withdraw stuck on "WITHDRAWING…".
        if (
          res.status === 429 ||
          text.includes('-32005') ||
          text.includes('Too Many Requests') ||
          text.includes('Request timeout on the free tier') ||
          (text.includes('"code": 30') || text.includes('"code":30'))
        ) {
          await sleep(300 * 2 ** attempt);
          continue;
        }

        // Some free nodes (publicnode) reject historical eth_getLogs as an "archive" request
        // without a paid token (-32602). That's deterministic for this node, not transient — skip
        // straight to the next upstream (e.g. drpc) instead of retrying or surfacing it.
        if (text.includes('Archive requests require') || text.includes('personal token')) break;

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
