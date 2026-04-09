"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, createContext, useContext } from "react";


// ─── Sidebar open context — allows child components (e.g. builder toolbar) to open the sidebar ──
const SidebarOpenContext = createContext<(() => void) | null>(null);
export function useSidebarOpen(): () => void {
  const fn = useContext(SidebarOpenContext);
  return fn ?? (() => {});
}
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  Users,
  ShoppingBag,
  Globe,
  Crown,
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
  MessageSquare,
  MonitorSmartphone,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useOpenDialogCount, useDialogTitle, useDialogSwipeProgress } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import { Separator } from "@/components/ui/separator";
import { usePermissions } from "@/lib/context/permissions";
import { clearCache } from "@/lib/cache";
import type { Permissions } from "@/lib/types";
import { getSafeAreaInsets, getScreenCornerRadius } from "@/lib/safe-area";

const SIDEBAR_WIDTH = 280;
const EDGE_THRESHOLD = 40;
const SNAP_THRESHOLD = 0.4;
const VELOCITY_THRESHOLD = 0.3; // px/ms

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: keyof Permissions;
};

const navItems: NavItem[] = [
  { label: "Home",              href: "/dashboard",  icon: LayoutDashboard, permissionKey: "dashboard" },
  { label: "Inventory",        href: "/inventory",   icon: Package,         permissionKey: "inventory" },
  { label: "Sales Prediction", href: "/sales",       icon: TrendingUp,      permissionKey: "sales"     },
  { label: "Staffing",         href: "/staffing",    icon: Users,           permissionKey: "staffing"  },
  { label: "Products",         href: "/products",    icon: ShoppingBag,     permissionKey: "products"  },
  { label: "POS",              href: "/pos",         icon: MonitorSmartphone, permissionKey: "pos"     },
  { label: "Chat",             href: "/chat",        icon: MessageSquare,   permissionKey: "staffing"  },
  { label: "Website",          href: "/builder",     icon: Globe },
  { label: "Membership",       href: "/membership",  icon: Crown },
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
      // Org creation is handled via SpacetimeDB reducers on the signup page.
      // For now, show a message redirecting user to sign up with a new account.
      throw new Error("Create a new account to start a new organization.");
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

  const handleLogout = () => {
    clearCache();
    localStorage.removeItem("stdb_token");
    router.push("/login");
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
    <aside className="flex h-full w-full flex-col md:border-r md:border-border bg-card">
      {/* Logo */}
      <div className="flex h-12 items-center gap-2 px-4 border-b border-border">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-background">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold leading-none tracking-tight">BizOps</p>
        </div>
      </div>

      {/* Store switcher */}
      <StoreSwitcher onClose={onClose} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Management
        </p>
        {visibleNavItems.map((item) => {
          const hasQuery = item.href.includes("?");
          const isActive = !hasQuery &&
            (pathname === item.href || pathname.startsWith(item.href + "/"));
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
  // Builder subpages (/builder/[siteId]/...) need full viewport — force drawer mode
  const isBuilderPage = pathname.startsWith("/builder/");
  const openDialogs = useOpenDialogCount();
  const hasDialog = openDialogs > 0;
  const dialogTitle = useDialogTitle();
  const dialogSwipe = useDialogSwipeProgress();
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  // Detect mobile to render children only once (avoids double-mounting dialogs)
  // Start null to avoid hydration mismatch — render children in both during SSR,
  // then commit to one side after mount.
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  const safeAreaInsets = getSafeAreaInsets();
  const screenRadius = getScreenCornerRadius();

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
      // Always allow horizontal swipe — open from anywhere, close when open
      isEdge.current = true;
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
  const progress = Math.min(1, Math.max(0, translateX / SIDEBAR_WIDTH)); // 0 → 1
  const btnRotation = progress * 180;                       // 0° → 180°
  // Icon swap at 90° (progress 0.5), opacity fade starts at ~20° (progress 0.11)
  const showX = progress >= 0.5;
  const iconFadeStart = 20 / 180; // ~0.11
  const menuOpacity = progress < iconFadeStart ? 1 : showX ? 0 : Math.max(0, 1 - (progress - iconFadeStart) / (0.5 - iconFadeStart));
  const xOpacity = progress < 0.5 ? 0 : Math.min(1, (progress - 0.5) / (1 - 0.5 - iconFadeStart));
  const overlayOpacity = progress * 0.4;
  // Sidebar: starts slightly scaled down & shifted left, animates to full size
  const sidebarScale = 0.92 + progress * 0.08;       // 0.92 → 1
  const sidebarTranslateX = -30 + progress * 30;      // -30px → 0
  const sidebarOpacity = progress;                      // 0 → 1
  const transitionStyle = dragging
    ? "none"
    : "all 220ms cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <SidebarOpenContext.Provider value={() => setIsOpen(true)}>
    <>
      {/* ── Mobile + tablet layout (< 1024px) + builder full-viewport ── */}
      <div className={cn("relative h-screen overflow-hidden bg-background", isBuilderPage ? "flex" : "flex lg:hidden")}>
        {/* Floating hamburger — hidden on builder pages (builder has its own Menu button in toolbar) */}
        {!isBuilderPage && (
          <button
            onClick={() => {
              if (hasDialog) {
                const topDialog = document.getElementById(`mobile-dialog-${openDialogs - 1}`);
                const backBtn = topDialog?.querySelector("[data-dialog-back]") as HTMLButtonElement | null;
                backBtn?.click();
              } else {
                setIsOpen((v) => !v);
              }
            }}
            className="fixed p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 m-4"
            style={{
              left: 0,
              top: 0 + safeAreaInsets.top,
              zIndex: hasDialog ? 200 : 50,
              transform: hasDialog ? "none" : `translateX(${translateX}px)`,
              transition: dragging ? "none" : "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)",
            }}
            aria-label={hasDialog ? "Go back" : isOpen ? "Close menu" : "Open menu"}
          >
            <motion.span
              className="relative block h-5 w-5"
              animate={{
                rotate: hasDialog
                  ? openDialogs > 1
                    ? -180
                    : -180 + dialogSwipe * 180
                  : btnRotation
              }}
              transition={dragging || dialogSwipe > 0 ? { duration: 0 } : { type: "spring", damping: 20, stiffness: 300 }}
            >
              <ArrowRight className="h-5 w-5 absolute inset-0" style={{
                opacity: hasDialog ? (openDialogs > 1 ? 1 : 1 - dialogSwipe) : 0,
                transition: dialogSwipe > 0 ? "none" : "opacity 200ms",
              }} />
              <Menu className="h-5 w-5 absolute inset-0" style={{
                opacity: hasDialog ? (openDialogs > 1 ? 0 : dialogSwipe) : menuOpacity,
                transition: dialogSwipe > 0 || dragging ? "none" : "opacity 200ms",
              }} />
              <X className="h-5 w-5 absolute inset-0" style={{ opacity: hasDialog ? 0 : xOpacity, transition: dragging ? "none" : "opacity 200ms" }} />
            </motion.span>
          </button>
        )}

        {/* Floating dialog title pill */}
        <AnimatePresence>
          {hasDialog && dialogTitle && (
            <motion.div
              key={dialogTitle}
              className="fixed"
              style={{ top: 22 + safeAreaInsets.top, left: 64, zIndex: 201 }}
              initial={{ opacity: 0, scale: 0.3, x: -30 }}
              animate={{
                opacity: 1 - dialogSwipe,
                scale: 1 - dialogSwipe * 0.7,
                x: -dialogSwipe * 30,
              }}
              exit={{ opacity: 0, scale: 0.3, x: -30 }}
              transition={dialogSwipe > 0 ? { duration: 0 } : { type: "spring", damping: 20, stiffness: 400, delay: 0.1 }}
            >
              <div
                className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg"
                style={{ boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)" }}
              >
                {dialogTitle}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar: slides in from back with scale */}
        <div
          className="fixed inset-y-0 left-0 w-[280px] z-10"
          style={{
            transform: `translateX(${sidebarTranslateX}px) scale(${sidebarScale})`,
            opacity: sidebarOpacity,
            transformOrigin: "left center",
            paddingTop: safeAreaInsets.top,
            transition: transitionStyle,
          }}
        >
          <SidebarContent onClose={() => setIsOpen(false)} />
        </div>

        {/* Main content: slides right to reveal the sidebar (z-20) */}
        <div
          id="mobile-content"
          ref={contentRef}
          className="absolute inset-0 z-20 flex flex-col bg-background overflow-hidden border"
          style={{
            transform: `translateX(${translateX}px)`,
            transition: transitionStyle,
            ...(translateX > 0 && {
              boxShadow: "-4px 0 16px rgba(0, 0, 0, 0.15)",
              borderRadius: `${screenRadius || 38}px 0 0 ${screenRadius || 38}px`,
            })
          }}
        >
          {/* Tap-to-close layer when sidebar is open */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                className="absolute inset-0 z-10 backdrop-blur-sm bg-foreground/20"
                onClick={() => setIsOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: translateX / 280 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </AnimatePresence>

          {/* Builder pages: no top spacer, no scroll wrapper — builder manages its own layout */}
          {isBuilderPage ? (
            <main className="flex-1 overflow-hidden">
              {children}
            </main>
          ) : (
            <main className="flex-1 overflow-y-auto">
              {/* Safe area gradient: solid bg → transparent, covers the notch/status bar */}
              <div
                className="sticky top-0 left-0 right-0 pointer-events-none"
                style={{
                  height: safeAreaInsets.top + 48,
                  background: "linear-gradient(to bottom, var(--background) 60%, transparent)",
                }}
              />
              {(isMobile === null || isMobile) && children}
            </main>
          )}
        </div>
      </div>

      {/* ── Desktop layout (1024px+): permanent sidebar — not shown on builder pages ── */}
      {!isBuilderPage && (
        <div className="hidden lg:flex h-screen overflow-hidden bg-background">
          <div className="w-56 h-full shrink-0">
            <SidebarContent />
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto">{(isMobile === null || !isMobile) && children}</main>
          </div>
        </div>
      )}
    </>
    </SidebarOpenContext.Provider>
  );
}
