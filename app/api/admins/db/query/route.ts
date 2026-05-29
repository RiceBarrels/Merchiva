import { NextRequest, NextResponse } from "next/server";
import { verifyAdminFromAuthHeader } from "@/lib/auth/admin";
import { spacetimeSql } from "@/lib/spacetimedb/sql";

// Admin-only generic SQL read endpoint. Returns rows + schema for any table.
// Only SELECT statements are allowed.
export async function POST(req: NextRequest) {
  const admin = await verifyAdminFromAuthHeader(req.headers.get("authorization"));
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "Empty query" }, { status: 400 });

  const lower = query.toLowerCase();
  if (!lower.startsWith("select")) {
    return NextResponse.json(
      { error: "Only SELECT queries are allowed" },
      { status: 400 },
    );
  }
  if (/;/.test(query.replace(/;\s*$/, ""))) {
    return NextResponse.json({ error: "Multiple statements not allowed" }, { status: 400 });
  }

  try {
    const result = await spacetimeSql(query);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
