import { useSyncExternalStore } from "react";
import { isCapacitorNative } from "@/lib/capacitor";

/*
 * Platform facts the mobile chrome branches on (mobile-safari spec §6.3, §18, §24):
 *   native         Capacitor app (iOS or Android)
 *   android        Android native: solid chrome surface (no backdrop blur on low-end GPUs)
 *   iosBrowserTab  iOS Safari as a plain browser tab (not a PWA, not native): Safari owns the
 *                  edge-swipe back gesture there, so the shell disables its own
 * None of these change while the page is open, so the value is computed once per page load.
 */

export interface MobilePlatform {
  readonly native: boolean;
  readonly android: boolean;
  readonly iosBrowserTab: boolean;
}

const SERVER_PLATFORM: MobilePlatform = Object.freeze({ native: false, android: false, iosBrowserTab: false });

let cached: MobilePlatform | null = null;

function capacitorPlatform(): string | null {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return cap?.getPlatform?.() ?? null;
  } catch {
    return null;
  }
}

function readPlatform(): MobilePlatform {
  if (cached) return cached;
  const native = isCapacitorNative();
  const platform = capacitorPlatform();
  const hasAndroidBridge = !!(window as unknown as { androidBridge?: unknown }).androidBridge;
  const ua = navigator.userAgent;
  const iosDevice = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  let standalone = false;
  try {
    standalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    standalone = false;
  }
  cached = Object.freeze({
    native,
    android: native && (platform === "android" || hasAndroidBridge),
    iosBrowserTab: !native && iosDevice && !standalone,
  });
  return cached;
}

/** Re-reads once after mount so hydration renders the server value first (same pattern as useIsCapacitor). */
function subscribe(notify: () => void): () => void {
  const id = window.setTimeout(notify, 0);
  return () => window.clearTimeout(id);
}

export function useMobilePlatform(): MobilePlatform {
  return useSyncExternalStore(subscribe, readPlatform, () => SERVER_PLATFORM);
}
