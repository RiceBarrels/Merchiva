import { NextResponse } from "next/server";
import { AdminAuthError } from "@/lib/merchiva-admin/session";

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AdminAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 400 });
}
