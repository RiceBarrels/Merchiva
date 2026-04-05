"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/client";
import { PermissionsProvider } from "@/lib/context/permissions";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";

interface AuthState {
  role: OrgRole;
  permissions: Permissions;
  organizationId: string;
  organizations: OrgSummary[];
  currentOrg: OrgSummary;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: memberships } = await supabase
        .from("org_members")
        .select("organization_id, role, permissions, organizations(id, name)")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (!memberships || memberships.length === 0) {
        router.replace("/setup");
        return;
      }

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: (m.organizations as any)?.name ?? "Unknown",
      }));

      const currentOrg: OrgSummary = {
        id: activeMembership.organization_id as string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: (activeMembership.organizations as any)?.name ?? "Unknown",
      };

      const role = activeMembership.role as OrgRole;
      const permissions =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (activeMembership.permissions as Permissions) ??
        (role === "owner" ? ownerPermissions() : defaultPermissions());

      setAuthState({
        role,
        permissions,
        organizationId: activeMembership.organization_id as string,
        organizations,
        currentOrg,
      });
    }

    init().catch(console.error).finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    );
  }

  if (!authState) return null;

  return (
    <PermissionsProvider
      role={authState.role}
      permissions={authState.permissions}
      organizationId={authState.organizationId}
      organizations={authState.organizations}
      currentOrg={authState.currentOrg}
    >
      <MobileShell>{children}</MobileShell>
    </PermissionsProvider>
  );
}
