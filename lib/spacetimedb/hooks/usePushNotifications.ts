"use client";

// Web Push subscription lifecycle. Registers /sw.js, manages permission, and
// keeps the SpacetimeDB push_subscription table in sync for the current user.

import { useCallback, useEffect, useState } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import { savePushSubscription, deletePushSubscription } from "@/lib/spacetimedb/actions";
import { isNativeShell } from "@/lib/native-shell";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

export interface UsePushNotificationsReturn {
  supported: boolean;
  permission: PermissionState;
  isSubscribed: boolean;
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const stdb = useSpacetimeDB();
  const { organizationId } = usePermissions();
  const [subs] = useTable(tables.pushSubscription);

  const [permission, setPermission] = useState<PermissionState>("default");
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Inside Tauri, native notifications are handled by useTauriNotifications.
    // Skip the web push path entirely so we don't register a service worker
    // (which doesn't reliably support push in WKWebView/WebKitGTK anyway).
    if (isNativeShell()) {
      setSupported(false);
      setPermission("unsupported");
      return;
    }
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);

    let cancelled = false;
    // Register the SW once. If it's already registered, this resolves with the
    // existing registration — idempotent.
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setCurrentEndpoint(sub?.endpoint ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const myEndpoints = (() => {
    const identity = stdb?.identity;
    if (!identity || !organizationId) return new Set<string>();
    return new Set(
      subs
        .filter(
          (s) =>
            s.organizationId === organizationId &&
            s.targetId.toString() === identity.toString()
        )
        .map((s) => s.endpoint)
    );
  })();

  const isSubscribed =
    !!currentEndpoint && myEndpoints.has(currentEndpoint) && permission === "granted";

  const enable = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    setBusy(true);
    setError(null);
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("VAPID public key not configured");

      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result !== "granted") {
        throw new Error("Notification permission " + result);
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!p256dh || !auth) throw new Error("Subscription missing keys");

      await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
      });
      setCurrentEndpoint(sub.endpoint);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe().catch(() => {});
      if (endpoint) await deletePushSubscription(endpoint);
      setCurrentEndpoint(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, permission, isSubscribed, busy, error, enable, disable };
}

// Helper kept for callers that don't want the full hook — useful e.g. in the
// notification-center dropdown to check whether the user can be prompted.
export { arrayBufferToBase64 };
