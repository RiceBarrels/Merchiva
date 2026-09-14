import { NextRequest, NextResponse } from "next/server";
import { hashAdminPassword, normalizeAdminUsername, validateAdminPassword } from "@/lib/merchiva-admin/password";
import { requireAdminSession } from "@/lib/merchiva-admin/session";
import { adminCall } from "@/lib/merchiva-admin/stdb";
import { errorResponse } from "../_shared";

/**
 * Change a password. Body: { newPassword, currentPassword?, username? }.
 * - Own account: currentPassword is required and verified.
 * - Another admin's account (username given): no current password needed.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminSession();
    const body = (await req.json()) as { username?: string; currentPassword?: string; newPassword?: string };
    const target = normalizeAdminUsername(String(body.username ?? session.username));
    const newPassword = String(body.newPassword ?? "");
    const passwordError = validateAdminPassword(newPassword);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

    if (target === session.username) {
      const current = String(body.currentPassword ?? "");
      if (!current) return NextResponse.json({ error: "Current password required" }, { status: 400 });
      try {
        await adminCall("platformAdminVerify", { username: target, passwordHash: hashAdminPassword(target, current) });
      } catch {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
    }

    await adminCall("platformAdminSetPassword", { username: target, passwordHash: hashAdminPassword(target, newPassword) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
