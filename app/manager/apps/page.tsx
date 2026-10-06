"use client";

// Plugins — the org's plugin store. Owners, managers and members with
// settings edit install optional Merchiva features here
// (components/device/plugin-store); everyone else is sent home.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { PluginStore } from "@/components/device/plugin-store";
import { canManageDeviceApps } from "@/lib/device-apps";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";

export default function DeviceAppsPage() {
  const t = useT();
  const router = useRouter();
  const { role, permissions } = usePermissions();
  const allowed = canManageDeviceApps(role, permissions);

  useEffect(() => {
    if (!allowed) router.replace("/manager/");
  }, [allowed, router]);

  if (!allowed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("components.permissionGuard.noAccess")}</p>
      </div>
    );
  }

  return <PluginStore />;
}
