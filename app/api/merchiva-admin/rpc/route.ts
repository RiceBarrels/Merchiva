import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/merchiva-admin/session";
import { adminCall } from "@/lib/merchiva-admin/stdb";
import { errorResponse } from "../_shared";

// Platform-admin credential reducers have dedicated routes with validation.
const BLOCKED = new Set(["platformAdminAdd", "platformAdminRemove", "platformAdminVerify", "platformAdminSetPassword", "registerServiceIdentity"]);

/** Call any reducer as the service identity. Body: { reducer, args }. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminSession();
    const body = (await req.json()) as { reducer?: string; args?: Record<string, unknown> };
    const reducer = String(body.reducer ?? "");
    if (!reducer) return NextResponse.json({ error: "Reducer required" }, { status: 400 });
    if (BLOCKED.has(reducer)) return NextResponse.json({ error: "Use the dedicated admin routes" }, { status: 400 });
    await adminCall(reducer, body.args ?? {});
    console.log(`[merchivaAdmin] ${session.username} called ${reducer}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
