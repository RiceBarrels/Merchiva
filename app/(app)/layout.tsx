"use client";

import { useEffect, useState, useMemo } from "react";
import { MobileShell } from "@/components/sidebar";
import { LoginForm } from "@/components/login-form";
import { PermissionsProvider } from "@/lib/context/permissions";
import { SpacetimeProvider } from "@/lib/spacetimedb/provider";
import { getStoredToken } from "@/lib/spacetimedb/client";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";

// Inner component — runs inside SpacetimeProvider so useTable/useSpacetimeDB are available.
function AuthLoader({ children }: { children: React.ReactNode }) {
  const stdb = useSpacetimeDB();
  const [orgMembers, membersReady] = useTable(tables.orgMember);
  const [organizations, orgsReady] = useTable(tables.organization);

  const identity = stdb?.identity;
  const isReady = membersReady && orgsReady;

  const authState = useMemo(() => {
    if (!isReady || !identity) return null;

    const myMemberships = orgMembers.filter(
      (m) => m.userId.toString() === identity.toString() && m.status === "active"
    );
    if (myMemberships.length === 0) return null;

    const activeMembership = myMemberships[0];
    const orgId = activeMembership.organizationId;

    const orgs: OrgSummary[] = myMemberships.map((m) => {
      const org = organizations.find((o) => o.id.toString() === m.organizationId.toString());
      return { id: m.organizationId.toString(), name: org?.name ?? "Unknown" };
    });

    const currentOrg: OrgSummary = {
      id: orgId.toString(),
      name: organizations.find((o) => o.id.toString() === orgId.toString())?.name ?? "Unknown",
    };

    const role = activeMembership.role as OrgRole;
    const permissions: Permissions = (() => {
      try {
        return JSON.parse(activeMembership.permissions) as Permissions;
      } catch {
        return role === "owner" ? ownerPermissions() : defaultPermissions();
      }
    })();

    return { role, permissions, organizationId: orgId.toString(), organizations: orgs, currentOrg };
  }, [isReady, identity, orgMembers, organizations]);

  // Still loading
  if (!isReady || !authState) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    );
  }

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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Use state to avoid SSR/hydration mismatch — localStorage is client-only.
  const [hasToken, setHasToken] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setHasToken(!!getStoredToken());
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    );
  }

  if (!hasToken) {
    return <LoginForm onSuccess={() => setHasToken(true)} />;
  }

  return (
    <SpacetimeProvider>
      <AuthLoader>{children}</AuthLoader>
    </SpacetimeProvider>
  );
}
