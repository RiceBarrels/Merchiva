"use client";

import { useEffect } from "react";

// Unregister any previously installed service workers.
// The service worker was removed to prevent it from intercepting
// SpacetimeAuth (OIDC) requests and breaking the auth flow.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
    }
  }, []);

  return null;
}
