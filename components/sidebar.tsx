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
import { LayoutDashboard, Package, TrendingUp, Users, ShoppingBag, Globe, Settings, LogOut, UserCog, ChevronDown, ChevronRight, ChevronsUpDown, Plus, Check, MessageSquare, MonitorSmartphone, KeyRound, Bell, UserRoundSearch, UserPlus, Palette } from "lucide-react";
import { useOpenDynamicUIElementCount, useDynamicUIElementTitle, useDynamicUIElementSwipeProgress } from "@/components/ui/dynamic-ui-element";
import { motion, AnimatePresence } from "motion/react";
import { FloatingNavButton } from "@/components/floating-nav-button";
import { BottomBar } from "@/components/bottom-bar";
import { MerchivaLogo } from "@/components/logo";
import { useNavMode } from "@/lib/nav-mode";
import { useUnreadCount } from "@/components/notification-center";
import { cn } from "@/lib/utils";
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess } from "@/lib/haptics";
import { useIsCapacitor, isCapacitorHiddenPath, CAPACITOR_HIDDEN_HREFS } from "@/lib/capacitor";
import { useIsNativeShell } from "@/lib/native-shell";
import { Separator } from "@/components/ui/separator";
import { usePermissions } from "@/lib/context/permissions";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { clearCache } from "@/lib/cache";
import { createOrg } from "@/lib/spacetimedb/actions";
import { useStoreMachineMode, useDeviceName } from "@/lib/store-machine-mode";
import { StoreDeviceLock } from "@/components/store-device-lock";
import { useCurrentOperator, setCurrentOperator } from "@/lib/store-device-lock";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
// `children` are the sub-pages of a section (mirrors the page's `PageTabs`).
// On desktop the section can be expanded via the chevron button to pick a
// sub-page; clicking the row itself always navigates to the main page.
type SubNavItem = { labelKey: string; href: string };
type NavItemExt = NavItem & { mobileOnly?: boolean; children?: SubNavItem[] };

const navItems: NavItemExt[] = [
  { labelKey: "nav.home",      href: "/~/dashboard",  icon: LayoutDashboard, permissionKey: "dashboard" },
  { labelKey: "nav.pos",       href: "/~/pos",         icon: MonitorSmartphone, permissionKey: "pos"     },
  { labelKey: "nav.inventory", href: "/~/inventory",   icon: Package,         permissionKey: "inventory",
    children: [
      { labelKey: "nav.suppliers", href: "/~/suppliers" },
      { labelKey: "nav.wasteLog",  href: "/~/inventory/waste" },
    ] },
  { labelKey: "nav.products",  href: "/~/products",    icon: ShoppingBag,     permissionKey: "products",
    children: [
      { labelKey: "nav.pricing", href: "/~/pricing" },
    ] },
  { labelKey: "nav.sales",     href: "/~/sales",       icon: TrendingUp,      permissionKey: "sales",
    children: [
      { labelKey: "nav.reports",  href: "/~/reports" },
      { labelKey: "nav.finances", href: "/~/finances" },
    ] },
  { labelKey: "nav.personnel", href: "/~/personnel",   icon: Users,           permissionKey: "staffing",
    children: [
      { labelKey: "personnel.tabs.schedule", href: "/~/personnel/schedule" },
      { labelKey: "personnel.tabs.team",     href: "/~/personnel/team" },
      { labelKey: "personnel.tabs.roles",    href: "/~/personnel/roles" },
      { labelKey: "personnel.tabs.training", href: "/~/personnel/training" },
    ] },
  { labelKey: "nav.customers", href: "/~/customers",   icon: UserRoundSearch, permissionKey: "sales",
    children: [
      { labelKey: "nav.marketing", href: "/~/marketing" },
    ] },
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
  // null = create as a root store; an org id = create as a sub-store of that org
  const [newParentId, setNewParentId] = useState<string | null>(null);
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

  // Build a parent → children tree from the flat org list. Only top-level
  // (no parentOrgId) orgs become roots; everything else is rendered indented
  // under its parent. Orgs whose parent isn't in the user's accessible list
  // (rare — happens when membership doesn't extend to the root) fall back to
  // rendering at the root for visibility.
  type TreeNode = { org: typeof organizations[number]; children: typeof organizations };
  const tree: TreeNode[] = (() => {
    const byId = new Map(organizations.map((o) => [o.id, o] as const));
    const roots: TreeNode[] = [];
    const childrenOf = new Map<string, typeof organizations>();
    for (const org of organizations) {
      const parent = org.parentOrgId && byId.has(org.parentOrgId) ? org.parentOrgId : null;
      if (parent) {
        const arr = childrenOf.get(parent) ?? [];
        arr.push(org);
        childrenOf.set(parent, arr);
      }
    }
    for (const org of organizations) {
      const isRoot = !org.parentOrgId || !byId.has(org.parentOrgId);
      if (isRoot) {
        roots.push({ org, children: childrenOf.get(org.id) ?? [] });
      }
    }
    return roots.sort((a, b) => a.org.name.localeCompare(b.org.name));
  })();

  // Only root orgs can be parents (we enforce one-level hierarchy on the
  // server) and only the owner can attach a sub-store — but we don't know who
  // owns each org client-side, so we show every root and let the reducer
  // reject if the caller doesn't own the chosen parent.
  const eligibleParents = organizations.filter((o) => !o.parentOrgId);

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
      await createOrg(name, newParentId);
      hapticSuccess();
      setOpen(false);
      setCreating(false);
      setNewStoreName("");
      setNewParentId(null);
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
        {currentOrg?.parentOrgId && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-px shrink-0">
            {t("multiStore.subBadge")}
          </span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded border border-border bg-card shadow-md max-h-[70vh] overflow-y-auto">
          <div className="py-1">
            {tree.map((node) => (
              <div key={node.org.id}>
                <button
                  onClick={() => handleSwitch(node.org.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors text-left"
                >
                  <span className="flex-1 truncate font-medium">{node.org.name}</span>
                  {node.children.length > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {node.children.length}
                    </span>
                  )}
                  {node.org.id === currentOrg?.id && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
                </button>
                {node.children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => handleSwitch(child.id)}
                    className="flex w-full items-center gap-2 pl-7 pr-3 py-1.5 text-sm hover:bg-muted transition-colors text-left"
                  >
                    <span className="text-muted-foreground/70">↳</span>
                    <span className="flex-1 truncate">{child.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-px shrink-0">
                      {t("multiStore.subBadge")}
                    </span>
                    {child.id === currentOrg?.id && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
                  </button>
                ))}
              </div>
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
                {eligibleParents.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">
                      {t("multiStore.parentLabel")}
                    </label>
                    <select
                      value={newParentId ?? ""}
                      onChange={(e) => setNewParentId(e.target.value || null)}
                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
                    >
                      <option value="">{t("multiStore.parentNone")}</option>
                      {eligibleParents.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {newParentId ? t("multiStore.parentHelpSub") : t("multiStore.parentHelpRoot")}
                    </p>
                  </div>
                )}
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
                    onClick={() => { setCreating(false); setError(null); setNewStoreName(""); setNewParentId(null); }}
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

/**
 * Combined store + account switcher for desktop. Replaces the separate
 * StoreSwitcher (top) and AccountSwitcher (bottom) mounts so the desktop UI
 * matches the mobile drawer: one trigger shows current org + signed-in email,
 * and one dropdown lists both stores (as a parent/child tree) and accounts
 * with the create flows + sign out.
 */
function WorkspaceSwitcher({ onClose, collapsed }: { onClose?: () => void; collapsed?: boolean }) {
  const t = useT();
  const router = useRouter();
  const { currentOrg, organizations, switchOrg } = usePermissions();
  const { user, accounts, switchAccount, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as globalThis.Node)) {
        setOpen(false);
        setCreating(false);
        setError(null);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Parent → children tree for the store list. Root orgs first, sub-stores
  // indented underneath; an org whose parent isn't in the user's accessible
  // list still renders at the root so it's reachable.
  type TreeNode = { org: typeof organizations[number]; children: typeof organizations };
  const tree: TreeNode[] = (() => {
    const byId = new Map(organizations.map((o) => [o.id, o] as const));
    const roots: TreeNode[] = [];
    const childrenOf = new Map<string, typeof organizations>();
    for (const org of organizations) {
      const parent = org.parentOrgId && byId.has(org.parentOrgId) ? org.parentOrgId : null;
      if (parent) {
        const arr = childrenOf.get(parent) ?? [];
        arr.push(org);
        childrenOf.set(parent, arr);
      }
    }
    for (const org of organizations) {
      const isRoot = !org.parentOrgId || !byId.has(org.parentOrgId);
      if (isRoot) {
        roots.push({ org, children: childrenOf.get(org.id) ?? [] });
      }
    }
    return roots.sort((a, b) => a.org.name.localeCompare(b.org.name));
  })();

  const eligibleParents = organizations.filter((o) => !o.parentOrgId);

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === currentOrg?.id) { setOpen(false); return; }
    hapticMedium();
    setOpen(false);
    onClose?.();
    await switchOrg(orgId);
  };

  const handleSwitchAccount = (userId: string) => {
    if (userId === user?.id) { setOpen(false); return; }
    hapticMedium();
    setOpen(false);
    onClose?.();
    switchAccount(userId);
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newStoreName.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      await createOrg(name, newParentId);
      hapticSuccess();
      setOpen(false);
      setCreating(false);
      setNewStoreName("");
      setNewParentId(null);
      onClose?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("components.sidebar.failedToCreateStore"));
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = () => {
    setOpen(false);
    onClose?.();
    router.push("/login?addAccount=1");
  };

  const handleLogout = () => {
    clearCache();
    try { localStorage.removeItem("active_org_id"); } catch {}
    onClose?.();
    signOut();
  };

  const userInitial = user?.email?.[0]?.toUpperCase() ?? "?";
  const orgInitial = currentOrg?.name?.[0]?.toUpperCase() ?? "M";

  // Collapsed mode: single avatar tile, opens the same dropdown.
  if (collapsed) {
    return (
      <div ref={dropdownRef} className="relative">
        <SidebarTooltip label={`${currentOrg?.name ?? ""} · ${user?.email ?? ""}`} show>
          <button
            onClick={() => { hapticLight(); setOpen((v) => !v); setCreating(false); setError(null); }}
            className="flex w-full items-center justify-center rounded px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <div className="h-6 w-6 rounded-[0.3rem] bg-foreground text-background flex items-center justify-center text-[11px] font-semibold shrink-0">
              {orgInitial}
            </div>
          </button>
        </SidebarTooltip>
        {open && (
          <WorkspaceDropdown
            currentOrg={currentOrg}
            user={user}
            tree={tree}
            accounts={accounts}
            eligibleParents={eligibleParents}
            creating={creating}
            setCreating={setCreating}
            newStoreName={newStoreName}
            setNewStoreName={setNewStoreName}
            newParentId={newParentId}
            setNewParentId={setNewParentId}
            error={error}
            loading={loading}
            onSwitchOrg={handleSwitchOrg}
            onSwitchAccount={handleSwitchAccount}
            onCreateStore={handleCreateStore}
            onAddAccount={handleAddAccount}
            onLogout={handleLogout}
            onCancelCreate={() => { setCreating(false); setError(null); setNewStoreName(""); setNewParentId(null); }}
            // Anchored to a tile in the bottom rail, so position above-right.
            placement="up-right"
          />
        )}
      </div>
    );
  }

  // Expanded mode: full-width row showing org name + email; dropdown drops down.
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => { hapticLight(); setOpen((v) => !v); setCreating(false); setError(null); }}
        className="flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 hover:bg-muted transition-colors text-left"
      >
        <div className="h-7 w-7 rounded-[0.3rem] bg-foreground text-background flex items-center justify-center text-[12px] font-semibold shrink-0">
          {orgInitial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-foreground truncate">
              {currentOrg?.name ?? t("nav.selectStore")}
            </span>
            {currentOrg?.parentOrgId && (
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 leading-tight shrink-0">
                {t("multiStore.subBadge")}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate font-mono">{user?.email ?? ""}</p>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <WorkspaceDropdown
          currentOrg={currentOrg}
          user={user}
          tree={tree}
          accounts={accounts}
          eligibleParents={eligibleParents}
          creating={creating}
          setCreating={setCreating}
          newStoreName={newStoreName}
          setNewStoreName={setNewStoreName}
          newParentId={newParentId}
          setNewParentId={setNewParentId}
          error={error}
          loading={loading}
          onSwitchOrg={handleSwitchOrg}
          onSwitchAccount={handleSwitchAccount}
          onCreateStore={handleCreateStore}
          onAddAccount={handleAddAccount}
          onLogout={handleLogout}
          onCancelCreate={() => { setCreating(false); setError(null); setNewStoreName(""); setNewParentId(null); }}
          placement="down"
        />
      )}
    </div>
  );
}

/**
 * Shared dropdown panel for the workspace switcher — rendered the same way in
 * both collapsed and expanded modes so we get one source of truth for the
 * store tree, accounts list, and create-store form.
 */
function WorkspaceDropdown({
  currentOrg,
  user,
  tree,
  accounts,
  eligibleParents,
  creating,
  setCreating,
  newStoreName,
  setNewStoreName,
  newParentId,
  setNewParentId,
  error,
  loading,
  onSwitchOrg,
  onSwitchAccount,
  onCreateStore,
  onAddAccount,
  onLogout,
  onCancelCreate,
  placement,
}: {
  currentOrg: { id: string; name: string; parentOrgId?: string | null } | null;
  user: { id: string; email: string } | null;
  tree: { org: { id: string; name: string; parentOrgId?: string | null }; children: { id: string; name: string; parentOrgId?: string | null }[] }[];
  accounts: StoredAccount[];
  eligibleParents: { id: string; name: string }[];
  creating: boolean;
  setCreating: (v: boolean) => void;
  newStoreName: string;
  setNewStoreName: (v: string) => void;
  newParentId: string | null;
  setNewParentId: (v: string | null) => void;
  error: string | null;
  loading: boolean;
  onSwitchOrg: (id: string) => void;
  onSwitchAccount: (id: string) => void;
  onCreateStore: (e: React.FormEvent) => void;
  onAddAccount: () => void;
  onLogout: () => void;
  onCancelCreate: () => void;
  placement: "down" | "up-right";
}) {
  const t = useT();
  // "down" → drops below the trigger (expanded sidebar at top).
  // "up-right" → opens upward and to the right of the collapsed tile.
  const positionCls = placement === "down"
    ? "left-0 right-0 top-full mt-1 origin-top"
    : "left-full ml-1 bottom-0 w-64 origin-bottom-left";
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "absolute z-50 rounded-[0.3rem] border border-border bg-card shadow-md max-h-[70vh] overflow-y-auto",
        positionCls,
      )}
    >
      {/* Stores */}
      <div className="px-3 pt-2 pb-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("nav.selectStore")}
        </p>
      </div>
      <div className="py-1">
        {tree.map((node) => (
          <div key={node.org.id}>
            <button
              onClick={() => onSwitchOrg(node.org.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-muted transition-colors text-left"
            >
              <span className="flex-1 truncate font-medium">{node.org.name}</span>
              {node.children.length > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {node.children.length}
                </span>
              )}
              {node.org.id === currentOrg?.id && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
            </button>
            {node.children.map((child) => (
              <button
                key={child.id}
                onClick={() => onSwitchOrg(child.id)}
                className="flex w-full items-center gap-2 pl-7 pr-3 py-1.5 text-[13px] hover:bg-muted transition-colors text-left"
              >
                <span className="text-muted-foreground/70">↳</span>
                <span className="flex-1 truncate">{child.name}</span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 leading-tight shrink-0">
                  {t("multiStore.subBadge")}
                </span>
                {child.id === currentOrg?.id && <Check className="h-3.5 w-3.5 text-foreground shrink-0" />}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Create-store form (toggleable) */}
      <div className="border-t border-border py-1">
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            {t("nav.createNewStore")}
          </button>
        ) : (
          <form onSubmit={onCreateStore} className="px-3 py-2 space-y-2">
            <input
              autoFocus
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder={t("nav.storeName")}
              className="w-full rounded border border-border bg-background px-2 py-1 text-[13px] outline-none focus:ring-1 focus:ring-foreground/20"
            />
            {eligibleParents.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">
                  {t("multiStore.parentLabel")}
                </label>
                <select
                  value={newParentId ?? ""}
                  onChange={(e) => setNewParentId(e.target.value || null)}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-[13px] outline-none focus:ring-1 focus:ring-foreground/20"
                >
                  <option value="">{t("multiStore.parentNone")}</option>
                  {eligibleParents.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {newParentId ? t("multiStore.parentHelpSub") : t("multiStore.parentHelpRoot")}
                </p>
              </div>
            )}
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={loading || !newStoreName.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded bg-foreground px-2 py-1 text-[11px] font-medium text-background disabled:opacity-50"
              >
                {loading ? <Spinner size={12} /> : t("nav.create")}
              </button>
              <button
                type="button"
                onClick={onCancelCreate}
                className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Accounts */}
      <div className="border-t border-border px-3 pt-2 pb-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("accounts.title")}
        </p>
      </div>
      <div className="py-1">
        {accounts.map((acct) => (
          <button
            key={acct.id}
            onClick={() => onSwitchAccount(acct.id)}
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
          onClick={onAddAccount}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5 shrink-0" />
          {t("accounts.addAccount")}
        </button>
      </div>

      <div className="border-t border-border py-1">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {t("common.signOut")}
        </button>
      </div>
    </motion.div>
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
  const unreadCount = useUnreadCount();
  // Which sections (keyed by parent href) are expanded to show sub-pages.
  const [expandedHrefs, setExpandedHrefs] = useState<Set<string>>(() => new Set());

  // Paths allowed when the device is in store-machine mode.
  const STORE_MACHINE_HREFS = new Set(["/~/pos", "/~/inventory", "/~/punch-in"]);

  // True when `pathname` sits inside the section (its main page or any sub-page).
  const isInSection = (item: NavItemExt) =>
    pathname === item.href ||
    pathname.startsWith(item.href + "/") ||
    (item.children ?? []).some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));

  // Auto-expand the section that owns the current route so its sub-pages are
  // visible right after navigating in. Never auto-collapses others.
  useEffect(() => {
    const active = navItems.find((it) => it.children && isInSection(it));
    if (!active) return;
    setExpandedHrefs((prev) => (prev.has(active.href) ? prev : new Set(prev).add(active.href)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleExpanded = (href: string) => {
    hapticLight();
    setExpandedHrefs((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

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

      {/* Combined workspace switcher — shows current store + signed-in account,
          dropdown lists both with create-store/add-account/sign-out actions.
          Desktop only; mobile uses the Settings page switcher drawer. */}
      {onToggleCollapse && (
        <div className={cn("border-b border-border", collapsed ? "px-2 py-2" : "px-3 py-2")}>
          <WorkspaceSwitcher onClose={onClose} collapsed={collapsed} />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {visibleNavItems.map((item) => {
          const hasQuery = item.href.includes("?");
          const label = t(item.labelKey);

          // Sub-pages visible in the current context (store-machine / native shell
          // hide some surfaces). Collapsible sub-nav is desktop-exclusive and only
          // in the expanded (non-icon) sidebar.
          const subItems = (item.children ?? []).filter((c) => {
            if (isCapacitor && CAPACITOR_HIDDEN_HREFS.has(c.href)) return false;
            if (storeMachine && !STORE_MACHINE_HREFS.has(c.href)) return false;
            return true;
          });
          const showSubNav = isDesktop && !collapsed && subItems.length > 0;

          if (!showSubNav) {
            const isActive = !hasQuery &&
              (pathname === item.href || pathname.startsWith(item.href + "/"));
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
          }

          // Section with sub-pages (desktop, expanded sidebar).
          const childActive = subItems.some(
            (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
          );
          const parentActive =
            (pathname === item.href || pathname.startsWith(item.href + "/")) && !childActive;
          const expanded = expandedHrefs.has(item.href);

          return (
            <div key={item.href}>
              <div className="flex items-center gap-0.5">
                <Link
                  href={item.href}
                  onClick={handleNavClick}
                  className={cn(
                    "flex flex-1 items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors min-w-0",
                    parentActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="h-[15px] w-[15px] shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => toggleExpanded(item.href)}
                  aria-label={expanded ? t("components.sidebar.collapse") : t("components.sidebar.expand")}
                  aria-expanded={expanded}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors",
                    "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <ChevronRight
                    className={cn(
                      "h-[14px] w-[14px] transition-transform duration-200",
                      expanded && "rotate-90",
                    )}
                  />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="ml-[18px] mt-0.5 space-y-0.5 border-l border-border pl-2.5 py-0.5">
                      {subItems.map((child) => {
                        const cActive =
                          pathname === child.href || pathname.startsWith(child.href + "/");
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={handleNavClick}
                            className={cn(
                              "block truncate rounded px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                              cActive
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted",
                            )}
                          >
                            {t(child.labelKey)}
                          </Link>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      <Separator />

      {/* Bottom links */}
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        <SidebarTooltip label={t("notifications.title")} show={!!collapsed}>
          <Link
            href="/~/notifications"
            onClick={handleNavClick}
            className={cn(
              "flex w-full items-center rounded text-[13px] font-medium transition-colors relative",
              collapsed ? "justify-center px-2.5 py-1.5" : "gap-2.5 px-2.5 py-1.5",
              pathname === "/~/notifications"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Bell className="h-[15px] w-[15px] shrink-0" />
            {!collapsed && t("notifications.title")}
            {unreadCount > 0 && (
              <span className={cn(
                "flex items-center justify-center rounded-full text-[10px] font-bold leading-none",
                pathname === "/~/notifications" ? "bg-background text-foreground" : "bg-foreground text-background",
                collapsed ? "absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1" : "ml-auto h-4 min-w-[16px] px-1"
              )}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </SidebarTooltip>
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
        {/* (Account switching now lives in the combined WorkspaceSwitcher at the
            top of the sidebar — see above.) */}
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
  const operator = useCurrentOperator();
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const handleLogout = () => {
    hapticMedium();
    setCurrentOperator(null);
    // Dispatch a synthetic blur so the lock screen's autolock timer triggers
    // immediately on the next tick. Clearing the operator alone doesn't lock —
    // we want the lock screen up right away so the next user can sign in.
    window.dispatchEvent(new Event("store-device-force-lock"));
  };

  return (
    <header className="h-11 shrink-0 border-b border-background/20 bg-foreground text-background flex items-center px-4 gap-3 z-30">
      <span className="font-mono text-xs font-bold tracking-[0.18em]">{t("components.store.appName")}</span>
      <span className="w-px h-4 bg-background/30" />
      <span className="text-[13px] font-semibold">{t("components.store.timeClock")}</span>
      <span className="hidden sm:inline-flex items-center gap-1.5 ml-1.5 px-2 py-0.5 rounded-full border border-background/30 text-[10px] font-mono tracking-wider text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{t("components.store.online")}
      </span>
      <span className="hidden md:inline ml-2 text-[11px] font-mono text-muted-foreground truncate">
        {deviceName ? deviceName.toUpperCase() : t("components.store.terminal")}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {operator ? (
          <div className="inline-flex items-center gap-1.5 pl-1 pr-1 py-1 rounded-[0.3rem] border border-background/30 bg-background/10">
            <span className="h-6 w-6 rounded-[0.2rem] bg-background text-foreground inline-flex items-center justify-center font-mono text-[10px] font-semibold">
              {initials(operator.name)}
            </span>
            <span className="text-[12px] font-semibold truncate max-w-[140px]">
              {operator.name || t("lock.unknownOp")}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label={t("lock.logout")}
              title={t("lock.logout")}
              className="ml-0.5 h-6 w-6 inline-flex items-center justify-center rounded-[0.2rem] hover:bg-background/20 active:bg-background/30 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-[11px] font-mono text-muted-foreground tracking-wider uppercase">
            {t("lock.noUser")}
          </span>
        )}
      </div>
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
  const isElectron = useIsNativeShell();
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
            className="bg-background"
            onResize={(size) => setSidebarCollapsed(size.inPixels <= 70)}
          >
            <SidebarContent
              collapsed={sidebarCollapsed}
              onToggleCollapse={toggleSidebarCollapse}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="shell-main" minSize={360}>
            {/* id="desktop-content" mirrors id="mobile-content" so DynamicUIElement's
                bg-push effect can target the right element on either layout. */}
            <div id="desktop-content" className="flex h-full flex-col overflow-hidden">
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
              onToggleCollapse={toggleRightPanel}
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
