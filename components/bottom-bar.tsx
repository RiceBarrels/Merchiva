"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, TrendingUp, Users, ShoppingBag,
  MonitorSmartphone, KeyRound, MessageSquare, Globe, Crown,
  Settings, MoreHorizontal, X, Trash2, FileBarChart, UserRoundSearch,
  Palette,
} from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { useT } from "@/lib/i18n/context";
import type { Permissions } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: keyof Permissions;
  mobileOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.home",      href: "/~/dashboard",      icon: LayoutDashboard, permissionKey: "dashboard" },
  { labelKey: "nav.inventory", href: "/~/inventory",       icon: Package,         permissionKey: "inventory" },
  { labelKey: "nav.wasteLog",  href: "/~/inventory/waste", icon: Trash2,          permissionKey: "inventory" },
  { labelKey: "nav.sales",     href: "/~/sales",           icon: TrendingUp,      permissionKey: "sales" },
  { labelKey: "nav.personnel", href: "/~/personnel",       icon: Users,           permissionKey: "staffing" },
  { labelKey: "nav.products",  href: "/~/products",        icon: ShoppingBag,     permissionKey: "products" },
  { labelKey: "nav.reports",   href: "/~/reports",         icon: FileBarChart,    permissionKey: "sales" },
  { labelKey: "nav.customers", href: "/~/customers",       icon: UserRoundSearch, permissionKey: "sales" },
  { labelKey: "nav.pos",       href: "/~/pos",             icon: MonitorSmartphone, permissionKey: "pos" },
  { labelKey: "nav.punchIn",   href: "/~/punch-in",        icon: KeyRound },
  { labelKey: "nav.chat",      href: "/~/chat",            icon: MessageSquare,   permissionKey: "staffing" },
  { labelKey: "nav.website",   href: "/~/builder",         icon: Globe,           permissionKey: "website" },
  { labelKey: "nav.design",    href: "/~/design",          icon: Palette,         permissionKey: "website" },
  { labelKey: "nav.membership", href: "/~/membership",     icon: Crown },
  { labelKey: "nav.settings",  href: "/~/settings",        icon: Settings },
];

const STORE_MACHINE_HREFS = new Set(["/~/pos", "/~/inventory", "/~/punch-in"]);

const PRIMARY_HREFS = ["/~/dashboard", "/~/personnel", "/~/chat"];

export function BottomBar() {
  const t = useT();
  const pathname = usePathname();
  const { can } = usePermissions();
  const [storeMachine] = useStoreMachineMode();
  const safeArea = getSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);

  const permitted = NAV_ITEMS.filter((item) => {
    if (item.href === "/~/punch-in" && !storeMachine) return false;
    if (storeMachine && !STORE_MACHINE_HREFS.has(item.href)) return false;
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
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-30 bg-black/20 backdrop-blur-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border rounded-t-xl"
              style={{ paddingBottom: safeArea.bottom + 56 }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("nav.account")}</span>
                <button onClick={() => setMoreOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1 px-3 pb-3">
                {overflowTabs.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { hapticLight(); setMoreOpen(false); }}
                      className={cn(
                        "flex flex-col items-center gap-1.5 py-2.5 rounded-[0.3rem] transition-colors",
                        active ? "bg-foreground/5 text-foreground" : "text-muted-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className={cn("text-[10px] leading-tight text-center", active ? "font-semibold" : "font-normal")}>
                        {t(item.labelKey)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm"
        style={{ paddingBottom: safeArea.bottom }}
      >
        <div className="flex items-stretch justify-around pt-2 pb-1.5">
          {primaryTabs.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <motion.div key={item.href} className="flex flex-1" whileTap={{ scale: 0.85 }} transition={{ type: "spring", damping: 15, stiffness: 400 }}>
                <Link
                  href={item.href}
                  onClick={() => hapticLight()}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <div className={cn("h-7 w-12 justify-center items-center flex rounded-full transition-colors", active && "bg-foreground/8")}>
                    <Icon className="w-[18px] h-[18px]" />
                  </div>
                  <span className={cn("text-[10px] leading-tight", active ? "font-semibold" : "font-normal")}>{t(item.labelKey)}</span>
                </Link>
              </motion.div>
            );
          })}

          {hasOverflow && (
            <motion.button
              onClick={() => { hapticMedium(); setMoreOpen((v) => !v); }}
              whileTap={{ scale: 0.85 }}
              transition={{ type: "spring", damping: 15, stiffness: 400 }}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                moreOpen || isOverflowActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <div className={cn("h-7 w-12 justify-center items-center flex rounded-full transition-colors", (moreOpen || isOverflowActive) && "bg-foreground/8")}>
                <MoreHorizontal className="w-[18px] h-[18px]" />
              </div>
              <span className={cn("text-[10px] leading-tight", (moreOpen || isOverflowActive) ? "font-semibold" : "font-normal")}>
                {t("common.more")}
              </span>
            </motion.button>
          )}
        </div>
      </nav>
    </>
  );
}
