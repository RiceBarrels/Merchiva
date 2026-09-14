import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/merchiva-admin/session";
import { adminSql } from "@/lib/merchiva-admin/stdb";
import { errorResponse } from "../_shared";

/** Read-only SQL over public tables. Body: { query }. */
export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
    const body = (await req.json()) as { query?: string };
    const query = String(body.query ?? "").trim();
    if (!query) return NextResponse.json({ error: "Query required" }, { status: 400 });
    const rows = await adminSql(query);
    return NextResponse.json({ rows });
  } catch (err) {
    return errorResponse(err);
  }
}
