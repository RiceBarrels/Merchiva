import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PermissionsProvider } from "@/lib/context/permissions";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all active memberships with org names
  const { data: memberships } = await supabase
    .from("org_members")
    .select("organization_id, role, permissions, organizations(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) {
    redirect("/setup");
  }

  // Determine active org from user_profiles.last_active_org_id
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("last_active_org_id")
    .eq("user_id", user.id)
    .single();

  const lastActiveOrgId = profile?.last_active_org_id ?? null;
  const activeMembership =
    memberships.find((m) => m.organization_id === lastActiveOrgId) ?? memberships[0];

  const organizations: OrgSummary[] = memberships.map((m) => ({
    id: m.organization_id as string,
    name: (m.organizations as any)?.name ?? "Unknown",
  }));

  const currentOrg: OrgSummary = {
    id: activeMembership.organization_id as string,
    name: (activeMembership.organizations as any)?.name ?? "Unknown",
  };

  const organizationId = activeMembership.organization_id as string;
  const role = activeMembership.role as OrgRole;
  const permissions =
    (activeMembership.permissions as Permissions) ??
    (role === "owner" ? ownerPermissions() : defaultPermissions());

  return (
    <PermissionsProvider
      role={role}
      permissions={permissions}
      organizationId={organizationId}
      organizations={organizations}
      currentOrg={currentOrg}
    >
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* On mobile, offset content below the fixed header bar */}
          <main className="flex-1 overflow-y-auto pt-14 md:pt-0">{children}</main>
        </div>
      </div>
    </PermissionsProvider>
  );
}
