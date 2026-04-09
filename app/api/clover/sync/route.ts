import { NextResponse } from "next/server";

/** Clover sync — Supabase dependency removed. */
export async function POST() {
  return NextResponse.json({ error: "Clover integration not available" }, { status: 410 });
}
