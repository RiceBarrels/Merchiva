"use client";

import { Suspense } from "react";
import { PermissionGuard } from "@/components/permission-guard";
import { DocsHome } from "@/components/docs/home/docs-home";
import { DocsHomePageContext } from "@/app/manager/docs/docs-home-page-context";

// Docs home. `DocsHome` reads `useSearchParams`, which must sit inside a
// Suspense boundary (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md).
// The tab title comes from the browser-shell route registry (`nav.docs`).
export default function DocsPage() {
  return (
    <PermissionGuard section="dashboard">
      <Suspense fallback={null}>
        <DocsHome />
        <DocsHomePageContext />
      </Suspense>
    </PermissionGuard>
  );
}
