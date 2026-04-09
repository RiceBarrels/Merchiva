"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { MobileShell } from "@/components/sidebar";
import { LoginForm } from "@/components/login-form";
import { PermissionsProvider } from "@/lib/context/permissions";
import { SpacetimeProvider } from "@/lib/spacetimedb/provider";
import { getStoredToken } from "@/lib/spacetimedb/client";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { useAuth } from "react-oidc-context";
import { tables } from "@/lib/spacetimedb/generated";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";

// Inner component — runs inside SpacetimeProvider so useTable/useSpacetimeDB are available.
function AuthLoader({ children }: { children: React.ReactNode }) {
  const stdb = useSpacetimeDB();
  const [orgMembers, membersReady] = useTable(tables.orgMember);
  const [organizations, orgsReady] = useTable(tables.organization);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auth = useAuth();

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

  // Start 8-second timeout while loading; clear it once loaded.
  useEffect(() => {
    if (isReady && authState) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => setTimedOut(true), 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isReady, authState]);

  const handleSignOut = () => {
    localStorage.removeItem("stdb_token");
    auth.removeUser().catch(() => null);
    window.location.href = "/?logout=1";
  };

  // Still loading
  if (!isReady || !authState) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
        {timedOut && (
          <button
            onClick={handleSignOut}
            className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
          >
            Sign out and try again
          </button>
        )}
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
  const auth = useAuth();
  const [hasToken, setHasToken] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (auth.isLoading) return;

    // Sync OIDC id_token to localStorage so SpacetimeDB can use it
    if (auth.isAuthenticated && auth.user?.id_token) {
      localStorage.setItem("stdb_token", auth.user.id_token);
    }

    setHasToken(!!(auth.user?.id_token ?? getStoredToken()));
    setChecked(true);
  }, [auth.isLoading, auth.isAuthenticated, auth.user]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    );
  }

  if (!hasToken) {
    return <LoginForm />;
  }

  return (
    <SpacetimeProvider>
      <AuthLoader>{children}</AuthLoader>
    </SpacetimeProvider>
  );
}
