"use client";

// Full-screen door in front of every app surface (/choose, /manager, /personal,
// /store): the app needs notifications, microphone, camera and location, and
// nothing renders until each one is granted (or genuinely unavailable on the
// device). The page explains why each is needed, asks for all of them, and
// keeps asking — a dismissed prompt is re-asked automatically, a hard block
// shows how to unblock it and the gate lifts itself the moment it sees the
// change. Results persist per device via lib/device-permissions.ts so a device
// that already said yes opens straight into the app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Camera, Check, Loader2, LogOut, MapPin, Mic, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/loaders/geometric";
import { MerchivaLogo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { isCapacitorNative } from "@/lib/capacitor";
import {
  DEVICE_PERMISSION_KINDS,
  allSatisfied,
  isSatisfied,
  loadSavedPermissions,
  missingKinds,
  queryDevicePermissions,
  requestDevicePermission,
  savePermissions,
  subscribeDevicePermissionChanges,
  type DevicePermissionKind,
  type DevicePermissionState,
  type DevicePermissionStatus,
} from "@/lib/device-permissions";

const ICONS: Record<DevicePermissionKind, LucideIcon> = {
  notifications: Bell,
  microphone: Mic,
  camera: Camera,
  location: MapPin,
};

const TONE: Record<DevicePermissionStatus, StatusTone> = {
  granted: "success",
  unsupported: "neutral",
  prompt: "warning",
  denied: "danger",
};

// How many times a dismissed prompt is re-opened on its own before we fall
// back to the button. Chrome auto-blocks a site after repeated dismissals, so
// this stays small.
const MAX_AUTO_RETRIES = 2;
const RECHECK_MS = 2500;

export function DevicePermissionGate({ children }: { children: React.ReactNode }) {
  // Optimistic start: a device that already granted everything renders the
  // app immediately while the live state is re-verified underneath.
  const [state, setState] = useState<DevicePermissionState | null>(() => {
    const saved = loadSavedPermissions();
    return allSatisfied(saved) ? (saved as DevicePermissionState) : null;
  });
  const [checked, setChecked] = useState(false);
  const [asking, setAsking] = useState<DevicePermissionKind | null>(null);
  const [rounds, setRounds] = useState(0);
  const autoRetries = useRef(0);
  const askingRef = useRef(false);

  const refresh = useCallback(async () => {
    const next = await queryDevicePermissions();
    setState(next);
    setChecked(true);
    if (allSatisfied(next)) savePermissions(next);
    return next;
  }, []);

  useEffect(() => {
    refresh().catch(() => setChecked(true));
  }, [refresh]);

  const satisfied = !!state && allSatisfied(state);

  // While gated: re-check on browser change events and on a slow poll, so a
  // permission unblocked in site settings / iOS Settings lets the user in
  // without touching anything.
  useEffect(() => {
    if (satisfied) return;
    const unsubscribe = subscribeDevicePermissionChanges(() => {
      if (!askingRef.current) refresh().catch(() => {});
    });
    const id = window.setInterval(() => {
      if (!askingRef.current) refresh().catch(() => {});
    }, RECHECK_MS);
    return () => {
      unsubscribe();
      window.clearInterval(id);
    };
  }, [satisfied, refresh]);

  const askAll = useCallback(async () => {
    if (askingRef.current) return;
    askingRef.current = true;
    try {
      let next: DevicePermissionState = { ...(state ?? (await queryDevicePermissions())) };
      // One round asks for everything still missing. If the user closed a
      // prompt without answering (status stays "prompt"), open it again — a
      // couple of times on its own, then the button takes over.
      for (;;) {
        for (const kind of missingKinds(next)) {
          setAsking(kind);
          next = { ...next, [kind]: await requestDevicePermission(kind) };
          setState(next);
        }
        setAsking(null);
        savePermissions(next);
        setRounds((r) => r + 1);
        const still = missingKinds(next);
        const dismissedOnly = still.length > 0 && still.every((k) => next[k] === "prompt");
        if (!dismissedOnly || autoRetries.current >= MAX_AUTO_RETRIES) break;
        autoRetries.current += 1;
        await new Promise((r) => window.setTimeout(r, 1200));
      }
    } catch {
      setAsking(null);
    } finally {
      askingRef.current = false;
    }
  }, [state]);

  // Clicking the button resets the auto-retry budget.
  const onAsk = () => {
    autoRetries.current = 0;
    void askAll();
  };

  if (satisfied) return <>{children}</>;

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner size={20} className="text-muted-foreground" />
      </div>
    );
  }

  return (
    <PermissionPage
      state={state}
      asking={asking}
      rounds={rounds}
      onAsk={onAsk}
    />
  );
}

function PermissionPage({
  state,
  asking,
  rounds,
  onAsk,
}: {
  state: DevicePermissionState | null;
  asking: DevicePermissionKind | null;
  rounds: number;
  onAsk: () => void;
}) {
  const t = useT();
  const { signOut } = useAuth();
  const native = useMemo(() => isCapacitorNative(), []);
  const busy = asking !== null;
  const missing = state ? missingKinds(state) : [...DEVICE_PERMISSION_KINDS];
  const blocked = missing.filter((k) => state?.[k] === "denied");
  const dismissed = missing.filter((k) => state?.[k] === "prompt");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <MerchivaLogo />
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 flex-col justify-center px-6 pb-10">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="space-y-2">
            <IconTile icon={ShieldCheck} size="lg" />
            <h1 className="text-2xl font-bold tracking-tight">{t("devicePermissions.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("devicePermissions.subtitle")}</p>
          </div>

          <ul className="divide-y divide-border rounded-[0.3rem] border border-border">
            {DEVICE_PERMISSION_KINDS.map((kind) => {
              const status = state?.[kind] ?? "prompt";
              const Icon = ICONS[kind];
              const isAsking = asking === kind;
              return (
                <li key={kind} className="flex items-start gap-3 px-3 py-3">
                  <IconTile icon={Icon} tone={isSatisfied(status) ? "success" : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t(`devicePermissions.items.${kind}.title`)}</p>
                      {isAsking ? (
                        <StatusBadge tone="info">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {t("devicePermissions.status.asking")}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone={TONE[status]}>
                          {status === "granted" ? <Check className="h-3 w-3" /> : status === "denied" ? <X className="h-3 w-3" /> : null}
                          {t(`devicePermissions.status.${status}`)}
                        </StatusBadge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {t(`devicePermissions.items.${kind}.why`)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {blocked.length > 0 && (
            <Callout tone="danger" title={t("devicePermissions.blockedTitle")}>
              {native ? t("devicePermissions.blockedHelpNative") : t("devicePermissions.blockedHelpWeb")}{" "}
              {t("devicePermissions.autoDetect")}
            </Callout>
          )}

          {blocked.length === 0 && dismissed.length > 0 && rounds > 0 && !busy && (
            <Callout tone="warning" title={t("devicePermissions.dismissedTitle")}>
              {t("devicePermissions.dismissedBody")}
            </Callout>
          )}

          <div className="space-y-3">
            <Button onClick={onAsk} disabled={busy} className="h-11 w-full">
              {busy ? (
                <Spinner size={16} />
              ) : rounds > 0 ? (
                t("devicePermissions.askAgain")
              ) : (
                t("devicePermissions.allowAll")
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t("devicePermissions.required")}</p>
          </div>

          <button
            type="button"
            onClick={() => signOut()}
            className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("common.signOut")}
          </button>
        </div>
      </main>
    </div>
  );
}
