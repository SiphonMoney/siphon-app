import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isBlockedBotUserAgent, ROBOTS_DIRECTIVES } from "./lib/botProtection";

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent");

  if (isBlockedBotUserAgent(userAgent)) {
    return new NextResponse("Access denied.", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": ROBOTS_DIRECTIVES,
        "Cache-Control": "no-store",
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", ROBOTS_DIRECTIVES);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)",
  ],
};
