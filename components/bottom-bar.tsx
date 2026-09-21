"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { AppStoreIcon, BugIcon, ChannelIcon, DashboardIcon, DirectoryIcon, DocsIcon, InventoryIcon, ReportsIcon, SalesIcon, SettingsIcon } from "@/components/device/app-icons";
import { usePermissions } from "@/lib/context/permissions";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { isManagerRouteEnabled } from "@/lib/device-apps";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { useT } from "@/lib/i18n/context";
import type { Permissions } from "@/lib/types";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: keyof Permissions;
  mobileOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.home",      href: "/manager/",      icon: DashboardIcon, permissionKey: "dashboard" },
  { labelKey: "nav.inventory", href: "/manager/inventory",       icon: InventoryIcon,   permissionKey: "inventory" },
  { labelKey: "nav.sales",     href: "/manager/sales",           icon: SalesIcon,       permissionKey: "sales" },
  { labelKey: "nav.personnel", href: "/manager/personnel/schedule", icon: DirectoryIcon, permissionKey: "staffing" },
  { labelKey: "nav.reports",   href: "/manager/reports",         icon: ReportsIcon,     permissionKey: "sales" },
  { labelKey: "nav.chat",      href: "/manager/channel",            icon: ChannelIcon,     permissionKey: "staffing" },
  { labelKey: "nav.docs", href: "/manager/docs", icon: DocsIcon, permissionKey: "dashboard" },
  { labelKey: "nav.bugs", href: "/manager/bugs", icon: BugIcon, permissionKey: "dashboard" },
  { labelKey: "nav.apps",      href: "/manager/apps",            icon: AppStoreIcon,    permissionKey: "settings" },
  { labelKey: "nav.settings",  href: "/manager/settings",        icon: SettingsIcon },
];

const STORE_MACHINE_HREFS = new Set(["/manager/inventory", "/manager/channel"]);

const PRIMARY_HREFS = ["/manager/", "/manager/personnel", "/manager/channel"];

export function BottomBar() {
  const t = useT();
  const pathname = usePathname();
  const { can } = usePermissions();
  const [storeMachine] = useStoreMachineMode();
  const safeArea = getSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);

  const { installed: installedApps } = useDeviceApps();
  const permitted = NAV_ITEMS.filter((item) => {
    if (storeMachine && !STORE_MACHINE_HREFS.has(item.href)) return false;
    if (!isManagerRouteEnabled(item.href, installedApps)) return false;
    if (!item.permissionKey) return true;
    return can(item.permissionKey, "view");
  });

  const primaryTabs = PRIMARY_HREFS
    .map((href) => permitted.find((item) => item.href === href))
    .filter(Boolean) as NavItem[];
  const overflowTabs = permitted.filter((item) => !PRIMARY_HREFS.includes(item.href));
  const hasOverflow = overflowTabs.length > 0;

  const isOverflowActive = overflowTabs.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <>
      {/* Overflow menu */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen} direction="bottom">
        <DrawerContent className="bg-background">
          <DrawerHeader className="flex flex-row items-center justify-between px-4 pt-3 pb-2 text-left">
            <DrawerTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("nav.account")}
            </DrawerTitle>
            <DrawerDescription className="sr-only">{t("common.more")}</DrawerDescription>
            <DrawerClose className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </DrawerClose>
          </DrawerHeader>
          <div className="grid grid-cols-4 gap-1.5 px-3 pb-4">
            {overflowTabs.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => { hapticLight(); setMoreOpen(false); }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 min-h-[68px] py-2.5 rounded-[0.4rem] transition-colors active:bg-muted",
                    active ? "bg-foreground/5 text-foreground" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-[24px] w-[24px]" />
                  <span className={cn("text-[10.5px] leading-tight text-center tracking-tight", active ? "font-semibold" : "font-medium")}>
                    {t(item.labelKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Bottom bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md"
        style={{ paddingBottom: safeArea.bottom }}
      >
        <div className="flex items-stretch justify-around pt-1.5 pb-1.5">
          {primaryTabs.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <motion.div key={item.href} className="flex flex-1" whileTap={{ scale: 0.9 }} transition={{ type: "spring", damping: 18, stiffness: 450 }}>
                <Link
                  href={item.href}
                  onClick={() => hapticLight()}
                  className={cn(
                    "relative flex flex-1 flex-col items-center justify-center gap-1 min-h-[52px] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="bottomBarActiveDot"
                      className="absolute top-0 h-[2px] w-7 rounded-full bg-foreground"
                      transition={{ type: "spring", damping: 25, stiffness: 350 }}
                    />
                  )}
                  <div className={cn("relative h-8 w-14 flex justify-center items-center rounded-full transition-colors", active && "bg-foreground/8")}>
                    <Icon className="w-[23px] h-[23px]" />
                  </div>
                  <span className={cn("text-[10.5px] leading-none tracking-tight", active ? "font-semibold" : "font-medium")}>{t(item.labelKey)}</span>
                </Link>
              </motion.div>
            );
          })}

          {hasOverflow && (
            <motion.button
              onClick={() => { hapticMedium(); setMoreOpen((v) => !v); }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", damping: 18, stiffness: 450 }}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 min-h-[52px] transition-colors",
                moreOpen || isOverflowActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {(moreOpen || isOverflowActive) && (
                <motion.span
                  layoutId="bottomBarActiveDot"
                  className="absolute top-0 h-[2px] w-7 rounded-full bg-foreground"
                  transition={{ type: "spring", damping: 25, stiffness: 350 }}
                />
              )}
              <div className={cn("h-8 w-14 flex justify-center items-center rounded-full transition-colors", (moreOpen || isOverflowActive) && "bg-foreground/8")}>
                <MoreHorizontal className="w-[19px] h-[19px]" />
              </div>
              <span className={cn("text-[10.5px] leading-none tracking-tight", (moreOpen || isOverflowActive) ? "font-semibold" : "font-medium")}>
                {t("common.more")}
              </span>
            </motion.button>
          )}
        </div>
      </nav>
    </>
  );
}
