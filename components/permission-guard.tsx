"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PackageOpen, ShieldAlert } from "lucide-react";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { canManageDeviceApps, isManagerRouteEnabled } from "@/lib/device-apps";
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
  const { can, role, permissions } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const hasView = can(section, "view");
  // Optional org features stay off until installed from /manager/apps.
  const { installed, isReady: appsReady } = useDeviceApps();
  const featureOn = !appsReady || isManagerRouteEnabled(pathname ?? "", installed);
  const canManageApps = canManageDeviceApps(role, permissions);

  useEffect(() => {
    if (!hasView) {
      router.replace("/manager/");
    }
  }, [hasView, router]);

  if (hasView && !featureOn) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <PackageOpen className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("deviceApps.notEnabled")}</p>
        {canManageApps && (
          <Link href="/manager/apps" className="text-sm font-medium underline underline-offset-4">
            {t("deviceApps.openStore")}
          </Link>
        )}
      </div>
    );
  }

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
