"use client";

import { Suspense } from "react";
import { PermissionGuard } from "@/components/permission-guard";
import { DocEditorRoute } from "@/components/docs/editor/doc-editor-route";
import { EditorSkeleton } from "@/components/docs/editor/editor-skeleton";
import { DocEditPageContext } from "@/app/manager/docs/edit/doc-edit-page-context";

/**
 * `/manager/docs/edit?id=<uuid>[&comment=<threadId>][&version=<versionId>][&new=1]` (plan D35).
 * A static route with query params so the Capacitor static export keeps it; `useSearchParams` sits inside Suspense.
 */
export default function DocEditPage() {
  return (
    <PermissionGuard section="dashboard">
      <Suspense fallback={<EditorSkeleton />}>
        <DocEditorRoute />
        <DocEditPageContext />
      </Suspense>
    </PermissionGuard>
  );
}
