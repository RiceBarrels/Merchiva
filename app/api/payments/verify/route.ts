import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Payments not available" }, { status: 410 });
}
