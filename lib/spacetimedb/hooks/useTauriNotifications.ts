"use client";

// Native OS notifications when running inside Tauri.
//
// The web notification path (service worker + Push API) doesn't work reliably
// in Tauri's system webview — Apple gates Service Worker push behind APNs.
// Instead the app's one notification watcher (lib/notifications/alerts.ts) calls
// fireTauriNotification for a new row while the window is not in front, through
// tauri-plugin-notification. The settings toggle below is the opt-out.

import { isNativeShell } from "@/lib/native-shell";

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

/**
 * Shows one native notification. Resolves true when it was handed to the OS; false
 * outside Tauri, when the person turned them off, without permission, or when the
 * plugin is missing on the native side. Never rejects.
 */
export async function fireTauriNotification(title: string, body: string): Promise<boolean> {
  if (!tauriNotificationsPref.isEnabled()) return false;
  try {
    const api = await getNotificationApi();
    if (!api) return false;
    let granted = await api.isPermissionGranted();
    if (!granted) granted = (await api.requestPermission()) === "granted";
    if (!granted) return false;
    api.sendNotification({ title: title || "Merchiva", body });
    return true;
  } catch {
    // Missing capability, unregistered plugin or unsupported platform.
    return false;
  }
}

// Toggle helper exposed to the Settings page, parallel to usePushNotifications.
export const tauriNotificationsPref = {
  isEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(PREF_KEY) !== "0";
    } catch {
      return true;
    }
  },
  setEnabled(enabled: boolean): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
    } catch {
      // localStorage unavailable — the default (on) stays.
    }
  },
};

// Request OS permission proactively from the Settings toggle so the user
// doesn't have to wait for the first notification to see the system prompt.
export async function requestTauriNotificationPermission(): Promise<boolean> {
  try {
    const api = await getNotificationApi();
    if (!api) return false;
    const granted = await api.isPermissionGranted();
    if (granted) return true;
    const result = await api.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}
