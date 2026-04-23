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
import type { Permissions } from "@/lib/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: keyof Permissions;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home",      href: "/dashboard",  icon: LayoutDashboard, permissionKey: "dashboard" },
  { label: "Inventory", href: "/inventory",   icon: Package,         permissionKey: "inventory" },
  { label: "Sales",     href: "/sales",       icon: TrendingUp,      permissionKey: "sales" },
  { label: "Staffing",  href: "/staffing",    icon: Users,           permissionKey: "staffing" },
  { label: "Products",  href: "/products",    icon: ShoppingBag,     permissionKey: "products" },
  { label: "POS",       href: "/pos",         icon: MonitorSmartphone, permissionKey: "pos" },
  { label: "Punch In",  href: "/punch-in",    icon: KeyRound },
  { label: "Chat",      href: "/chat",        icon: MessageSquare,   permissionKey: "staffing" },
  { label: "Website",   href: "/builder",     icon: Globe,           permissionKey: "website" },
  { label: "Membership",href: "/membership",  icon: Crown },
];

const STORE_MACHINE_HREFS = new Set(["/pos", "/inventory", "/punch-in"]);

export function BottomBar() {
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
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 backdrop-blur-sm"
      style={{ paddingBottom: safeArea.bottom }}
    >
      <div className="flex items-stretch justify-around h-13">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => hapticLight()}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors ${
                active
                  ? "text-stone-900"
                  : "text-stone-400"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
