"use client";

import { useEffect, useState, useCallback } from "react";
import { MobileShell } from "@/components/sidebar";
import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/client";
import { PermissionsProvider } from "@/lib/context/permissions";
import { SpacetimeProvider } from "@/lib/spacetimedb/provider";
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
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  const loadAuth = useCallback(async () => {
    setLoading(true);
    setNeedsLogin(false);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setNeedsLogin(true);
        return;
      }

      const { data: memberships } = await supabase
        .from("org_members")
        .select("organization_id, role, permissions, organizations(id, name)")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (!memberships || memberships.length === 0) {
        setNeedsLogin(true);
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
    } catch (err) {
      console.error("Auth init failed:", err);
      setNeedsLogin(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    );
  }

  if (needsLogin) {
    return <LoginForm onSuccess={loadAuth} />;
  }

  if (!authState) return null;

  return (
    <SpacetimeProvider>
      <PermissionsProvider
        role={authState.role}
        permissions={authState.permissions}
        organizationId={authState.organizationId}
        organizations={authState.organizations}
        currentOrg={authState.currentOrg}
      >
        <MobileShell>{children}</MobileShell>
      </PermissionsProvider>
    </SpacetimeProvider>
  );
}
