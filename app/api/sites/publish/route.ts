import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { siteId, published } = (await req.json()) as {
      siteId: string;
      published: boolean;
    };

    if (!siteId || typeof published !== "boolean") {
      return NextResponse.json({ error: "siteId and published are required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify the user owns this site via org membership
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the site to check org membership
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id, organization_id")
      .eq("id", siteId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Confirm user is an active member of the site's organization
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("organization_id", site.organization_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only owners and managers can publish
    if (!["owner", "manager"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("sites")
      .update({ published })
      .eq("id", siteId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, published });
  } catch (err) {
    console.error("Publish route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
