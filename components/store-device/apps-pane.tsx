"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { EmptyState } from "@/components/ui/empty-state";
import { AppsGrid, EmbeddedPage, MiniAppShell, catalogApp, useCatalogApps, useDeviceBuiltins, type DeviceApp, type OnShiftEntry } from "@/components/device";
import type { StoreMember } from "./use-org-members";
import { DirectoryPanel } from "./directory-panel";
import { DeviceSettingsPanel } from "./device-settings-panel";

export interface AppsPaneProps {
  members: StoreMember[];
  /** Logged-in operator — gates which catalog apps appear. */
  operator: StoreMember;
  /** PIN the operator logged in with (null after a QR log-in). */
  operatorPin: string | null;
  forMember: (memberId: string) => OnShiftEntry | null;
  onPanelOpenChange?: (open: boolean) => void;
  /** Phone: 4-column grid, medium tiles. Tablet: 6 columns, large tiles. */
  phone?: boolean;
  className?: string;
}

/** Logged-in right pane: home-screen grid; apps open full-screen over the device. */
export function AppsPane({ operator, operatorPin, members, forMember, onPanelOpenChange, phone = false, className }: AppsPaneProps) {
  const t = useT();
  const [openApp, setOpenApp] = useState<DeviceApp["id"] | null>(null);
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  // The tapped tile's icon: the app grows out of it (MiniAppShell).
  const [openOrigin, setOpenOrigin] = useState<HTMLElement | null>(null);

  // Punching happens at log-in (PunchPrompt) and in the log-out drawer, so
  // there is no separate Punch In app on the store device. Every other
  // Merchiva feature the operator may view comes from the shared catalog,
  // filtered to the apps installed from /manager/apps.
  const builtins = useDeviceBuiltins("store");
  const catalogApps = useCatalogApps("store", operator);
  const apps: DeviceApp[] = [...builtins, ...catalogApps];
  const openCatalog = openApp ? catalogApp(openApp) : null;
  const title = openApp ? (openCatalog ? t(`device.catalog.${openApp}`) : t(`storeDevice.apps.${openApp}`)) : "";

  const open = (id: DeviceApp["id"], origin?: HTMLElement) => {
    hapticLight();
    setOpenApp(id);
    setOpenRoute(null);
    setOpenOrigin(origin ?? null);
    onPanelOpenChange?.(true);
  };
  const close = () => {
    hapticLight();
    setOpenApp(null);
    setOpenRoute(null);
    onPanelOpenChange?.(false);
  };

  return (
    <div className={cn("relative min-h-0 overflow-hidden bg-background", className)}>
      <AppsGrid apps={apps} onOpen={open} columns={phone ? 4 : 6} size={phone ? "md" : "lg"} className="absolute inset-0" />
      <MiniAppShell
        open={openApp !== null}
        title={title}
        app={openApp ? apps.find((a) => a.id === openApp) ?? null : null}
        origin={openOrigin}
        onClose={close}
        closeLabel={t("storeDevice.close")}
      >
        {openCatalog && (
          <EmbeddedPage
            appId={openCatalog.id}
            route={openRoute}
            actor={operator}
            member={{ id: operator.id, displayName: operator.displayName, role: operator.role, userIdHex: operator.userIdHex, punchInCode: operatorPin }}
            onNavigate={(id, route) => { hapticLight(); setOpenApp(id); setOpenRoute(route); }}
          />
        )}
        {openApp === "directory" && <DirectoryPanel members={members} forMember={forMember} className="h-full" />}
        {openApp === "settings" && <DeviceSettingsPanel className="h-full" />}
        {openApp === "requests" && <EmptyState icon={Inbox} title={t("storeDevice.apps.requests")} description={t("storeDevice.comingSoon")} className="h-full" />}
      </MiniAppShell>
    </div>
  );
}
