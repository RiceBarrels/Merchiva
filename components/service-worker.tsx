"use client";

import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/capacitor";

/** The Web Push worker registered by usePushNotifications. */
const PUSH_WORKER_PATH = "/sw.js";

// Unregister LEGACY service workers.
//
// An old worker used to intercept SpacetimeAuth (OIDC) requests and break the
// auth flow, so this component removed every registration on load. But
// `public/sw.js` came back as the Web Push worker — usePushNotifications
// registers it — and this ran on every page load, so it tore that registration
// down again and push notifications stopped arriving. Keep /sw.js; evict
// anything else.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (isCapacitorNative()) return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) =>
          regs.forEach((reg) => {
            const script = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? "";
            if (new URL(script, location.origin).pathname === PUSH_WORKER_PATH) return;
            void reg.unregister();
          }),
        )
        // Blocked in some privacy modes; nothing to clean up then.
        .catch((err: unknown) => console.error("[service-worker] cleanup failed", err));
    }
  }, []);

  return null;
}
