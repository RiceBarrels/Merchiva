"use client";

import { Suspense } from "react";
import { PermissionGuard } from "@/components/permission-guard";
import { DriveHome } from "@/components/drive/drive-home";

// Drive home. `DriveHome` reads `useSearchParams`, which must sit inside a Suspense boundary
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md).
// The tab title comes from the browser-shell route registry (`nav.drive`), or the open folder's name.
export default function DrivePage() {
  return (
    <PermissionGuard section="dashboard">
      <Suspense fallback={null}>
        <DriveHome />
      </Suspense>
    </PermissionGuard>
  );
}
