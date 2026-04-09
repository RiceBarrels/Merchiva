import { NextResponse, type NextRequest } from "next/server";

// Auth is handled client-side via SpacetimeDB (WebSocket + localStorage token).
// This proxy passes all requests through without server-side auth checks.
export async function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    /*
     * Run proxy on all paths EXCEPT:
     * - _next/static / _next/image (build assets)
     * - favicon.ico
     * - api routes (they handle their own auth)
     */
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
