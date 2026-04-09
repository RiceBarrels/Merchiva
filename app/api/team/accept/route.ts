import { NextResponse } from "next/server";

/**
 * POST /api/team/accept — replaced by SpacetimeDB acceptInvitation reducer.
 * This route is no longer used; kept as a stub so existing call sites
 * get a clear error rather than a 404.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Use SpacetimeDB acceptInvitation reducer instead" },
    { status: 410 }
  );
}
