"use client";

import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/capacitor";

// Unregister any previously installed service workers.
// The service worker was removed to prevent it from intercepting
// SpacetimeAuth (OIDC) requests and breaking the auth flow.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (isCapacitorNative()) return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((reg) => reg.unregister()))
        // Blocked in some privacy modes; nothing to clean up then.
        .catch((err: unknown) => console.error("[service-worker] cleanup failed", err));
    }
  }, []);

  return null;
}
