import { NextRequest, NextResponse } from "next/server";
import {
  hashAdminPassword,
  normalizeAdminUsername,
  validateAdminPassword,
  validateAdminUsername,
} from "@/lib/merchiva-admin/password";
import { requireAdminSession } from "@/lib/merchiva-admin/session";
import { adminCall, adminSql } from "@/lib/merchiva-admin/stdb";
import { errorResponse } from "../_shared";

/** List platform admins. */
export async function GET() {
  try {
    await requireAdminSession();
    const rows = await adminSql("SELECT * FROM platform_admin");
    rows.sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
    return NextResponse.json({ admins: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Create a platform admin. Body: { username, password }. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminSession();
    const body = (await req.json()) as { username?: string; password?: string };
    const username = normalizeAdminUsername(String(body.username ?? ""));
    const password = String(body.password ?? "");
    const usernameError = validateAdminUsername(username);
    if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
    const passwordError = validateAdminPassword(password);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

    await adminCall("platformAdminAdd", {
      username,
      passwordHash: hashAdminPassword(username, password),
      createdBy: session.username,
    });
    return NextResponse.json({ ok: true, username });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Remove a platform admin. Body: { username }. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdminSession();
    const body = (await req.json()) as { username?: string };
    const username = normalizeAdminUsername(String(body.username ?? ""));
    if (!username) return NextResponse.json({ error: "Username required" }, { status: 400 });
    if (username === session.username) {
      return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });
    }
    await adminCall("platformAdminRemove", { username });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
