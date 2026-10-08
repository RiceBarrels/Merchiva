"use client";

import { Suspense } from "react";
import { PermissionGuard } from "@/components/permission-guard";
import { SlidesEditorRoute } from "@/components/slides/editor/slides-editor-route";
import { SlidesEditorSkeleton } from "@/components/slides/editor/slides-editor-skeleton";

/**
 * `/manager/drive/slides?id=<uuid>[&slide=<slideId>][&version=<versionId>][&new=1][&present=1]` (slides.md §7.1).
 * A static route with query params so the Capacitor static export keeps it; `useSearchParams` sits inside Suspense.
 * Nothing here loads the editor: its chunk is a dynamic import of the route.
 */
export default function SlidesEditPage() {
  return (
    <PermissionGuard section="dashboard">
      <Suspense fallback={<SlidesEditorSkeleton />}>
        <SlidesEditorRoute />
      </Suspense>
    </PermissionGuard>
  );
}
