"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import type { Permissions } from "@/lib/types";
import { useT } from "@/lib/i18n/context";

/**
 * Wraps page content with a permission check.
 * - If the user lacks `view` permission for the section, redirects to /.
 * - `editRequired` additionally blocks if the user only has view (not edit) access,
 *   but instead of redirect just shows a read-only notice — pages handle that themselves.
 */
export function PermissionGuard({
  section,
  children,
}: {
  section: keyof Permissions;
  children: React.ReactNode;
}) {
  const t = useT();
  const { can } = usePermissions();
  const router = useRouter();
  const hasView = can(section, "view");

  useEffect(() => {
    if (!hasView) {
      router.replace("/~/dashboard");
    }
  }, [hasView, router]);

  if (!hasView) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("components.permissionGuard.noAccess")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
