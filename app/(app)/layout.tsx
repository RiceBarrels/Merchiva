"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { MobileShell } from "@/components/sidebar";
import { InlineSignIn } from "@/components/inline-sign-in";
import { PermissionsProvider } from "@/lib/context/permissions";
import { SpacetimeProvider } from "@/lib/spacetimedb/provider";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { useAuth } from "@/lib/auth/context";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";

import { tables } from "@/lib/spacetimedb/generated";
import { getConnection, setActiveOrgId } from "@/lib/spacetimedb/client";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";

// New-user onboarding: shown when SpacetimeDB is ready but the user has no org membership yet.
function NewUserSetup({ onComplete, onSignOut }: { onComplete: () => void; onSignOut: () => void }) {
  const t = useT();
  const [displayName, setDisplayName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    if (!displayName.trim() || !storeName.trim()) return;
    const conn = getConnection();
    if (!conn) {
      toast.error(t("layout.notConnected"), { description: t("layout.pleaseWait") });
      return;
    }
    setLoading(true);
    toast.info(t("layout.connectingDb"));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = (conn as any).reducers;
      console.log("[Setup] Available reducers:", Object.keys(r || {}));
      console.log("[Setup] Calling createUser...");
      toast.info(t("layout.creatingAccount"));
      await r.createUser({
        email: "",
        passwordHash: undefined,
        displayName: displayName.trim(),
      });
      console.log("[Setup] createUser done, calling createOrg...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await r.createOrg({ name: storeName.trim() });
      console.log("[Setup] createOrg done, reloading in 1.5s...");
      toast.success(t("layout.accountCreated"));
      setTimeout(onComplete, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Setup failed:", msg, err);
      toast.error(t("layout.setupFailed"), { description: msg, duration: 10000 });
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 min-h-screen flex-col justify-center px-6 bg-background">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-bold">{t("layout.newUser.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("layout.newUser.description")}</p>
        </div>
        <div className="space-y-4">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("layout.newUser.yourName")}
            className="h-12 text-base"
            autoFocus
          />
          <Input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder={t("layout.newUser.yourStoreName")}
            className="h-12 text-base"
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSetup()}
          />
          <Button
            onClick={handleSetup}
            disabled={loading || !displayName.trim() || !storeName.trim()}
            className="w-full h-11"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("layout.newUser.getStarted")}
          </Button>
        </div>
        <button onClick={onSignOut} className="block text-sm text-muted-foreground underline underline-offset-4">
          {t("common.signOut")}
        </button>
      </div>
    </div>
  );
}

function NamePrompt({ memberId, onComplete }: { memberId: string; onComplete: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const conn = getConnection();
      if (!conn) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (conn as any).reducers.updateDisplayName({
        displayName: name.trim(),
      });
      toast.success(t("layout.namePrompt.saved"));
      setTimeout(onComplete, 500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("layout.namePrompt.failed"));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 min-h-screen flex-col justify-center px-6 bg-background">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("layout.namePrompt.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("layout.namePrompt.description")}</p>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("layout.namePrompt.placeholder")}
          className="h-12 text-base"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && !saving && handleSave()}
        />
        <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full h-11">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("layout.namePrompt.continue")}
        </Button>
      </div>
    </div>
  );
}

// Inner component — runs inside SpacetimeProvider so useTable/useSpacetimeDB are available.
function AuthLoader({ children }: { children: React.ReactNode }) {
  const t = useT();
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

    // Honor the user's last-selected org if they have an active membership in it.
    let preferredOrgId: string | null = null;
    try {
      preferredOrgId = typeof window !== "undefined"
        ? localStorage.getItem("active_org_id")
        : null;
    } catch {
      preferredOrgId = null;
    }

    const activeMembership =
      (preferredOrgId
        ? myMemberships.find((m) => m.organizationId.toString() === preferredOrgId)
        : null) ?? myMemberships[0];
    const orgId = activeMembership.organizationId;

    // If the preferred org no longer applies, clear the stale preference.
    if (preferredOrgId && preferredOrgId !== orgId.toString()) {
      try { localStorage.removeItem("active_org_id"); } catch {}
    }

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
      const fallback = role === "owner" ? ownerPermissions() : defaultPermissions();
      try {
        // Merge onto the role-appropriate fallback so new permission keys added
        // after the membership's JSON was last saved aren't undefined.
        return { ...fallback, ...(JSON.parse(activeMembership.permissions) as Partial<Permissions>) } as Permissions;
      } catch {
        return fallback;
      }
    })();

    const memberDisplayName = activeMembership.displayName ?? "";
    return { role, permissions, organizationId: orgId.toString(), organizations: orgs, currentOrg, memberDisplayName, memberId: activeMembership.id.toString() };
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
    signOut();
  };

  // Still waiting for SpacetimeDB tables to sync
  if (!isReady) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        <p className="text-xs text-muted-foreground">{t("layout.connecting")}</p>
        {timedOut && (
          <div className="flex flex-col items-center gap-2 mt-2">
            <p className="text-xs text-red-500">{t("layout.connectionTimedOut")}</p>
            <button
              onClick={handleSignOut}
              className="rounded border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {t("layout.signOutAndRetry")}
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

  // Make organizationId available to non-React write helpers.
  setActiveOrgId(authState.organizationId);

  const needsName = !authState.memberDisplayName || !authState.memberDisplayName.trim();

  return (
    <PermissionsProvider
      role={authState.role}
      permissions={authState.permissions}
      organizationId={authState.organizationId}
      organizations={authState.organizations}
      currentOrg={authState.currentOrg}
    >
      {needsName ? (
        <NamePrompt memberId={authState.memberId} onComplete={() => window.location.reload()} />
      ) : (
        <MobileShell>{children}</MobileShell>
      )}
    </PermissionsProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <InlineSignIn redirectTo="/dashboard" />
      </div>
    );
  }

  return (
    <SpacetimeProvider>
      <AuthLoader>{children}</AuthLoader>
    </SpacetimeProvider>
  );
}
