"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { tabsStore } from "@/lib/browser-shell/store";

/**
 * Safety net for the history bridge (tab-state spec §7.7). After every committed pathname or
 * search change it clears tab spinners and checks that the URL still matches the active tab's
 * entry, repairing drift (entries written before the bridge installed, foreign wrappers).
 * Rendered inside <Suspense>: useSearchParams opts the subtree out of prerendering.
 */
export function RouterInvariantGuard(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  useEffect(() => {
    // The history write already happened (Next writes in useInsertionEffect), so location is current.
    if (pathname !== null) tabsStore.onRouteCommitted(window.location.href);
  }, [pathname, search]);

  return null;
}
