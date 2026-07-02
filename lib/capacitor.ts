"use client";

import { useSyncExternalStore } from "react";

type CapacitorGlobal = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
};

export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const win = window as unknown as {
      Capacitor?: CapacitorGlobal;
      androidBridge?: unknown;
      webkit?: { messageHandlers?: { bridge?: unknown } };
    };
    const protocol = window.location.protocol;
    if (protocol === "capacitor:" || protocol === "ionic:" || protocol === "merchiva:") return true;
    if (win.androidBridge || win.webkit?.messageHandlers?.bridge) return true;
    const cap = win.Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    const platform = cap?.getPlatform?.();
    return platform === "ios" || platform === "android";
  } catch {
    return false;
  }
}

export function useIsCapacitor(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const id = window.setTimeout(notify, 0);
      return () => window.clearTimeout(id);
    },
    isCapacitorNative,
    () => false,
  );
}

// Routes hidden from the in-app navigation when running inside the native
// Capacitor shell — these are public-facing/SEO surfaces (storefront builder,
// promotional campaigns, pricing/changelog marketing pages) that don't belong
// inside the operator app.
export const CAPACITOR_HIDDEN_HREFS: ReadonlySet<string> = new Set([
  "/~/marketing",
  "/~/builder",
  "/pricing",
  "/changelog",
]);

export function isCapacitorHiddenPath(pathname: string): boolean {
  for (const href of CAPACITOR_HIDDEN_HREFS) {
    if (pathname === href || pathname.startsWith(href + "/")) return true;
  }
  return false;
}
