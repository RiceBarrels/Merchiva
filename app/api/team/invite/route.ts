import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Permissions, OrgRole } from "@/lib/types";
import { defaultPermissions } from "@/lib/db/team";
import { randomBytes } from "crypto";
import { sendTeamInviteEmail } from "@/lib/email/resend";

/**
 * POST /api/team/invite
 * Creates an invitation for a new team member.
 * Body: { email, role, permissions }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { email, role, permissions } = body as {
      email?: string;
      role?: OrgRole;
      permissions?: Permissions;
    };

    if (!email || !role) {
      return NextResponse.json(
        { error: "email and role are required" },
        { status: 400 }
      );
    }

    if (!["manager", "staff"].includes(role)) {
      return NextResponse.json(
        { error: "role must be manager or staff" },
        { status: 400 }
      );
    }

    // Look up the org membership for the caller (must be owner)
    const { data: member } = await supabase
      .from("org_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!member) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    if (member.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can invite team members" },
        { status: 403 }
      );
    }

    const organizationId = member.organization_id as string;

    // Check for existing active member with same email (via auth.users join — use RPC if available,
    // otherwise just look for duplicate pending invitations)
    const { data: existingInvite } = await supabase
      .from("org_invitations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email.toLowerCase())
      .is("accepted_at", null)
      .single();

    if (existingInvite) {
      return NextResponse.json(
        { error: "A pending invitation already exists for this email" },
        { status: 409 }
      );
    }

    // Generate secure token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const { data: invitation, error: invError } = await supabase
      .from("org_invitations")
      .insert({
        organization_id: organizationId,
        email: email.toLowerCase(),
        role,
        permissions: permissions ?? defaultPermissions(),
        token,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (invError) {
      console.error("[team/invite]", invError);
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
    }

    // Fetch org name for the email
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    // Build invite URL — prefer signup flow with invite_code, fallback to /invite/:token
    const baseUrl = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/signup?invite_code=${token}`;

    try {
      await sendTeamInviteEmail({
        to: email.toLowerCase(),
        inviterEmail: user.email ?? "A team owner",
        orgName: org?.name ?? "your team",
        role,
        inviteUrl,
      });
    } catch (emailErr) {
      console.error("[team/invite] email failed:", emailErr);
      // Invitation was created — don't fail the request, just warn
    }

    const inviteSignupUrl = `${baseUrl}/signup?invite_code=${invitation.token}`;
    return NextResponse.json({ token: invitation.token, expiresAt, inviteUrl: inviteSignupUrl });
  } catch (err) {
    console.error("[team/invite]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
