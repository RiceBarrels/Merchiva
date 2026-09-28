"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ManagerShell } from "@/components/browser-shell/manager-shell";
import { ShellContextMenu } from "@/components/browser-shell/shared/shell-context-menu";
import { MerchivaDock } from "@/components/merchiva-dock";
import { SheetSessionKeeper } from "@/lib/sheets/use-sheet-session-keeper";
import { OfflineIndicator } from "@/components/offline-indicator";
import { ShakeBugReport } from "@/components/shake-bug-report";
import { PushNotificationPrompt } from "@/components/push-notification-prompt";
import { TauriNotificationBridge } from "@/components/tauri-notification-bridge";
import { DevicePermissionPrompt } from "@/components/device-permission-prompt";
import { PermissionsProvider } from "@/lib/context/permissions";
import { useSpacetimeStatus, SpacetimeProvider } from "@/lib/spacetimedb/provider";
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
import { getAppMode } from "@/lib/app-mode";

import { tables } from "@/lib/spacetimedb/generated";
import { getConnection, setActiveOrgId } from "@/lib/spacetimedb/client";
import { evaluateSubscription } from "@/lib/billing/subscription";
import type { Permissions, OrgRole, OrgSummary } from "@/lib/types";

// /store and /personal (and any sub-route) are the device surfaces — see
// lib/app-mode.ts. They share this layout for auth + providers only.
function isDeviceSurfacePath(pathname: string): boolean {
  return (
    pathname === "/store" ||
    pathname.startsWith("/store/") ||
    pathname === "/personal" ||
    pathname.startsWith("/personal/")
  );
}

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
  const conn = useSpacetimeStatus();
  const [orgMembers, membersReady] = useTable(tables.orgMember);
  const [organizations, orgsReady] = useTable(tables.organization);
  // Settings drives the "has the user finished setup?" check below. `createOrg`
  // seeds a settings row with createdAt === updatedAt; the setup wizard's
  // `updateSettings` deletes+reinserts the row with a fresh `updatedAt`. Any
  // measurable divergence between the two timestamps means the user has gone
  // past the setup form (either via the wizard or via /manager/settings later).
  const [settingsRows, settingsReady] = useTable(tables.settings);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Org the user picked from the store-picker screen this session.
  const [pickedOrgId, setPickedOrgId] = useState<string | null>(null);
  // /choose embeds its own store list, so it must render even when no store
  // is selected yet — open the first membership provisionally instead of
  // showing the full-screen picker. /store and /personal deliberately do NOT
  // get this treatment: they need a definite org, so a user with several
  // stores still sees the full-screen picker there first.
  const isChoosePath = usePathname() === "/choose";

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
    if (!preferredMembership && myMemberships.length > 1 && !isChoosePath) {
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
        logoUrl: org?.logoUrl ?? null,
      };
    });

    const currentOrgRow = organizations.find((o) => o.id.toString() === orgId.toString());
    const currentOrg: OrgSummary = {
      id: orgId.toString(),
      name: currentOrgRow?.name ?? "Unknown",
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
  }, [isReady, identity, orgMembers, organizations, pickedOrgId, isChoosePath]);

  // If a picked store loses its membership mid-session we land back in
  // "choose" with pickedOrgId still set — which would leave every picker row
  // disabled behind a busy state that can never resolve. Drop the pick so the
  // memo falls back to the stored preference (or shows an interactive picker).
  useEffect(() => {
    if (pickedOrgId && authState?.kind === "choose") setPickedOrgId(null);
  }, [pickedOrgId, authState]);

  // Memberships are decided once the tables have streamed in and we know
  // who we are: either the user has an org (authState) or provably has none
  // (NewUserSetup renders). Both are "loaded" — a brand-new account must not
  // sit behind the splash / connection timeout just because authState is null.
  const membershipsDecided = isReady && !!identity;

  // Start 8-second timeout while loading; clear it once loaded.
  useEffect(() => {
    if (membershipsDecided) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => setTimedOut(true), 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [membershipsDecided]);

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
  // Bare routes render without the sidebar/mobile shell: first-run setup, the
  // post-sign-in mode chooser, and the store / personal device surfaces (which
  // bring their own full-screen shells). A store/personal device may still
  // open /manager directly (bookmarks, "Switch to manager mode") — no redirect
  // happens here; the sidebar offers a way back via the manager override flag.
  const isSetupPath =
    pathname === "/manager/setup" ||
    pathname.startsWith("/manager/setup/") ||
    pathname === "/choose" ||
    isDeviceSurfacePath(pathname);
  const needsName = effectiveAuth ? (!effectiveAuth.memberDisplayName || !effectiveAuth.memberDisplayName.trim()) : false;

  // True once the user has touched settings (setup wizard's updateSettings or
  // any later /manager/settings edit). Null while the settings table is still
  // syncing — we hold off on the redirect until we have a definitive answer
  // so users aren't bounced to /manager/setup just because rows haven't streamed in
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
      setupRouter.replace("/manager/setup");
    }
  }, [effectiveAuth, isSetupPath, needsName, setupComplete, setupRouter]);

  // ── Single chooser ───────────────────────────────────────────────────────
  // Store, mode, device name and PIN are all picked once on /choose and never
  // asked again inside /manager, /store or /personal. Two cases send the user
  // there:
  //   • several memberships and no persisted store (authState "choose")
  //     → /choose?switch=1 (forces the chooser even if a mode is saved);
  //   • no app_mode on this device yet → /choose.
  // /choose itself and the first-run setup wizard are exempt so this can't
  // loop; app/manager/page.tsx's own redirect only fires when app_mode is set
  // (admin) or missing (→ /choose, same target), so there's no ping-pong.
  const isChooseRoute = pathname === "/choose";
  const isSetupWizard = pathname === "/manager/setup" || pathname.startsWith("/manager/setup/");
  // The paywall / billing pages are reachable from /choose before a mode is
  // saved (the chooser surfaces the subscription state itself), so they must
  // not bounce back to the chooser.
  const isPaywallPath =
    pathname.startsWith("/manager/subscribe") || pathname.startsWith("/manager/settings/billing");
  useEffect(() => {
    if (isChooseRoute) return;
    if (authState?.kind === "choose") {
      setupRouter.replace("/choose?switch=1");
      return;
    }
    if (!effectiveAuth || needsName || isSetupWizard || isPaywallPath) return;
    if (setupComplete !== true) return;
    if (!getAppMode()) setupRouter.replace("/choose");
  }, [authState, effectiveAuth, isChooseRoute, isPaywallPath, isSetupWizard, needsName, setupComplete, setupRouter]);

  // ── Subscription gate ────────────────────────────────────────────────────
  // An org may use the app while subscribed (Stripe active/trialing/past_due)
  // or inside its free-trial window. Subscription lives on the ROOT org, so
  // sub-stores inherit their parent's status. We only block when we can
  // positively read the org row and it's genuinely out of access — if the row
  // hasn't streamed in yet (or we're offline) we fail open, never locking a
  // legitimate user out. Returns null while undetermined.
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
    const orgRow = organizations.find(
      (o) => o.id.toString() === effectiveAuth.organizationId,
    );
    if (!orgRow) return null; // can't determine — fail open
    return !evaluateSubscription(orgRow, subscriptionCheckAt).allowed;
  }, [effectiveAuth, orgsReady, organizations, subscriptionCheckAt]);

  useEffect(() => {
    if (!effectiveAuth || needsName) return;
    if (setupComplete !== true) return; // let onboarding finish first
    if (subscriptionBlocked !== true) return;
    // Don't bounce off the paywall or the billing page (where they pay).
    if (pathname?.startsWith("/manager/subscribe")) return;
    if (pathname?.startsWith("/manager/settings/billing")) return;
    // /choose evaluates a provisional (first) membership before the user has
    // picked a store — gating it here would ping-pong with the single-chooser
    // redirect (/manager/subscribe → /choose?switch=1 → paywall → …). The
    // paywall applies once they land on the chosen store's home.
    if (pathname === "/choose") return;
    setupRouter.replace("/manager/subscribe");
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
  if (membershipsDecided && !authState) {
    realContent = (
      <NewUserSetup
        onComplete={() => window.location.reload()}
        onSignOut={handleSignOut}
      />
    );
  } else if (authState?.kind === "choose") {
    // Multiple stores, none explicitly selected. Every choice (store, mode,
    // device name, PIN) is made once on /choose — the effect above bounces
    // there, so just hold a spinner while the navigation happens.
    realContent = (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner size={20} className="text-muted-foreground" />
      </div>
    );
  } else if (effectiveAuth) {
    setActiveOrgId(effectiveAuth.organizationId);
    // DevicePermissionPrompt covers every app surface — /choose, /manager,
    // /personal and /store all come through here. It blocks nothing: it asks
    // for notifications, microphone, camera and location once per app load and
    // renders the app either way (see components/device-permission-prompt.tsx).
    realContent = (
      <PermissionsProvider
        role={effectiveAuth.role}
        permissions={effectiveAuth.permissions}
        organizationId={effectiveAuth.organizationId}
        organizations={effectiveAuth.organizations}
        currentOrg={effectiveAuth.currentOrg}
        onPickOrg={setPickedOrgId}
      >
        <DevicePermissionPrompt>
          {needsName ? (
            <NamePrompt memberId={effectiveAuth.memberId} onComplete={() => window.location.reload()} />
          ) : isSetupPath ? (
            <>
              {children}
              {/* Device surfaces get no shell, but once notifications are
                  granted they should still register for push. */}
              <PushNotificationPrompt />
              {/* Parked spreadsheet sessions follow reconnects (devices edit sheets too). */}
              <SheetSessionKeeper />
            </>
          ) : (
            <>
              <ManagerShell>{children}</ManagerShell>
              <ShellContextMenu />
              <SheetSessionKeeper />
              <MerchivaDock />
              <PushNotificationPrompt />
              <TauriNotificationBridge />
            </>
          )}
        </DevicePermissionPrompt>
      </PermissionsProvider>
    );
  }

  const showSplash = splashStarted && !splashFinished;
  const dataReady = membershipsDecided;

  // What the splash is waiting on right now, plus anything that went wrong,
  // so a stuck screen tells the user where it is stuck.
  const splashStatus = conn.tokenMissing ? t("layout.status.token")
    : !conn.connected && !stdb?.isActive
      ? (conn.retryCount > 0 ? t("layout.status.reconnecting").replace("{n}", String(conn.retryCount)) : t("layout.status.connecting"))
    : !identity ? t("layout.status.identity")
    : !membersReady ? t("layout.status.members")
    : !orgsReady ? t("layout.status.stores")
    : !authState ? t("layout.status.newUser")
    : authState.kind === "choose" ? t("layout.status.choose")
    : !settingsReady ? t("layout.status.settings")
    : t("layout.status.ready");
  const connError = conn.lastError ?? (stdb?.connectionError ? String(stdb.connectionError.message ?? stdb.connectionError) : null);
  const splashErrors: string[] = [
    connError ? t("layout.status.error").replace("{message}", connError) : null,
    conn.tokenMissing ? t("layout.notConnected") : null,
    (timedOut || conn.timedOut) && !dataReady ? t("layout.connectionTimedOut") : null,
  ].filter((x): x is string => !!x);

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
            status={splashStatus}
          />
          {splashErrors.length > 0 && !dataReady && (
            <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-2 z-10 px-6 text-center">
              {splashErrors.map((e) => (
                <p key={e} className="max-w-md break-words font-mono text-xs text-red-400">{e}</p>
              ))}
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
      const next =
        pathname?.startsWith("/manager/") || isDeviceSurfacePath(pathname ?? "")
          ? pathname
          : "/manager/";
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
