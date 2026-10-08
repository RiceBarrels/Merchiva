"use client";

import { FormsHome } from "@/components/forms/list/forms-home";
import { PermissionGuard } from "@/components/permission-guard";

/**
 * `/manager/forms`: the Forms list. Gated by `dashboard` like Drive and Bugs; owners and managers get the builder
 * controls (decision C2: by role, no permission key).
 */
export default function FormsPage() {
  return (
    <PermissionGuard section="dashboard">
      <FormsHome />
    </PermissionGuard>
  );
}
