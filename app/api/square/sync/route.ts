import { NextResponse } from "next/server";

/** Square sync — Supabase dependency removed, SpacetimeDB migration pending. */
export async function POST() {
  return NextResponse.json({ error: "Square sync not available" }, { status: 410 });
}
