"use client";

// Native OS notifications when running inside Tauri.
//
// The web notification path (service worker + Push API) doesn't work reliably
// in Tauri's system webview — Apple gates Service Worker push behind APNs.
// Instead, we listen to SpacetimeDB's notification table directly (which is
// already replicated to the client in real time) and fire native notifications
// through tauri-plugin-notification.
//
// Background story: even when the user "closes" the window, the Tauri process
// stays alive in the tray (see src-tauri/src/lib.rs close-to-tray handler), so
// SpacetimeDB stays connected and this hook keeps firing notifications.

import { useEffect, useRef } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { useNotifications } from "@/lib/spacetimedb/hooks";
import { usePermissions } from "@/lib/context/permissions";
import { isNativeShell } from "@/lib/native-shell";

const SEEN_KEY = "merchiva.tauri.lastNotificationId";
const PREF_KEY = "merchiva.tauri.notificationsEnabled";

// Lazy import the plugin so the web bundle never pays the cost and the import
// itself never throws when the global isn't there.
async function getNotificationApi() {
  if (!isNativeShell()) return null;
  try {
    return await import("@tauri-apps/plugin-notification");
  } catch {
    return null;
  }
}

async function getWindowApi() {
  if (!isNativeShell()) return null;
  try {
    return await import("@tauri-apps/api/window");
  } catch {
    return null;
  }
}

export function useTauriNotifications(): void {
  const stdb = useSpacetimeDB();
  const [notifications] = useNotifications();
  const { organizationId } = usePermissions();
  const identity = stdb?.identity;

  // Tracks the highest createdAt we've already surfaced. Persisted to
  // localStorage so a reconnect (which re-delivers the full table snapshot)
  // doesn't replay a flood of old notifications as fresh toasts.
  const lastSeenAtRef = useRef<number>(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isNativeShell()) return;
    if (!identity || !organizationId) return;

    // Initialize the high-water mark once. We start from the latest existing
    // notification rather than 0 so the first render after launch doesn't
    // re-notify every old row.
    if (!initializedRef.current) {
      const stored = window.localStorage.getItem(SEEN_KEY);
      const parsed = stored ? Number(stored) : NaN;
      if (Number.isFinite(parsed)) {
        lastSeenAtRef.current = parsed;
      } else {
        // No stored watermark — use the newest current row as the baseline so
        // we only notify on rows that arrive after this point.
        const me = identity.toString();
        let max = 0;
        for (const n of notifications) {
          if (n.organizationId !== organizationId) continue;
          if (n.targetId.toString() !== me) continue;
          const ts = createdAtMs(n);
          if (ts > max) max = ts;
        }
        lastSeenAtRef.current = max;
        window.localStorage.setItem(SEEN_KEY, String(max));
      }
      initializedRef.current = true;
      return;
    }

    // User opt-out: same toggle as the web push one.
    const optedIn = window.localStorage.getItem(PREF_KEY) !== "0";
    if (!optedIn) return;

    const me = identity.toString();
    const fresh = notifications
      .filter(
        (n) =>
          n.organizationId === organizationId &&
          n.targetId.toString() === me &&
          createdAtMs(n) > lastSeenAtRef.current
      )
      .sort((a, b) => createdAtMs(a) - createdAtMs(b));

    if (fresh.length === 0) return;

    const newWatermark = createdAtMs(fresh[fresh.length - 1]);
    lastSeenAtRef.current = newWatermark;
    window.localStorage.setItem(SEEN_KEY, String(newWatermark));

    void fireNotifications(fresh);
  }, [notifications, identity, organizationId]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createdAtMs(n: any): number {
  const c = n.createdAt;
  if (c && typeof c === "object" && "seconds" in c) {
    return Number(c.seconds) * 1000;
  }
  if (c && typeof c === "object" && "microsSinceUnixEpoch" in c) {
    return Number(c.microsSinceUnixEpoch) / 1000;
  }
  if (typeof c === "string") return new Date(c).getTime();
  if (typeof c === "number") return c;
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fireNotifications(rows: any[]): Promise<void> {
  const api = await getNotificationApi();
  if (!api) return;

  let granted = await api.isPermissionGranted();
  if (!granted) {
    const result = await api.requestPermission();
    granted = result === "granted";
  }
  if (!granted) return;

  for (const row of rows) {
    try {
      api.sendNotification({
        title: row.title || "Merchiva",
        body: row.body || "",
      });
    } catch {
      // best-effort; missing capability or unsupported platform falls through
    }
  }

  // Focus + navigate on click is not exposed by tauri-plugin-notification on
  // all platforms (action handlers are macOS-only with extra setup). For now
  // the user clicks the tray icon to surface the window; deep navigation can
  // be added later via a custom command.
  if (rows.some((r) => r.link)) {
    const winApi = await getWindowApi();
    if (winApi) {
      // Don't auto-focus on every push — would be jarring. Tray icon handles
      // surfacing the window. Reserved hook for future "click action" support.
    }
  }
}

// Toggle helper exposed to the Settings page, parallel to usePushNotifications.
export const tauriNotificationsPref = {
  isEnabled(): boolean {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(PREF_KEY) !== "0";
  },
  setEnabled(enabled: boolean): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
  },
};

// Request OS permission proactively from the Settings toggle so the user
// doesn't have to wait for the first notification to see the system prompt.
export async function requestTauriNotificationPermission(): Promise<boolean> {
  const api = await getNotificationApi();
  if (!api) return false;
  const granted = await api.isPermissionGranted();
  if (granted) return true;
  const result = await api.requestPermission();
  return result === "granted";
}
