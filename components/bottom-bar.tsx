"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, TrendingUp, Users, ShoppingBag,
  MonitorSmartphone, KeyRound, MessageSquare, Globe, Crown,
  Settings,
} from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import { hapticLight } from "@/lib/haptics";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { useT } from "@/lib/i18n/context";
import type { Permissions } from "@/lib/types";

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: keyof Permissions;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.home",      href: "/dashboard",  icon: LayoutDashboard, permissionKey: "dashboard" },
  { labelKey: "nav.inventory", href: "/inventory",   icon: Package,         permissionKey: "inventory" },
  { labelKey: "nav.sales",     href: "/sales",       icon: TrendingUp,      permissionKey: "sales" },
  { labelKey: "nav.staffing",  href: "/staffing",    icon: Users,           permissionKey: "staffing" },
  { labelKey: "nav.products",  href: "/products",    icon: ShoppingBag,     permissionKey: "products" },
  { labelKey: "nav.pos",       href: "/pos",         icon: MonitorSmartphone, permissionKey: "pos" },
  { labelKey: "nav.punchIn",   href: "/punch-in",    icon: KeyRound },
  { labelKey: "nav.chat",      href: "/chat",        icon: MessageSquare,   permissionKey: "staffing" },
  { labelKey: "nav.website",   href: "/builder",     icon: Globe,           permissionKey: "website" },
  { labelKey: "nav.membership", href: "/membership", icon: Crown },
];

const STORE_MACHINE_HREFS = new Set(["/pos", "/inventory", "/punch-in"]);

export function BottomBar() {
  const t = useT();
  const pathname = usePathname();
  const { can } = usePermissions();
  const [storeMachine] = useStoreMachineMode();
  const safeArea = getSafeAreaInsets();

  const permitted = NAV_ITEMS.filter((item) => {
    if (item.href === "/punch-in" && !storeMachine) return false;
    if (storeMachine && !STORE_MACHINE_HREFS.has(item.href)) return false;
    if (!item.permissionKey) return true;
    return can(item.permissionKey, "view");
  });

  // Show up to 4 nav items + Settings
  const tabs: NavItem[] = [
    ...permitted.slice(0, 4),
    { labelKey: "nav.settings", href: "/settings", icon: Settings },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm"
      style={{ paddingBottom: safeArea.bottom }}
    >
      <div className="flex items-stretch justify-around pt-2 pb-1.5">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => hapticLight()}
              className={`flex flex-1 flex-col items-center justify-center gap-1 transition-colors ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className={`h-6 w-6 ${active ? "[stroke-width:2.2]" : "[stroke-width:1.5]"}`} />
              <span className={`text-[10px] leading-tight ${active ? "font-semibold" : "font-normal"}`}>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
