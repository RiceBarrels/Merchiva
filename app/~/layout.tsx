"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MobileShell } from "@/components/sidebar";
import { MerchivaQuickDialog } from "@/components/merchiva-quick-dialog";
import { OfflineIndicator } from "@/components/offline-indicator";
import { ShakeBugReport } from "@/components/shake-bug-report";
import { PushNotificationPrompt } from "@/components/push-notification-prompt";
import { TauriNotificationBridge } from "@/components/tauri-notification-bridge";
import { PermissionsProvider } from "@/lib/context/permissions";
import { SpacetimeProvider } from "@/lib/spacetimedb/provider";
import { OfflineModeProvider, useOfflineMode } from "@/lib/offline-mode";
import { ownerPermissions, defaultPermissions } from "@/lib/db/team";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { useAuth } from "@/lib/auth/context";
import { useOfflineSync } from "@/lib/offline-sync";
import { Loader2 } from "lucide-react";
import { SplashLoader, Spinner } from "@/components/ui/loaders/geometric";
import { useThemeMode } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { betaFeatureForPath, betaFeaturesFromSettingsRow } from "@/lib/beta-features";

import { tables } from "@/lib/spacetimedb/generated";
import { getConnection, setActiveOrgId } from "@/lib/spacetimedb/client";
import { evaluateSubscription } from "@/lib/billing/subscription";
import { StorePickerScreen } from "@/components/store-picker";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";

// Resolved auth for the active org — everything the app shell needs to render.
type AuthReady = {
  kind: "ready";
  role: OrgRole;
  permissions: Permissions;
  organizationId: string;
  organizations: OrgSummary[];
  currentOrg: OrgSummary;
  memberDisplayName: string;
  memberId: string;
};

// The user belongs to several stores and hasn't picked one yet — show the picker.
type AuthResult = { kind: "choose"; choices: OrgSummary[] } | AuthReady | null;

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
      try { localStorage.setItem("merchiva_setup_org", storeName.trim()); } catch {}
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
            {loading ? <Spinner size={16} /> : t("layout.newUser.getStarted")}
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
          {saving ? <Spinner size={16} /> : t("layout.namePrompt.continue")}
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
  // Settings drives the "has the user finished setup?" check below. `createOrg`
  // seeds a settings row with createdAt === updatedAt; the setup wizard's
  // `updateSettings` deletes+reinserts the row with a fresh `updatedAt`. Any
  // measurable divergence between the two timestamps means the user has gone
  // past the setup form (either via the wizard or via /~/settings later).
  const [settingsRows, settingsReady] = useTable(tables.settings);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Org the user picked from the store-picker screen this session.
  const [pickedOrgId, setPickedOrgId] = useState<string | null>(null);

  const identity = stdb?.identity;
  const isReady = membersReady && orgsReady;

  const authState = useMemo<AuthResult>(() => {
    if (!isReady || !identity) return null;

    const myMemberships = orgMembers.filter(
      (m) => m.userId.toString() === identity.toString() && m.status === "active"
    );
    if (myMemberships.length === 0) return null;

    // Honor the user's last-selected org if they have an active membership in it.
    let storedOrgId: string | null = null;
    try {
      storedOrgId = typeof window !== "undefined"
        ? localStorage.getItem("active_org_id")
        : null;
    } catch {
      storedOrgId = null;
    }
    const preferredOrgId = pickedOrgId ?? storedOrgId;

    const preferredMembership = preferredOrgId
      ? myMemberships.find((m) => m.organizationId.toString() === preferredOrgId)
      : undefined;

    // No explicit selection and more than one store — make the user choose
    // instead of silently opening the first membership.
    if (!preferredMembership && myMemberships.length > 1) {
      // Clear the stored preference only when IT is stale — a session-only
      // pickedOrgId that lost its membership must not wipe a still-valid
      // stored org id (the reset effect below falls back to it instead).
      if (
        storedOrgId &&
        !myMemberships.some((m) => m.organizationId.toString() === storedOrgId)
      ) {
        try { localStorage.removeItem("active_org_id"); } catch {}
      }
      const choices: OrgSummary[] = myMemberships.map((m) => {
        const org = organizations.find((o) => o.id.toString() === m.organizationId.toString());
        return {
          id: m.organizationId.toString(),
          name: org?.name ?? "Unknown",
          parentOrgId: org?.parentOrgId ?? null,
          logoUrl: org?.logoUrl ?? null,
        };
      });
      return { kind: "choose", choices };
    }

    const activeMembership = preferredMembership ?? myMemberships[0];
    const orgId = activeMembership.organizationId;

    // If the stored preference no longer applies, clear the stale value.
    if (storedOrgId && storedOrgId !== orgId.toString()) {
      try { localStorage.removeItem("active_org_id"); } catch {}
    }

    const orgs: OrgSummary[] = myMemberships.map((m) => {
      const org = organizations.find((o) => o.id.toString() === m.organizationId.toString());
      return {
        id: m.organizationId.toString(),
        name: org?.name ?? "Unknown",
        parentOrgId: org?.parentOrgId ?? null,
        logoUrl: org?.logoUrl ?? null,
      };
    });
    // Pull in any orgs we DON'T have membership in but that are part of the
    // current org's parent/child tree — needed so the share-group lookup
    // resolves a parent even when the user is only a member of a sub-store.
    const currentOrgRow = organizations.find((o) => o.id.toString() === orgId.toString());
    const rootIdString = (currentOrgRow?.parentOrgId as string | undefined) ?? orgId.toString();
    const treeRows = organizations.filter(
      (o) => o.id.toString() === rootIdString || (o.parentOrgId as string | undefined) === rootIdString,
    );
    for (const o of treeRows) {
      const idStr = o.id.toString();
      if (!orgs.some((existing) => existing.id === idStr)) {
        orgs.push({
          id: idStr,
          name: o.name,
          parentOrgId: (o.parentOrgId as string | undefined) ?? null,
          logoUrl: (o.logoUrl as string | undefined) ?? null,
        });
      }
    }

    const currentOrg: OrgSummary = {
      id: orgId.toString(),
      name: currentOrgRow?.name ?? "Unknown",
      parentOrgId: (currentOrgRow?.parentOrgId as string | undefined) ?? null,
      logoUrl: (currentOrgRow?.logoUrl as string | undefined) ?? null,
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
    return { kind: "ready" as const, role, permissions, organizationId: orgId.toString(), organizations: orgs, currentOrg, memberDisplayName, memberId: activeMembership.id.toString() };
  }, [isReady, identity, orgMembers, organizations, pickedOrgId]);

  // If a picked store loses its membership mid-session we land back in
  // "choose" with pickedOrgId still set — which would leave every picker row
  // disabled behind a busy state that can never resolve. Drop the pick so the
  // memo falls back to the stored preference (or shows an interactive picker).
  useEffect(() => {
    if (pickedOrgId && authState?.kind === "choose") setPickedOrgId(null);
  }, [pickedOrgId, authState]);

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
  const { cachedSnapshot, snapshotLoaded } = useOfflineMode();

  useOfflineSync();

  const handleSignOut = () => {
    signOut();
  };

  // Try to restore a cached auth state from the offline snapshot for instant startup.
  const cachedAuthState = useMemo<AuthReady | null>(() => {
    if (authState) return null; // live data available, no need for cache
    if (!snapshotLoaded || !cachedSnapshot) return null;
    // Restore minimal auth state from localStorage (we cached role/permissions there)
    try {
      const cached = localStorage.getItem("merchiva_auth_cache");
      if (!cached) return null;
      const parsed = JSON.parse(cached) as AuthReady | Omit<AuthReady, "kind">;
      // Legacy cache entries predate the discriminated union — treat them as ready.
      if (!("kind" in parsed)) return { kind: "ready", ...parsed };
      return parsed.kind === "ready" ? parsed : null;
    } catch {
      return null;
    }
  }, [authState, snapshotLoaded, cachedSnapshot]);

  // Cache auth state whenever it changes so we can restore it offline.
  // Only "ready" results are cached — a "choose" state must never be
  // persisted (nor could it be restored meaningfully).
  useEffect(() => {
    if (authState?.kind === "ready") {
      try { localStorage.setItem("merchiva_auth_cache", JSON.stringify(authState)); } catch {}
    }
  }, [authState]);

  const effectiveAuth = (authState?.kind === "ready" ? authState : null) ?? cachedAuthState;

  const setupRouter = useRouter();
  const pathname = usePathname();
  const isSetupPath = pathname === "/~/setup" || pathname.startsWith("/~/setup/");
  const needsName = effectiveAuth ? (!effectiveAuth.memberDisplayName || !effectiveAuth.memberDisplayName.trim()) : false;

  // True once the user has touched settings (setup wizard's updateSettings or
  // any later /~/settings edit). Null while the settings table is still
  // syncing — we hold off on the redirect until we have a definitive answer
  // so users aren't bounced to /~/setup just because rows haven't streamed in
  // yet. eslint-disable: ToDate exists on the SpacetimeDB Timestamp wrapper
  // but isn't in our shared row typing.
  const setupComplete = useMemo<boolean | null>(() => {
    if (!effectiveAuth) return null;
    if (!settingsReady) return null;
    const row = settingsRows.find(
      (r: { organizationId: string }) => r.organizationId === effectiveAuth.organizationId,
    );
    if (!row) return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const createdMs = r.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const updatedMs = r.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      // 1 second tolerance — `createOrg` writes both timestamps in the same
      // reducer call, but they can differ by sub-millisecond ticks.
      return updatedMs - createdMs > 1000;
    } catch {
      return false;
    }
  }, [effectiveAuth, settingsReady, settingsRows]);

  useEffect(() => {
    if (!effectiveAuth || needsName) return;
    if (setupComplete === null) return; // still loading the signal
    if (!setupComplete && !isSetupPath) {
      setupRouter.replace("/~/setup");
    }
  }, [effectiveAuth, isSetupPath, needsName, setupComplete, setupRouter]);

  // ── Subscription gate ────────────────────────────────────────────────────
  // An org may use the app while subscribed (Stripe active/trialing/past_due)
  // or inside its free-trial window. Subscription lives on the ROOT org, so
  // sub-stores inherit their parent's status. We only block when we can
  // positively read the org row and it's genuinely out of access — if the row
  // hasn't streamed in yet (or we're offline) we fail open, never locking a
  // legitimate user out. Returns null while undetermined.
  const activeBetaFeatures = useMemo(() => {
    if (!effectiveAuth) return null;
    const row = settingsRows.find(
      (r: { organizationId: string }) => r.organizationId === effectiveAuth.organizationId,
    );
    return betaFeaturesFromSettingsRow(row, effectiveAuth.organizationId);
  }, [effectiveAuth, settingsRows]);

  useEffect(() => {
    if (!effectiveAuth || needsName) return;
    if (setupComplete !== true) return;
    if (!settingsReady || !activeBetaFeatures) return;
    const requiredFeature = betaFeatureForPath(pathname);
    if (!requiredFeature || activeBetaFeatures[requiredFeature]) return;

    toast.info(t("settings.betaFeatureDisabledToast"));
    setupRouter.replace("/~/settings");
  }, [
    activeBetaFeatures,
    effectiveAuth,
    needsName,
    pathname,
    settingsReady,
    setupComplete,
    setupRouter,
    t,
  ]);

  const [subscriptionCheckAt, setSubscriptionCheckAt] = useState<number | null>(null);
  useEffect(() => {
    const updateNow = () => setSubscriptionCheckAt(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const subscriptionBlocked = useMemo<boolean | null>(() => {
    if (!effectiveAuth) return null;
    if (!orgsReady) return null;
    if (subscriptionCheckAt === null) return null;
    const rootOrgId = effectiveAuth.currentOrg.parentOrgId ?? effectiveAuth.organizationId;
    const orgRow = organizations.find((o) => o.id.toString() === rootOrgId);
    if (!orgRow) return null; // can't determine — fail open
    return !evaluateSubscription(orgRow, subscriptionCheckAt).allowed;
  }, [effectiveAuth, orgsReady, organizations, subscriptionCheckAt]);

  useEffect(() => {
    if (!effectiveAuth || needsName) return;
    if (setupComplete !== true) return; // let onboarding finish first
    if (subscriptionBlocked !== true) return;
    // Don't bounce off the paywall or the billing page (where they pay).
    if (pathname?.startsWith("/~/subscribe")) return;
    if (pathname?.startsWith("/~/settings/billing")) return;
    setupRouter.replace("/~/subscribe");
  }, [effectiveAuth, needsName, setupComplete, subscriptionBlocked, pathname, setupRouter]);

  // ── Splash flow ───────────────────────────────────────────────────────
  // Cold load: SpacetimeDB tables aren't ready AND we have no cached auth.
  // Show the splash, loop the loading orbit, and once data lands play the
  // end animation (snap → ready → welcome) before unmounting the splash and
  // revealing the dashboard.
  //
  // Warm caches (auth restored from localStorage snapshot) skip the splash
  // entirely — there's nothing to wait for and flashing brand chrome on
  // every navigation is annoying.
  const [splashStarted] = useState(() => !isReady && !effectiveAuth);
  const [splashFinished, setSplashFinished] = useState(false);

  // Pick light vs dark splash based on the user's resolved theme — `dark`
  // class on <html> is the source of truth (applyThemeMode keeps it in sync).
  const [themeMode] = useThemeMode();
  const [splashDark, setSplashDark] = useState(true);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const resolve = () =>
      setSplashDark(document.documentElement.classList.contains("dark"));
    resolve();
    // Respond to system theme changes too (only matters when mode === "system").
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => resolve();
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, [themeMode]);

  // ── Underlying content ─────────────────────────────────────────────────
  // Compute the "real" content first so it can mount underneath the splash
  // overlay. Once auth is ready, this renders the dashboard (or NewUserSetup
  // / NamePrompt as appropriate). The splash sits on top and blurs out via
  // its hideWelcome path — the dashboard is already painted underneath, so
  // the transition is seamless.
  let realContent: React.ReactNode = null;
  if (isReady && !authState) {
    realContent = (
      <NewUserSetup
        onComplete={() => window.location.reload()}
        onSignOut={handleSignOut}
      />
    );
  } else if (authState?.kind === "choose") {
    // Multiple stores, none explicitly selected — full-screen picker. No
    // reload needed on pick: subscriptions are global, so setting state
    // recomputes the memo into kind "ready".
    realContent = (
      <StorePickerScreen
        stores={authState.choices}
        busyOrgId={pickedOrgId}
        onSelect={(id) => {
          try { localStorage.setItem("active_org_id", id); } catch {}
          setPickedOrgId(id);
        }}
        onSignOut={handleSignOut}
      />
    );
  } else if (effectiveAuth) {
    setActiveOrgId(effectiveAuth.organizationId);
    realContent = (
      <PermissionsProvider
        role={effectiveAuth.role}
        permissions={effectiveAuth.permissions}
        organizationId={effectiveAuth.organizationId}
        organizations={effectiveAuth.organizations}
        currentOrg={effectiveAuth.currentOrg}
      >
        {needsName ? (
          <NamePrompt memberId={effectiveAuth.memberId} onComplete={() => window.location.reload()} />
        ) : isSetupPath ? (
          children
        ) : (
          <>
            <MobileShell>{children}</MobileShell>
            <MerchivaQuickDialog />
            <PushNotificationPrompt />
            <TauriNotificationBridge />
          </>
        )}
      </PermissionsProvider>
    );
  }

  const showSplash = splashStarted && !splashFinished;
  const dataReady = isReady && !!authState;

  return (
    <>
      {realContent}
      {showSplash && (
        <div className="fixed inset-0 z-[100]">
          <SplashLoader
            dark={splashDark}
            ready={dataReady}
            hideWelcome
            onFinish={() => setSplashFinished(true)}
            tagline={t("layout.connecting")}
            status={t("layout.connecting")}
          />
          {timedOut && !dataReady && (
            <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-2 z-10">
              <p className="text-xs text-red-400">{t("layout.connectionTimedOut")}</p>
              <button
                onClick={handleSignOut}
                className={`rounded border px-3 py-1.5 text-xs ${splashDark ? "border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
              >
                {t("layout.signOutAndRetry")}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const next = pathname?.startsWith("/~/") ? pathname : "/~/";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [isLoaded, isSignedIn, pathname, router]);

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  return (
    <OfflineModeProvider>
      <SpacetimeProvider>
        <OfflineIndicator />
        <ShakeBugReport />
        <AuthLoader>{children}</AuthLoader>
      </SpacetimeProvider>
    </OfflineModeProvider>
  );
}
