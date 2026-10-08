"use client";

import { Suspense } from "react";
import { FormEditShell } from "@/components/forms/edit-shell";
import { Spinner } from "@/components/ui/loaders/geometric";
import { PermissionGuard } from "@/components/permission-guard";

/**
 * `/manager/forms/edit?id=<uuid>&view=build|preview|responses|share`. A static route with query params so the
 * Capacitor static export keeps it; `useSearchParams` sits inside Suspense. The renderer chunk loads only on the
 * Preview tab.
 */
export default function FormEditPage() {
  return (
    <PermissionGuard section="dashboard">
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <Spinner size={20} className="text-muted-foreground" />
          </div>
        }
      >
        <FormEditShell />
      </Suspense>
    </PermissionGuard>
  );
}
