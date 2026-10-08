"use client";

import { Suspense } from "react";
import { NewTabPage } from "@/components/browser-shell/core/new-tab-page";
import { NewTabPageContext } from "@/app/manager/new-tab/new-tab-page-context";

/**
 * /manager/new-tab — the browser shell's New Tab page. No PermissionGuard: every signed-in
 * member may open it; each section gates itself (launcher, documents). useSearchParams (`?q=`)
 * needs the Suspense boundary for prerendering.
 */
export default function NewTabRoute() {
  return (
    <Suspense fallback={null}>
      <NewTabPage />
      <NewTabPageContext />
    </Suspense>
  );
}
