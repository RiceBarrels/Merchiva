import { NextResponse } from "next/server";
import { sendTeamInviteEmail } from "@/lib/email/resend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, token, orgName, inviterEmail, role, phone } = body ?? {};

    if (!to || !token || !orgName || !inviterEmail || !role) {
      return NextResponse.json(
        { error: "Missing required fields: to, token, orgName, inviterEmail, role" },
        { status: 400 },
      );
    }

    const origin =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";
    const inviteUrl = `${origin}/invite/${token}`;

    const phoneClean = typeof phone === "string" && phone.trim() ? phone.trim() : undefined;
    if (phoneClean) {
      // Logged so it's auditable; SMS dispatch can hook in here later without
      // changing the client contract. The OrgInvitation row doesn't carry a
      // phone field today (SpacetimeDB schema), so we don't persist it.
      console.log(`[invite] ${to} → also collected phone ${phoneClean} (org=${orgName})`);
    }

    await sendTeamInviteEmail({ to, inviterEmail, orgName, role, inviteUrl, phone: phoneClean });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/team/send-invite-email]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send invite email" },
      { status: 500 },
    );
  }
}
