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
  X,
  ChevronDown,
  Plus,
  Check,
  Loader2,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/context/permissions";
import { createOrganization, addOwnerMember, upsertUserProfile } from "@/lib/db/team";
import type { Permissions } from "@/lib/types";

const SIDEBAR_WIDTH = 280;
const EDGE_THRESHOLD = 20;
const SNAP_THRESHOLD = 0.4;
const VELOCITY_THRESHOLD = 0.3; // px/ms

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
    hapticMedium();
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
      hapticSuccess();
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
        onClick={() => { hapticLight(); setOpen((v) => !v); setCreating(false); setError(null); }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        <span className="flex-1 truncate text-left">{currentOrg?.name ?? "Select store"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded border border-border bg-card shadow-md">
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
    hapticLight();
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
            className="p-1 rounded text-muted-foreground hover:bg-muted"
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

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const contentRef = useRef<HTMLDivElement>(null);

  // Refs for touch tracking — avoids stale closures in the event listeners
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const lastX = useRef(0);
  const isEdge = useRef(false);
  const isHoriz = useRef<boolean | null>(null);
  const isOpenRef = useRef(false);
  const draggingRef = useRef(false);

  // Keep refs in sync with state
  isOpenRef.current = isOpen;
  draggingRef.current = dragging;

  // Close on navigation
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Attach touch listeners with passive:false on touchmove for preventDefault
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      startX.current = t.clientX;
      startY.current = t.clientY;
      startTime.current = Date.now();
      lastX.current = t.clientX;
      isHoriz.current = null;
      // Valid swipe: starting from left edge (to open) or sidebar already open (can close)
      isEdge.current = isOpenRef.current || t.clientX <= EDGE_THRESHOLD;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isEdge.current) return;

      const t = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;

      // Decide swipe axis on first meaningful movement
      if (isHoriz.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isHoriz.current = Math.abs(dx) > Math.abs(dy);
      }

      // Let vertical scrolls pass through
      if (isHoriz.current === false) return;

      e.preventDefault();
      lastX.current = t.clientX;

      let offset: number;
      if (isOpenRef.current) {
        // Sidebar open: drag left to close (offset decreases from SIDEBAR_WIDTH toward 0)
        offset = Math.max(0, Math.min(SIDEBAR_WIDTH, SIDEBAR_WIDTH + dx));
      } else {
        // Sidebar closed: drag right from edge to open (offset grows from 0 to SIDEBAR_WIDTH)
        offset = Math.max(0, Math.min(SIDEBAR_WIDTH, dx));
      }

      setDragging(true);
      setDragOffset(offset);
    }

    function onTouchEnd() {
      if (!draggingRef.current) {
        isEdge.current = false;
        return;
      }

      const dx = lastX.current - startX.current;
      const dt = Math.max(1, Date.now() - startTime.current);
      const velocity = dx / dt; // positive = rightward

      // Determine final offset to evaluate snap threshold
      let currentOffset: number;
      if (isOpenRef.current) {
        currentOffset = Math.max(0, Math.min(SIDEBAR_WIDTH, SIDEBAR_WIDTH + dx));
      } else {
        currentOffset = Math.max(0, Math.min(SIDEBAR_WIDTH, dx));
      }

      let shouldOpen: boolean;
      if (isOpenRef.current) {
        // Currently open → close if dragged past 40% or fast leftward swipe
        shouldOpen = !(
          currentOffset < SIDEBAR_WIDTH * (1 - SNAP_THRESHOLD) ||
          velocity < -VELOCITY_THRESHOLD
        );
      } else {
        // Currently closed → open if dragged past 40% or fast rightward swipe
        shouldOpen =
          currentOffset > SIDEBAR_WIDTH * SNAP_THRESHOLD ||
          velocity > VELOCITY_THRESHOLD;
      }

      setIsOpen(shouldOpen);
      setDragging(false);
      setDragOffset(0);
      isEdge.current = false;
      isHoriz.current = null;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []); // empty deps — all mutable values accessed via refs

  const translateX = dragging ? dragOffset : isOpen ? SIDEBAR_WIDTH : 0;

  return (
    <>
      {/* ── Mobile layout ── */}
      <div className="md:hidden relative h-screen overflow-hidden bg-background">
        {/* Sidebar: always rendered, fixed at left, sits behind content at z-10 */}
        <div className="fixed inset-y-0 left-0 w-[280px] z-10">
          <SidebarContent onClose={() => setIsOpen(false)} />
        </div>

        {/* Main content: slides right to reveal the sidebar (z-20) */}
        <div
          ref={contentRef}
          className="absolute inset-0 z-20 flex flex-col bg-background overflow-hidden"
          style={{
            transform: `translateX(${translateX}px)`,
            transition: dragging
              ? "none"
              : "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
            ...(translateX > 0 && {
              boxShadow: "-4px 0 16px rgba(0, 0, 0, 0.12)",
            }),
          }}
        >
          {/* Mobile header bar */}
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
            <button
              onClick={() => setIsOpen((v) => !v)}
              className="p-1 rounded text-muted-foreground hover:bg-muted"
              aria-label={isOpen ? "Close menu" : "Open menu"}
            >
              {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <p className="text-sm font-semibold tracking-tight">BizOps</p>
            </div>
          </div>

          {/* Invisible tap-to-close layer when sidebar is open */}
          {isOpen && (
            <div
              className="absolute inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
          )}

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>

      {/* ── Desktop layout: unchanged flex sidebar ── */}
      <div className="hidden md:flex h-screen overflow-hidden bg-background">
        <div className="w-56 h-full shrink-0">
          <SidebarContent />
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </>
  );
}
