import { NextRequest, NextResponse } from "next/server";

/** Clover OAuth callback — Supabase dependency removed. */
export async function GET(request: NextRequest) {
  const settingsUrl = new URL("/settings", request.url);
  settingsUrl.searchParams.set("clover_error", "integration_unavailable");
  return NextResponse.redirect(settingsUrl);
}
