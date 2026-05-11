"use client";

import { useEffect, useState } from "react";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
};

export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export function useIsCapacitor(): boolean {
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(isCapacitorNative());
  }, []);
  return isNative;
}

// Routes hidden from the in-app navigation when running inside the native
// Capacitor shell — these are public-facing/SEO surfaces (storefront builder,
// promotional campaigns, pricing/changelog marketing pages) that don't belong
// inside the operator app.
export const CAPACITOR_HIDDEN_HREFS: ReadonlySet<string> = new Set([
  "/marketing",
  "/builder",
  "/pricing",
  "/changelog",
]);

export function isCapacitorHiddenPath(pathname: string): boolean {
  for (const href of CAPACITOR_HIDDEN_HREFS) {
    if (pathname === href || pathname.startsWith(href + "/")) return true;
  }
  return false;
}
