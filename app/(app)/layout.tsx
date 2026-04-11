"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { MobileShell } from "@/components/sidebar";
import { LoginForm } from "@/components/login-form";
import { PermissionsProvider } from "@/lib/context/permissions";
import { SpacetimeProvider } from "@/lib/spacetimedb/provider";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { useAuth } from "@clerk/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { tables } from "@/lib/spacetimedb/generated";
import { getConnection } from "@/lib/spacetimedb/client";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";

// New-user onboarding: shown when SpacetimeDB is ready but the user has no org membership yet.
function NewUserSetup({ onComplete, onSignOut }: { onComplete: () => void; onSignOut: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetup = async () => {
    if (!displayName.trim() || !storeName.trim()) return;
    const conn = getConnection();
    if (!conn) {
      setError("Not connected to database. Please try again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (conn as any).reducers.createUser({
        email: "",
        passwordHash: null,
        displayName: displayName.trim(),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (conn as any).reducers.createOrg({ name: storeName.trim() });
      // Give SpacetimeDB a moment to propagate the new rows, then reload.
      setTimeout(onComplete, 1500);
    } catch (err) {
      console.error("Setup failed:", err, JSON.stringify(err));
      setError(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 bg-background">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Set up your account</h1>
          <p className="text-muted-foreground text-sm mt-1">One last step to get started</p>
        </div>
        <div className="space-y-4">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="h-12 text-base"
            autoFocus
          />
          <Input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Your store name"
            className="h-12 text-base"
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSetup()}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={handleSetup}
            disabled={loading || !displayName.trim() || !storeName.trim()}
            className="w-full h-11"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get started"}
          </Button>
        </div>
        <button onClick={onSignOut} className="block text-sm text-muted-foreground underline underline-offset-4">
          Sign out
        </button>
      </div>
    </div>
  );
}

// Inner component — runs inside SpacetimeProvider so useTable/useSpacetimeDB are available.
function AuthLoader({ children }: { children: React.ReactNode }) {
  const stdb = useSpacetimeDB();
  const [orgMembers, membersReady] = useTable(tables.orgMember);
  const [organizations, orgsReady] = useTable(tables.organization);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { signOut } = useAuth();

  const handleSignOut = () => {
    localStorage.removeItem("stdb_token");
    signOut().then(() => { window.location.href = "/"; }).catch(() => { window.location.href = "/"; });
  };

  // Still waiting for SpacetimeDB tables to sync
  if (!isReady) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
        <p className="text-xs text-stone-500">Connecting…</p>
        {timedOut && (
          <div className="flex flex-col items-center gap-2 mt-2">
            <p className="text-xs text-red-500">Connection timed out</p>
            <button
              onClick={handleSignOut}
              className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
            >
              Sign out and try again
            </button>
          </div>
        )}
      </div>
    );
  }

  // Tables loaded but no org membership — new user needs onboarding
  if (!authState) {
    return (
      <NewUserSetup
        onComplete={() => window.location.reload()}
        onSignOut={handleSignOut}
      />
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
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <LoginForm />;
  }

  return (
    <SpacetimeProvider>
      <AuthLoader>{children}</AuthLoader>
    </SpacetimeProvider>
  );
}
