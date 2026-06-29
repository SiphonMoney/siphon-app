import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_TRADE_EXECUTOR_URL } from '@/lib/tradeExecutorClient';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UPSTREAM = (
  process.env.TRADE_EXECUTOR_URL ||
  process.env.NEXT_PUBLIC_TRADE_EXECUTOR_URL ||
  DEFAULT_TRADE_EXECUTOR_URL
).replace(/\/+$/, '');

const FORWARD_HEADERS = [
  'content-type',
  'x-wallet-address',
  'x-signature',
  'x-timestamp',
  'x-api-token',
  'authorization',
];

async function proxy(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const subpath = pathSegments.length ? `/${pathSegments.join('/')}` : '';
  const url = `${UPSTREAM}${subpath}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(url, init);
    const body = await res.arrayBuffer();
    const out = new NextResponse(body, { status: res.status });
    const contentType = res.headers.get('content-type');
    if (contentType) out.headers.set('Content-Type', contentType);
    return out;
  } catch (err) {
    return NextResponse.json(
      { error: `Trade executor proxy failed: ${String(err)}` },
      { status: 502 },
    );
  }
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
