import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PermissionsProvider } from "@/lib/context/permissions";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import type { Permissions, OrgRole } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders auth check (proxy.ts should already redirect, but
  // this protects against direct Server Component rendering)
  if (!user) {
    redirect("/login");
  }

  // Fetch the user's org membership to get role + permissions
  let role: OrgRole = "owner";
  let permissions: Permissions = ownerPermissions();
  let organizationId: string | null = null;

  const { data: member } = await supabase
    .from("org_members")
    .select("organization_id, role, permissions")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!member) {
    redirect("/setup");
  }

  organizationId = member.organization_id as string;
  role = member.role as OrgRole;
  permissions = (member.permissions as Permissions) ?? (role === "owner" ? ownerPermissions() : defaultPermissions());

  return (
    <PermissionsProvider role={role} permissions={permissions} organizationId={organizationId}>
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
