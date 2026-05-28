"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, createContext, useContext } from "react";
import { useAuth } from "@/lib/auth/context";


// ─── Sidebar open context — allows child components (e.g. builder toolbar) to open the sidebar ──
const SidebarOpenContext = createContext<(() => void) | null>(null);
export function useSidebarOpen(): () => void {
  const fn = useContext(SidebarOpenContext);
  return fn ?? (() => {});
}

// ─── Sidebar collapsed context for desktop ──
const SidebarCollapsedContext = createContext<{ collapsed: boolean; toggle: () => void }>({ collapsed: false, toggle: () => {} });
export function useSidebarCollapsed() { return useContext(SidebarCollapsedContext); }

function SidebarTooltip({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={(props) => <div {...props}>{children}</div>} />
      <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}

import type { StoredAccount } from "@/lib/auth/context";
import { LayoutDashboard, Package, TrendingUp, Users, ShoppingBag, Globe, Settings, LogOut, UserCog, ChevronDown, ChevronsUpDown, Plus, Check, MessageSquare, MonitorSmartphone, KeyRound, Bell, UserRoundSearch, UserPlus, Palette } from "lucide-react";
import { useOpenDynamicUIElementCount, useDynamicUIElementTitle, useDynamicUIElementSwipeProgress } from "@/components/ui/dynamic-ui-element";
import { motion, AnimatePresence } from "motion/react";
import { FloatingNavButton } from "@/components/floating-nav-button";
import { BottomBar } from "@/components/bottom-bar";
import { MerchivaLogo } from "@/components/logo";
import { useNavMode } from "@/lib/nav-mode";
import { useUnreadCount, NotificationCenter } from "@/components/notification-center";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import { cn } from "@/lib/utils";
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess } from "@/lib/haptics";
import { useIsCapacitor, isCapacitorHiddenPath, CAPACITOR_HIDDEN_HREFS } from "@/lib/capacitor";
import { useIsElectron } from "@/lib/electron";
import { Separator } from "@/components/ui/separator";
import { usePermissions } from "@/lib/context/permissions";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { clearCache } from "@/lib/cache";
import { createOrg } from "@/lib/spacetimedb/actions";
import { useStoreMachineMode, useDeviceName } from "@/lib/store-machine-mode";
import { StoreDeviceLock } from "@/components/store-device-lock";
import { useThemeMode, type ThemeMode } from "@/lib/theme";
import { Moon, Sun, Monitor, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Permissions } from "@/lib/types";
import { getSafeAreaInsets, getScreenCornerRadius } from "@/lib/safe-area";
import { useT } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RightPanel, MobileRightPanel, RightPanelMobileProvider, useRightPanelMobile } from "@/components/right-panel";
import { PageTransition } from "@/components/page-transition";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { Spinner } from "@/components/ui/loaders/geometric";

const SIDEBAR_WIDTH = 280;
const EDGE_THRESHOLD = 40;
const SNAP_THRESHOLD = 0.4;
const VELOCITY_THRESHOLD = 0.3; // px/ms

type NavItem = {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: keyof Permissions;
};

// Punch-in is only shown in store-machine mode; see `visibleNavItems` below.
// Account is only shown on mobile (sidebar hides store/account switchers on mobile).
type NavItemExt = NavItem & { mobileOnly?: boolean };

const navItems: NavItemExt[] = [
  { labelKey: "nav.home",      href: "/~/dashboard",  icon: LayoutDashboard, permissionKey: "dashboard" },
  { labelKey: "nav.pos",       href: "/~/pos",         icon: MonitorSmartphone, permissionKey: "pos"     },
  { labelKey: "nav.inventory", href: "/~/inventory",   icon: Package,         permissionKey: "inventory" },
  { labelKey: "nav.products",  href: "/~/products",    icon: ShoppingBag,     permissionKey: "products"  },
  { labelKey: "nav.sales",     href: "/~/sales",       icon: TrendingUp,      permissionKey: "sales"     },
  { labelKey: "nav.personnel", href: "/~/personnel",   icon: Users,           permissionKey: "staffing"  },
  { labelKey: "nav.customers", href: "/~/customers",   icon: UserRoundSearch, permissionKey: "sales"     },
  { labelKey: "nav.chat",      href: "/~/chat",        icon: MessageSquare,   permissionKey: "staffing"  },
  { labelKey: "nav.website",   href: "/~/builder",     icon: Globe,           permissionKey: "website"   },
  { labelKey: "nav.design",    href: "/~/design",      icon: Palette,         permissionKey: "website"   },
  { labelKey: "nav.punchIn",   href: "/~/punch-in",    icon: KeyRound },
];

function StoreSwitcher({ onClose }: { onClose?: () => void }) {
  const t = useT();
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
      await createOrg(name);
      hapticSuccess();
      setOpen(false);
      setCreating(false);
      setNewStoreName("");
      onClose?.();
      // Refresh so PermissionsProvider picks up the new org membership
      // and switches the active org.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("components.sidebar.failedToCreateStore"));
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
        <span className="flex-1 truncate text-left">{currentOrg?.name ?? t("nav.selectStore")}</span>
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
                {t("nav.createNewStore")}
              </button>
            ) : (
              <form onSubmit={handleCreateStore} className="px-3 py-2 space-y-2">
                <input
                  autoFocus
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder={t("nav.storeName")}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={loading || !newStoreName.trim()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded bg-foreground px-2 py-1 text-xs font-medium text-background disabled:opacity-50"
                  >
                    {loading ? <Spinner size={12} /> : t("nav.create")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setError(null); setNewStoreName(""); }}
                    className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {t("common.cancel")}
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

function AccountSwitcher({ onClose, collapsed }: { onClose?: () => void; collapsed?: boolean }) {
  const t = useT();
  const router = useRouter();
  const { user, accounts, switchAccount, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSwitch = (userId: string) => {
    if (userId === user?.id) { setOpen(false); return; }
    hapticMedium();
    setOpen(false);
    onClose?.();
    switchAccount(userId);
  };

  const handleLogout = () => {
    clearCache();
    localStorage.removeItem("active_org_id");
    onClose?.();
    signOut();
  };

  const handleAddAccount = () => {
    setOpen(false);
    onClose?.();
    router.push("/login?addAccount=1");
  };

  const initial = user?.email?.[0]?.toUpperCase() ?? "?";

  if (collapsed) {
    return (
      <SidebarTooltip label={user?.email ?? ""} show>
        <button
          onClick={() => { hapticLight(); setOpen((v) => !v); }}
          className="flex w-full items-center justify-center rounded px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <div className="h-6 w-6 rounded-[0.3rem] bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0">
            {initial}
          </div>
        </button>
      </SidebarTooltip>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => { hapticLight(); setOpen((v) => !v); }}
        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <div className="h-6 w-6 rounded-[0.3rem] bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0">
          {initial}
        </div>
        <span className="flex-1 truncate text-left text-[12px]">{user?.email ?? ""}</span>
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="absolute left-0 right-0 bottom-full mb-1 z-50 rounded-[0.3rem] border border-border bg-card shadow-md origin-bottom"
          >
            <div className="py-1">
              {accounts.map((acct) => (
                <button
                  key={acct.id}
                  onClick={() => handleSwitch(acct.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-muted transition-colors text-left"
                >
                  <div className="h-5 w-5 rounded-[0.3rem] bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                    {acct.email[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="flex-1 truncate text-[12px]">{acct.email}</span>
                  {acct.id === user?.id && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
                </button>
              ))}
            </div>
            <div className="border-t border-border py-1">
              <button
                onClick={handleAddAccount}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5 shrink-0" />
                {t("accounts.addAccount")}
              </button>
            </div>
            <div className="border-t border-border py-1">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                {t("common.signOut")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SidebarContent({ onClose, collapsed, onToggleCollapse }: { onClose?: () => void; collapsed?: boolean; onToggleCollapse?: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const router   = useRouter();
  const { can, isOwner } = usePermissions();
  const { signOut } = useAuth();
  const isCapacitor = useIsCapacitor();
  const [storeMachine] = useStoreMachineMode();
  const [deviceName] = useDeviceName();
  const [notifOpen, setNotifOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeMode, setThemeMode] = useThemeMode();
  const unreadCount = useUnreadCount();

  // Paths allowed when the device is in store-machine mode.
  const STORE_MACHINE_HREFS = new Set(["/~/pos", "/~/inventory", "/~/punch-in"]);

  const handleLogout = () => {
    clearCache();
    localStorage.removeItem("active_org_id");
    onClose?.();
    signOut();
  };

  const handleNavClick = () => {
    hapticLight();
    onClose?.();
  };

  const isDesktop = !!onToggleCollapse;

  const visibleNavItems = navItems.filter((item) => {
    if (item.mobileOnly && isDesktop) return false;
    if (item.href === "/~/punch-in" && !storeMachine) return false;
    if (storeMachine && !STORE_MACHINE_HREFS.has(item.href)) return false;
    // Hide public-facing/SEO surfaces (storefront builder, marketing) inside
    // the native Capacitor shell.
    if (isCapacitor && CAPACITOR_HIDDEN_HREFS.has(item.href)) return false;
    if (!item.permissionKey) return true;
    return can(item.permissionKey, "view");
  });

  return (
    <TooltipProvider delay={0}>
    <aside className="flex h-full w-full flex-col bg-background">
      {/* Logo */}
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-border", collapsed ? "justify-center px-2" : "px-4")}>
        <MerchivaLogo size={28} fg="var(--background)" bg="var(--foreground)" rounded />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold leading-tight tracking-tight truncate">Merchiva <span className="text-[10px] font-normal text-muted-foreground">{t("components.sidebar.beta")}</span></p>
            {storeMachine && deviceName && (
              <p className="text-[10.5px] text-muted-foreground leading-tight truncate">{deviceName}</p>
            )}
          </div>
        )}
      </div>

      {/* Store switcher (desktop only — on mobile, use /account page) */}
      {!collapsed && onToggleCollapse && <StoreSwitcher onClose={onClose} />}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {visibleNavItems.map((item) => {
          const hasQuery = item.href.includes("?");
          const isActive = !hasQuery &&
            (pathname === item.href || pathname.startsWith(item.href + "/"));
          const label = t(item.labelKey);
          return (
            <SidebarTooltip key={item.href} label={label} show={!!collapsed}>
              <Link
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center rounded text-[13px] font-medium transition-colors",
                  collapsed ? "justify-center px-2.5 py-1.5" : "gap-2.5 px-2.5 py-1.5",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="h-[15px] w-[15px] shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
              </Link>
            </SidebarTooltip>
          );
        })}
      </nav>

      <Separator />

      {/* Bottom links */}
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        <SidebarTooltip label={t("notifications.title")} show={!!collapsed}>
          <button
            onClick={() => { hapticLight(); setNotifOpen(true); }}
            className={cn(
              "flex w-full items-center rounded text-[13px] font-medium transition-colors relative",
              collapsed ? "justify-center px-2.5 py-1.5" : "gap-2.5 px-2.5 py-1.5",
              "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Bell className="h-[15px] w-[15px] shrink-0" />
            {!collapsed && t("notifications.title")}
            {unreadCount > 0 && (
              <span className={cn(
                "flex items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold leading-none",
                collapsed ? "absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1" : "ml-auto h-4 min-w-[16px] px-1"
              )}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </SidebarTooltip>
        <DynamicUIElement open={notifOpen} onOpenChange={setNotifOpen}>
          <DynamicUIElementContent className="max-w-md" noPadding>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("notifications.title")}>{t("notifications.title")}</DynamicUIElementTitle>
              <DynamicUIElementDescription className="hidden">{t("notifications.title")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <NotificationCenter />
          </DynamicUIElementContent>
        </DynamicUIElement>
        <SidebarTooltip label={t("settings.darkMode")} show={!!collapsed}>
          <button
            onClick={() => { hapticLight(); setThemeOpen(true); }}
            className={cn(
              "flex w-full items-center rounded text-[13px] font-medium transition-colors",
              collapsed ? "justify-center px-2.5 py-1.5" : "gap-2.5 px-2.5 py-1.5",
              "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {themeMode === "dark" ? <Moon className="h-[15px] w-[15px] shrink-0" /> : themeMode === "light" ? <Sun className="h-[15px] w-[15px] shrink-0" /> : <Monitor className="h-[15px] w-[15px] shrink-0" />}
            {!collapsed && (t("settings.darkMode"))}
          </button>
        </SidebarTooltip>
        <DynamicUIElement open={themeOpen} onOpenChange={setThemeOpen}>
          <DynamicUIElementContent className="max-w-xs">
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.darkMode")}>{t("settings.darkMode")}</DynamicUIElementTitle>
              <DynamicUIElementDescription className="hidden">{t("settings.darkMode")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="flex flex-col gap-1.5 p-1">
              {([
                { mode: "system" as ThemeMode, icon: Monitor, label: t("settings.themeSystem") || "System", desc: t("settings.themeSystemDesc") || "Match your device" },
                { mode: "light" as ThemeMode, icon: Sun, label: t("settings.themeLight") || "Light", desc: t("settings.themeLightDesc") || "Always light" },
                { mode: "dark" as ThemeMode, icon: Moon, label: t("settings.themeDark") || "Dark", desc: t("settings.themeDarkDesc") || "Always dark" },
              ]).map(({ mode, icon: Icon, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => { hapticSuccess(); setThemeMode(mode); }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-3 rounded-[0.3rem] text-left transition-colors",
                    themeMode === mode
                      ? "bg-foreground text-background"
                      : "hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className={cn("text-xs mt-0.5", themeMode === mode ? "text-background/60" : "text-muted-foreground")}>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>
        <SidebarTooltip label={t("nav.settings")} show={!!collapsed}>
          <Link
            href="/~/settings"
            onClick={handleNavClick}
            className={cn(
              "flex items-center rounded text-[13px] font-medium transition-colors",
              collapsed ? "justify-center px-2.5 py-1.5" : "gap-2.5 px-2.5 py-1.5",
              pathname === "/~/settings"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Settings className="h-[15px] w-[15px] shrink-0" />
            {!collapsed && t("nav.settings")}
          </Link>
        </SidebarTooltip>
        {/* Account switcher (desktop only — on mobile, use /account page) */}
        {onToggleCollapse && <AccountSwitcher onClose={onClose} collapsed={collapsed} />}
        {onToggleCollapse && (
          <SidebarTooltip label={collapsed ? t("components.sidebar.expand") : t("components.sidebar.collapse")} show={!!collapsed}>
            <button
              onClick={onToggleCollapse}
              className={cn(
                "flex w-full items-center rounded text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mt-1",
                collapsed ? "justify-center px-2.5 py-1.5" : "gap-2.5 px-2.5 py-1.5",
              )}
            >
              {collapsed ? <PanelLeftOpen className="h-[15px] w-[15px]" /> : <PanelLeftClose className="h-[15px] w-[15px]" />}
              {!collapsed && <span>{t("components.sidebar.collapse")}</span>}
            </button>
          </SidebarTooltip>
        )}
        {!collapsed && (
          <p className="px-2.5 pt-2 pb-1 text-[10px] text-muted-foreground font-mono">{t("components.sidebar.version")}</p>
        )}
      </div>
    </aside>
    </TooltipProvider>
  );
}

function StoreTopBar({ deviceName }: { deviceName: string }) {
  const t = useT();
  return (
    <header className="h-11 shrink-0 border-b border-background/20 bg-foreground text-background flex items-center px-4 gap-3 z-30">
      <span className="font-mono text-xs font-bold tracking-[0.18em]">{t("components.store.appName")}</span>
      <span className="w-px h-4 bg-background/30" />
      <span className="text-[13px] font-semibold">{t("components.store.timeClock")}</span>
      <span className="inline-flex items-center gap-1.5 ml-1.5 px-2 py-0.5 rounded-full border border-background/30 text-[10px] font-mono tracking-wider text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t("components.store.online")}
      </span>
      <span className="ml-auto text-[11px] font-mono text-muted-foreground truncate">
        {deviceName ? deviceName.toUpperCase() : t("components.store.terminal")}
      </span>
    </header>
  );
}

function StoreFooter() {
  const t = useT();
  const now = new Date();
  return (
    <footer className="h-9 shrink-0 border-t border-border bg-muted flex items-center px-4 text-[11px] text-muted-foreground font-mono gap-4 z-30">
      <span>{t("components.store.footerVersion")}</span>
      <span className="hidden sm:inline">·</span>
      <span className="hidden sm:inline">{t("components.store.allTimesLocal")}</span>
      <span className="ml-auto">{t("components.store.syncOk")} · {now.toISOString().slice(0, 19).replace("T", " ")}Z</span>
    </footer>
  );
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isCapacitor = useIsCapacitor();
  const isElectron = useIsElectron();
  const [storeMachineMode] = useStoreMachineMode();
  const electronOffset = isElectron ? 40 : 0;

  // In the native Capacitor shell, SEO/marketing routes are hidden — bounce
  // any deep links straight to the dashboard.
  useEffect(() => {
    if (isCapacitor && isCapacitorHiddenPath(pathname)) {
      router.replace("/~/dashboard");
    }
  }, [isCapacitor, pathname, router]);

  const [smDeviceName] = useDeviceName();

  // ── Resizable shell layout ────────────────────────────────────────────
  // The desktop layout is a ResizablePanelGroup (react-resizable-panels v4).
  // - Each side panel is `collapsible` — dragging the handle below `minSize`
  //   automatically snaps the panel to `collapsedSize`.
  // - We mirror that collapsed state into React via `onResize` so the inner
  //   SidebarContent / RightPanel can switch between expanded and icon-only
  //   layouts.
  // - `useDefaultLayout` persists pane sizes (and collapsed state) across
  //   reloads via localStorage.
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "merchiva-shell-layout-v1",
    panelIds: ["shell-left", "shell-main", "shell-right"],
  });
  const toggleSidebarCollapse = () => {
    const p = leftPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };
  const toggleRightPanel = () => {
    const p = rightPanelRef.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  };
  const [navMode] = useNavMode();
  const useBottomBar = navMode === "bottombar" && !storeMachineMode;
  // Builder subpages (/builder/[siteId]/...) need full viewport — force drawer mode
  const isBuilderPage = pathname.startsWith("/~/builder/");
  const openDialogs = useOpenDynamicUIElementCount();
  const hasDialog = openDialogs > 0;
  const dialogTitle = useDynamicUIElementTitle();
  const dialogSwipe = useDynamicUIElementSwipeProgress();
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    function check() {
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const mobileUA = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isIPad = navigator.userAgent.includes("Mac") && isTouch;
      const isNarrow = window.innerWidth < 1024;
      setIsMobile((isTouch && (mobileUA || isIPad)) || isNarrow);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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
  const useBottomBarRef = useRef(false);
  const lastHapticOffset = useRef(0);
  const hasDialogRef = useRef(false);

  const safeAreaInsets = getSafeAreaInsets();
  const screenRadius = getScreenCornerRadius();

  // Keep refs in sync with state
  useEffect(() => {
    hasDialogRef.current = hasDialog;
    useBottomBarRef.current = useBottomBar;
    isOpenRef.current = isOpen;
    draggingRef.current = dragging;
  }, [dragging, hasDialog, isOpen, useBottomBar]);

  // Close on navigation
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close sidebar when a dialog opens to avoid transform conflicts
  useEffect(() => {
    if (hasDialog && isOpen) setIsOpen(false);
  }, [hasDialog]);

  // Attach touch listeners with passive:false on touchmove for preventDefault
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (useBottomBarRef.current || hasDialogRef.current) return;

      // Pages can opt out of the sidebar swipe (e.g. dashboard customize mode,
      // drag-and-drop surfaces, horizontal scrollers) by tagging the touched
      // element or an ancestor with `data-no-sidebar-swipe`.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-no-sidebar-swipe]")) {
        isEdge.current = false;
        return;
      }

      // If right panel is open (content shifted left), don't handle sidebar swipe
      const mc = document.getElementById("mobile-content");
      if (mc) {
        const t = mc.style.transform;
        if (t && t.includes("-")) {
          // Content is shifted left (right panel open) — skip sidebar
          isEdge.current = false;
          return;
        }
      }

      const t = e.touches[0];
      startX.current = t.clientX;
      startY.current = t.clientY;
      startTime.current = Date.now();
      lastX.current = t.clientX;
      isHoriz.current = null;
      isEdge.current = true;
      lastHapticOffset.current = isOpenRef.current ? SIDEBAR_WIDTH : 0;
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

      if (Math.abs(offset - lastHapticOffset.current) >= 25) {
        hapticLight();
        lastHapticOffset.current = offset;
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

      if (shouldOpen !== isOpenRef.current) hapticHeavy();
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
    <SidebarCollapsedContext.Provider value={{ collapsed: sidebarCollapsed, toggle: toggleSidebarCollapse }}>
    <SidebarOpenContext.Provider value={() => { hapticLight(); setIsOpen(true); }}>
    <RightPanelMobileProvider>
    <>
      {/* ── Mobile / tablet layout (touch devices) + builder full-viewport ── */}
      <div className={cn("relative h-[100dvh] min-h-0 w-full overflow-hidden bg-background", (isBuilderPage || isMobile !== false) ? "flex flex-1" : "hidden")}>
        {/* Right panel (swipe from right, appears behind content like sidebar) */}
        {isMobile && !isBuilderPage && <MobileRightPanel />}
        {/* Floating hamburger / back button — always mount so AnimatePresence exit animations play */}
        {!isBuilderPage && (
          <FloatingNavButton
            mode="menu"
            title={dialogTitle}
            onToggle={() => setIsOpen((v) => !v)}
            onDialogBack={() => {
              const topDialog = document.getElementById(`mobile-dialog-${openDialogs - 1}`);
              const backBtn = topDialog?.querySelector("[data-dialog-back]") as HTMLButtonElement | null;
              backBtn?.click();
            }}
            isOpen={isOpen}
            hasDialog={hasDialog}
            openDialogs={openDialogs}
            translateX={translateX}
            dragging={dragging}
            dialogSwipe={dialogSwipe}
            btnRotation={btnRotation}
            menuOpacity={menuOpacity}
            xOpacity={xOpacity}
            safeAreaTop={safeAreaInsets.top}
            zIndex={hasDialog ? 200 : 50}
            tabBarMode={useBottomBar}
          />
        )}

        {/* Sidebar: slides in from back with scale — hidden in bottom-bar mode */}
        {!useBottomBar && (
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
        )}

        {/* Main content: slides right to reveal the sidebar (z-20) */}
        <div
          id="mobile-content"
          ref={contentRef}
          className="absolute inset-0 z-20 flex flex-col bg-background overflow-hidden"
          style={{
            ...(!useBottomBar && !hasDialog && {
              transform: `translateX(${translateX}px)`,
              transition: transitionStyle,
              ...(translateX > 0 && {
                boxShadow: "-4px 0 16px rgba(0, 0, 0, 0.15)",
                borderRadius: `${screenRadius || 38}px 0 0 ${screenRadius || 38}px`,
              }),
            }),
          }}
        >
          {/* Tap-to-close layer when sidebar is open */}
          {!useBottomBar && (
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  id="sidebar-overlay"
                  className="absolute inset-0 z-30 backdrop-blur-sm bg-foreground/20"
                  onClick={() => setIsOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: translateX / 280 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </AnimatePresence>
          )}

          {/* Builder pages: no top spacer, no scroll wrapper — builder manages its own layout */}
          {isBuilderPage ? (
            <main className="flex-1 overflow-hidden">
              {children}
            </main>
          ) : storeMachineMode ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <StoreTopBar deviceName={smDeviceName} />
              <main className="flex-1 overflow-y-auto overflow-x-hidden"><PageTransition>{(isMobile === null || isMobile) && children}</PageTransition></main>
              <StoreFooter />
            </div>
          ) : (
            <main className="flex-1 overflow-y-auto overflow-x-hidden" style={useBottomBar ? { paddingBottom: 56 + safeAreaInsets.bottom } : undefined}>
              {!useBottomBar && (
                <div
                  className="sticky top-0 left-0 right-0 pointer-events-none"
                  style={{
                    background: "linear-gradient(to bottom, var(--background) 60%, transparent)",
                  }}
                />
              )}
              <PageTransition>{(isMobile === null || isMobile) && children}</PageTransition>
            </main>
          )}

          {/* Bottom bar navigation */}
          {useBottomBar && !isBuilderPage && <BottomBar />}
        </div>
      </div>

      {/* ── Desktop layout (non-touch): resizable shell — not shown on builder pages ── */}
      {!isBuilderPage && (
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className={cn(
            "overflow-hidden bg-background",
            isMobile === false ? "flex flex-1 h-[calc(100dvh)]" : "hidden",
          )}
        >
          <ResizablePanel
            id="shell-left"
            panelRef={leftPanelRef}
            defaultSize={220}
            minSize={140}
            maxSize={360}
            collapsible
            collapsedSize={64}
            className="border-r border-border bg-background"
            onResize={(size) => setSidebarCollapsed(size.inPixels <= 70)}
          >
            <SidebarContent
              collapsed={sidebarCollapsed}
              onToggleCollapse={toggleSidebarCollapse}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="shell-main" minSize={360}>
            <div className="flex h-full flex-col overflow-hidden">
              {storeMachineMode && <StoreTopBar deviceName={smDeviceName} />}
              <main className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                <PageTransition>
                  {(isMobile === null || !isMobile) && children}
                </PageTransition>
              </main>
              {storeMachineMode && <StoreFooter />}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="shell-right"
            panelRef={rightPanelRef}
            defaultSize={420}
            minSize={220}
            maxSize={680}
            collapsible
            collapsedSize={44}
            onResize={(size) => setRightCollapsed(size.inPixels <= 50)}
          >
            <RightPanel
              collapsed={rightCollapsed}
              onToggleCollapsed={toggleRightPanel}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
      <StoreDeviceLock />
    </>
    </RightPanelMobileProvider>
    </SidebarOpenContext.Provider>
    </SidebarCollapsedContext.Provider>
  );
}
