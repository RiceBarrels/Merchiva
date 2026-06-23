"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, TrendingUp, Users, ShoppingBag,
  MonitorSmartphone, KeyRound, MessageSquare, Globe, Crown,
  Settings, MoreHorizontal, X, Trash2, FileBarChart, UserRoundSearch,
  Palette, Bell,
} from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import { useUnreadCount } from "@/components/notification-center";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import type { BetaFeatureKey } from "@/lib/beta-features";
import { useBetaFeatures } from "@/lib/spacetimedb/hooks/useBetaFeatures";
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
  betaFeature?: BetaFeatureKey;
  mobileOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.home",      href: "/~/",      icon: LayoutDashboard, permissionKey: "dashboard" },
  { labelKey: "nav.inventory", href: "/~/inventory",       icon: Package,         permissionKey: "inventory" },
  { labelKey: "nav.wasteLog",  href: "/~/inventory/waste", icon: Trash2,          permissionKey: "inventory" },
  { labelKey: "nav.sales",     href: "/~/sales",           icon: TrendingUp,      permissionKey: "sales" },
  { labelKey: "nav.personnel", href: "/~/personnel/schedule", icon: Users,        permissionKey: "staffing" },
  { labelKey: "nav.products",  href: "/~/products",        icon: ShoppingBag,     permissionKey: "products" },
  { labelKey: "nav.reports",   href: "/~/reports",         icon: FileBarChart,    permissionKey: "sales" },
  { labelKey: "nav.customers", href: "/~/customers",       icon: UserRoundSearch, permissionKey: "sales", betaFeature: "website" },
  { labelKey: "nav.pos",       href: "/~/pos",             icon: MonitorSmartphone, permissionKey: "pos", betaFeature: "pos" },
  { labelKey: "nav.punchIn",   href: "/~/punch-in",        icon: KeyRound },
  { labelKey: "nav.chat",      href: "/~/chat",            icon: MessageSquare,   permissionKey: "staffing" },
  { labelKey: "nav.notifications", href: "/~/notifications", icon: Bell },
  { labelKey: "nav.website",   href: "/~/builder",         icon: Globe,           permissionKey: "website", betaFeature: "website" },
  { labelKey: "nav.design",    href: "/~/design",          icon: Palette,         permissionKey: "website", betaFeature: "design" },
  { labelKey: "nav.membership", href: "/~/membership",     icon: Crown },
  { labelKey: "nav.settings",  href: "/~/settings",        icon: Settings },
];

const STORE_MACHINE_HREFS = new Set(["/~/pos", "/~/inventory", "/~/punch-in", "/~/chat"]);

const PRIMARY_HREFS = ["/~/", "/~/personnel", "/~/chat", "/~/notifications"];

export function BottomBar() {
  const t = useT();
  const pathname = usePathname();
  const { can } = usePermissions();
  const [storeMachine] = useStoreMachineMode();
  const { betaFeatures } = useBetaFeatures();
  const safeArea = getSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  const unreadCount = useUnreadCount();
  const badgeFor = (href: string) =>
    href === "/~/notifications" && unreadCount > 0 ? unreadCount : 0;

  const permitted = NAV_ITEMS.filter((item) => {
    if (item.href === "/~/punch-in" && !storeMachine) return false;
    if (storeMachine && !STORE_MACHINE_HREFS.has(item.href)) return false;
    if (item.betaFeature && !betaFeatures[item.betaFeature]) return false;
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
                  <Icon className="h-[20px] w-[20px]" />
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
                    <Icon className="w-[19px] h-[19px]" />
                    {badgeFor(item.href) > 0 && (
                      <span className="absolute -top-0.5 right-2 h-4 min-w-[16px] px-1 flex items-center justify-center bg-foreground text-background text-[9.5px] font-bold rounded-full leading-none">
                        {badgeFor(item.href) > 99 ? "99+" : badgeFor(item.href)}
                      </span>
                    )}
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
