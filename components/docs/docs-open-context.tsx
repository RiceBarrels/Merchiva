"use client";

// How a Docs screen opens another Docs URL.
//
// In the manager back office that is the browser shell (or the router when a
// page runs outside it): `useTabActions().openUrl`. The device surfaces
// (/store, /personal) render the same Docs screens inside a panel and have no
// URL of their own, so they install an override here and swap the panel's
// screen instead of navigating away from the device.

import { createContext, useContext, type ReactNode } from "react";
import { useTabActions } from "@/lib/browser-shell";
import type { OpenDisposition } from "@/lib/browser-shell/types";

export type DocsOpenUrl = (url: string, disposition: OpenDisposition) => void;

const DocsOpenContext = createContext<DocsOpenUrl | null>(null);

export function DocsOpenProvider({ open, children }: { open: DocsOpenUrl; children: ReactNode }) {
  return <DocsOpenContext.Provider value={open}>{children}</DocsOpenContext.Provider>;
}

/** The surface's override, or null in the manager back office. */
export function useDocsOpenOverride(): DocsOpenUrl | null {
  return useContext(DocsOpenContext);
}

/** Opens a Docs URL: the surface's override when there is one, else the shell. */
export function useDocsOpenUrl(): DocsOpenUrl {
  const override = useContext(DocsOpenContext);
  const { openUrl } = useTabActions();
  return override ?? openUrl;
}
