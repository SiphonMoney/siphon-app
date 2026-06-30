import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  applySecurityHeaders,
  getCrawlerBlockReason,
  ROBOTS_DIRECTIVES,
} from "./lib/botProtection";

function blockedResponse(reason: string): NextResponse {
  return new NextResponse("Access denied.", {
    status: 403,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": ROBOTS_DIRECTIVES,
      "Cache-Control": "no-store",
      "X-Crawler-Block": reason,
    },
  });
}

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent");
  const pathname = request.nextUrl.pathname;

  const blockReason = getCrawlerBlockReason(userAgent, request.headers, pathname);
  if (blockReason) {
    return blockedResponse(blockReason);
  }

  const response = NextResponse.next();
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)",
  ],
};
