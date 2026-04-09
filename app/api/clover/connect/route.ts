import { NextResponse } from "next/server";

/** Clover integration removed — Supabase dependency. */
export async function GET() {
  return NextResponse.json({ error: "Clover integration not available" }, { status: 410 });
}
