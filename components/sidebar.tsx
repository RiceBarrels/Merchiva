"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  Users,
  ShoppingBag,
  ChevronRight,
  Zap,
  Settings,
  LogOut,
  Menu,
  X,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/context/permissions";
import type { Permissions } from "@/lib/types";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: keyof Permissions;
};

const navItems: NavItem[] = [
  { label: "Dashboard",        href: "/dashboard",  icon: LayoutDashboard, permissionKey: "dashboard" },
  { label: "Inventory",        href: "/inventory",  icon: Package,         permissionKey: "inventory" },
  { label: "Sales Prediction", href: "/sales",      icon: TrendingUp,      permissionKey: "sales"     },
  { label: "Staffing",         href: "/staffing",   icon: Users,           permissionKey: "staffing"  },
  { label: "Products",         href: "/products",   icon: ShoppingBag,     permissionKey: "products"  },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { can, isOwner } = usePermissions();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleNavClick = () => {
    onClose?.();
  };

  const visibleNavItems = navItems.filter((item) => {
    if (!item.permissionKey) return true;
    return can(item.permissionKey, "view");
  });

  return (
    <aside className="flex h-full w-56 flex-col border-r border-stone-200 bg-white">
      {/* Logo */}
      <div className="flex h-10 items-center gap-2 px-3 border-b border-stone-200">
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-stone-900 text-white">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <p className="text-sm font-semibold leading-none tracking-tight text-stone-900">BizOps</p>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden ml-auto p-1 rounded-sm text-stone-500 hover:bg-stone-100"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Management
        </p>
        {visibleNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {isActive && (
                <ChevronRight className="ml-auto h-3 w-3 opacity-50" />
              )}
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-stone-200" />

      {/* Bottom links */}
      <div className="p-2 space-y-0.5">
        {isOwner && (
          <Link
            href="/team"
            onClick={handleNavClick}
            className={cn(
              "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors",
              pathname === "/team"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            )}
          >
            <UserCog className="h-4 w-4 shrink-0" />
            Team
          </Link>
        )}
        {can("settings", "view") && (
          <Link
            href="/settings"
            onClick={handleNavClick}
            className={cn(
              "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors",
              pathname === "/settings"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-10 items-center gap-2 border-b border-stone-200 bg-white px-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1 rounded-sm text-stone-500 hover:bg-stone-100"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-stone-900 text-white">
            <Zap className="h-3.5 w-3.5" />
          </div>
          <p className="text-sm font-semibold tracking-tight text-stone-900">BizOps</p>
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        <SidebarContent />
      </div>
    </>
  );
}
