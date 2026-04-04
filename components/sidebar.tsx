"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  Users,
  ShoppingBag,
  Zap,
  Settings,
  LogOut,
  UserCog,
  ChevronDown,
  Plus,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/context/permissions";
import { createOrganization, addOwnerMember, upsertUserProfile } from "@/lib/db/team";
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

function StoreSwitcher({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const { currentOrg, organizations, switchOrg } = usePermissions();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setError(null);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrg?.id) { setOpen(false); return; }
    setOpen(false);
    onClose?.();
    await switchOrg(orgId);
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newStoreName.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const orgId = await createOrganization(user.id, name);
      await addOwnerMember(user.id, orgId, name);
      await upsertUserProfile(user.id, name, orgId);
      setOpen(false);
      setCreating(false);
      setNewStoreName("");
      onClose?.();
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create store");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative px-3 py-2 border-b border-border">
      <button
        onClick={() => { setOpen((v) => !v); setCreating(false); setError(null); }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        <span className="flex-1 truncate text-left">{currentOrg?.name ?? "Select store"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded border border-border bg-card shadow-md">
          {/* Store list */}
          <div className="py-1">
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSwitch(org.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors text-left"
              >
                <span className="flex-1 truncate">{org.name}</span>
                {org.id === currentOrg?.id && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
              </button>
            ))}
          </div>

          <div className="border-t border-border py-1">
            {!creating ? (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                Create New Store
              </button>
            ) : (
              <form onSubmit={handleCreateStore} className="px-3 py-2 space-y-2">
                <input
                  autoFocus
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="Store name"
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={loading || !newStoreName.trim()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded bg-foreground px-2 py-1 text-xs font-medium text-background disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setError(null); setNewStoreName(""); }}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarContent({ onClose }: { onClose?: () => void }) {
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
    <aside className="flex h-full w-full flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-12 items-center gap-2 px-4 border-b border-border">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold leading-none tracking-tight">BizOps</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-muted-foreground hover:bg-muted"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Store switcher */}
      <StoreSwitcher onClose={onClose} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Management
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
                "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Bottom links */}
      <div className="px-2 py-2 space-y-0.5">
        {isOwner && (
          <Link
            href="/team"
            onClick={handleNavClick}
            className={cn(
              "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors",
              pathname === "/team"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
              "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors",
              pathname === "/settings"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

