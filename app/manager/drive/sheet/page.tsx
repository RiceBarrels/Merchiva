"use client";

import { Suspense } from "react";
import { PermissionGuard } from "@/components/permission-guard";
import { SheetEditorRoute } from "@/components/sheets/sheet-editor-route";
import { SheetSkeleton } from "@/components/sheets/editor/sheet-skeleton";

/**
 * `/manager/drive/sheet?id=<uuid>[&new=1][&version=<versionId>]` (sheets.md §10.1). A static route with query params so
 * the Capacitor static export keeps it; `useSearchParams` sits inside Suspense. Nothing here loads Univer: the editor
 * chunk is a dynamic import of the route.
 */
export default function SheetEditPage() {
  return (
    <PermissionGuard section="dashboard">
      <Suspense fallback={<SheetSkeleton />}>
        <SheetEditorRoute />
      </Suspense>
    </PermissionGuard>
  );
}
