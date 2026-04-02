import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { defaultPermissions } from "@/lib/db/team";

/**
 * POST /api/team/accept
 * Accepts a team invitation. Uses service role to bypass RLS since the
 * invitee isn't yet a member and can't insert into org_members.
 * Body: { token, displayName }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify the user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token, displayName } = (await request.json()) as {
      token?: string;
      displayName?: string;
    };

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    // Use service role client to bypass RLS
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch the invitation
    const { data: invitation } = await admin
      .from("org_invitations")
      .select("*")
      .eq("token", token)
      .is("accepted_at", null)
      .single();

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found or already accepted" },
        { status: 404 }
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 410 }
      );
    }

    // Check email match
    if (user.email && invitation.email && user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: `This invitation was sent to ${invitation.email}. You're signed in as ${user.email}.` },
        { status: 403 }
      );
    }

    // Check not already a member
    const { data: existing } = await admin
      .from("org_members")
      .select("id")
      .eq("organization_id", invitation.organization_id)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "You're already a member of this organization" },
        { status: 409 }
      );
    }

    // Insert membership
    const { error: memberError } = await admin.from("org_members").insert({
      organization_id: invitation.organization_id,
      user_id: user.id,
      role: invitation.role,
      display_name: displayName || user.email?.split("@")[0] || "",
      permissions: invitation.permissions ?? defaultPermissions(),
      status: "active",
    });

    if (memberError) {
      console.error("[team/accept] member insert:", memberError);
      return NextResponse.json(
        { error: "Failed to join organization" },
        { status: 500 }
      );
    }

    // Mark invitation as accepted
    await admin
      .from("org_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[team/accept]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
