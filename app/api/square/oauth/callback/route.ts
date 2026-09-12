import { NextRequest, NextResponse } from "next/server";

/** Square OAuth callback — Supabase dependency removed, SpacetimeDB migration pending. */
export async function GET(request: NextRequest) {
  const settingsUrl = new URL("/manager/settings", request.url);
  settingsUrl.searchParams.set("square_error", "oauth_unavailable");
  return NextResponse.redirect(settingsUrl);
}
