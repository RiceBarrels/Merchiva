import { NextResponse } from "next/server";
import { sendTeamInviteEmail } from "@/lib/email/resend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, token, orgName, inviterEmail, role } = body ?? {};

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

    await sendTeamInviteEmail({ to, inviterEmail, orgName, role, inviteUrl });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/team/send-invite-email]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send invite email" },
      { status: 500 },
    );
  }
}
