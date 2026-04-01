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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { label: "Dashboard",        href: "/dashboard",  icon: LayoutDashboard },
  { label: "Inventory",        href: "/inventory",  icon: Package         },
  { label: "Sales Prediction", href: "/sales",      icon: TrendingUp      },
  { label: "Staffing",         href: "/staffing",   icon: Users           },
  { label: "Products",         href: "/products",   icon: ShoppingBag     },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleNavClick = () => {
    onClose?.();
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold leading-none tracking-tight">BizOps</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">AI Business Manager</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <p className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Management
        </p>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-150 min-h-[44px]",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110",
                  isActive && "text-primary-foreground"
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {isActive && (
                <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />
              )}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Bottom links */}
      <div className="p-3 space-y-1">
        <Link
          href="/settings"
          onClick={handleNavClick}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors min-h-[44px]",
            pathname === "/settings"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors min-h-[44px]"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>

      {/* AI badge */}
      <div className="px-3 pb-4">
        <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">AI Powered</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Claude analyzes your data for smart predictions and recommendations.
          </p>
        </div>
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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="h-3.5 w-3.5" />
          </div>
          <p className="text-sm font-semibold tracking-tight">BizOps</p>
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
