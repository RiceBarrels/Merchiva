import { NextRequest, NextResponse } from "next/server";
import { verifyAdminFromAuthHeader } from "@/lib/auth/admin";

export async function GET(req: NextRequest) {
  const result = await verifyAdminFromAuthHeader(req.headers.get("authorization"));
  if (!result) return NextResponse.json({ isAdmin: false }, { status: 401 });
  return NextResponse.json({
    isAdmin: result.isAdmin,
    user: result.user,
    source: result.source,
  });
}
