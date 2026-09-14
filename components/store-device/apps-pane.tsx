"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Inbox, FileText } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { EmptyState } from "@/components/ui/empty-state";
import { AppsGrid, EmbeddedPage, catalogApp, useCatalogApps, useDeviceBuiltins, type DeviceApp, type OnShiftEntry } from "@/components/device";
import type { StoreMember } from "./use-org-members";
import { DirectoryPanel } from "./directory-panel";
import { DeviceSettingsPanel } from "./device-settings-panel";

export interface AppsPaneProps {
  members: StoreMember[];
  /** Logged-in operator — gates which catalog apps appear. */
  operator: StoreMember;
  forMember: (memberId: string) => OnShiftEntry | null;
  onPanelOpenChange?: (open: boolean) => void;
  /** Phone: 4-column grid, medium tiles. Tablet: 6 columns, large tiles. */
  phone?: boolean;
  className?: string;
}

/** Logged-in right pane: home-screen grid; apps open as a sliding panel. */
export function AppsPane({ operator, members, forMember, onPanelOpenChange, phone = false, className }: AppsPaneProps) {
  const t = useT();
  const [openApp, setOpenApp] = useState<DeviceApp["id"] | null>(null);
  const [openRoute, setOpenRoute] = useState<string | null>(null);

  // Punching happens at log-in (PunchPrompt) and in the log-out drawer, so
  // there is no separate Punch In app on the store device. Every other
  // Merchiva feature the operator may view comes from the shared catalog,
  // filtered to the apps installed from /manager/apps.
  const builtins = useDeviceBuiltins("store");
  const catalogApps = useCatalogApps("store", operator);
  const apps: DeviceApp[] = [...builtins, ...catalogApps];
  const openCatalog = openApp ? catalogApp(openApp) : null;
  const title = openApp ? (openCatalog ? t(`device.catalog.${openApp}`) : t(`storeDevice.apps.${openApp}`)) : "";

  const open = (id: DeviceApp["id"]) => {
    hapticLight();
    setOpenApp(id);
    setOpenRoute(null);
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
      <AnimatePresence>
        {openApp && (
          <motion.div
            key={openApp}
            data-no-swipe
            className="absolute inset-0 z-10 flex flex-col bg-background"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="h-11 shrink-0 flex items-center justify-between px-4 border-b border-border">
              <span className="text-[13px] font-semibold">{title}</span>
              <button type="button" onClick={close} aria-label={t("storeDevice.close")} className="h-8 w-8 grid place-items-center rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {openCatalog && (
                <EmbeddedPage
                  appId={openCatalog.id}
                  route={openRoute}
                  actor={operator}
                  member={{ id: operator.id, displayName: operator.displayName, role: operator.role, userIdHex: operator.userIdHex, punchInCode: operator.punchInCode }}
                  onNavigate={(id, route) => { hapticLight(); setOpenApp(id); setOpenRoute(route); }}
                />
              )}
              {openApp === "directory" && <DirectoryPanel members={members} forMember={forMember} className="h-full" />}
              {openApp === "settings" && <DeviceSettingsPanel members={members} className="h-full" />}
              {openApp === "requests" && <EmptyState icon={Inbox} title={t("storeDevice.apps.requests")} description={t("storeDevice.comingSoon")} className="h-full" />}
              {openApp === "docs" && <EmptyState icon={FileText} title={t("storeDevice.apps.docs")} description={t("storeDevice.comingSoon")} className="h-full" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
