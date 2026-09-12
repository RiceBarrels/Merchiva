"use client";

// Every existing Merchiva feature (the pages under app/manager/*) that can be
// opened as an "app" from the store-device and personal-device home grids.
// Pages are loaded lazily (next/dynamic, ssr: false) and rendered inside the
// surface's slide-over panel via <EmbeddedPage>.

import { useMemo, type ComponentType } from "react";
import dynamic from "next/dynamic";
import {
  Bell, CalendarCheck, LayoutDashboard, MessageSquare, Monitor, MonitorSmartphone,
  Package, Palette, Settings2, Tag, TrendingUp, UserRoundSearch, Users, type LucideIcon,
} from "lucide-react";
import type { Permissions } from "@/lib/types";
import type { BetaFeatureKey } from "@/lib/beta-features";
import { usePermissions } from "@/lib/context/permissions";
import { useBetaFeatures } from "@/lib/spacetimedb/hooks/useBetaFeatures";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";
import type { DeviceApp } from "./types";

export interface CatalogPage {
  /** Manager route of this page (used to intercept in-page tab links). */
  route: string;
  component: ComponentType;
  /** Extra gating on top of the app's own (e.g. the website builder tab). */
  permissionKey?: keyof Permissions;
  betaFeature?: BetaFeatureKey;
  managerOnly?: boolean;
}

export interface CatalogApp {
  /** Stable id, also used as the i18n key `device.catalog.<id>`. */
  id: string;
  icon: LucideIcon;
  /** Manager route this feature lives at (used to intercept in-page links). */
  route: string;
  /** Permission section gating the app (undefined = everyone). */
  permissionKey?: keyof Permissions;
  /** Beta feature flag that must be on (same keys as the sidebar nav). */
  betaFeature?: BetaFeatureKey;
  /** Which surfaces show it by default. */
  surfaces: Array<"store" | "personal">;
  /** Managers only (owner / manager role). */
  managerOnly?: boolean;
  /** Lazy page component. */
  component: ComponentType;
  /** Dark tile / dock membership on the grid. */
  dark?: boolean;
  dock?: boolean;
  /** Dock membership per surface (overrides `dock`). */
  dockOn?: Array<"store" | "personal">;
  /** Sibling pages that share this app (the manager UI's tab group). */
  pages?: CatalogPage[];
}

function Loading() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <Spinner size={20} className="text-muted-foreground" />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazy(loader: () => Promise<{ default: ComponentType<any> }>): ComponentType {
  return dynamic(loader, { ssr: false, loading: Loading }) as ComponentType;
}

export const APP_CATALOG: CatalogApp[] = [
  { id: "dashboard", icon: LayoutDashboard, route: "/manager/dashboard", permissionKey: "dashboard", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/dashboard/page")) },
  // Personnel hub: schedule · team · roles · training · pay share one app
  // (the hub tab strip switches pages inside the panel).
  { id: "personnel", icon: Users, route: "/manager/personnel/schedule", permissionKey: "staffing", surfaces: ["store", "personal"], dockOn: ["personal"],
    component: lazy(() => import("@/app/manager/personnel/schedule/page")),
    pages: [
      { route: "/manager/personnel/team", permissionKey: "team", component: lazy(() => import("@/app/manager/personnel/team/page")) },
      { route: "/manager/personnel/roles", permissionKey: "team", managerOnly: true, component: lazy(() => import("@/app/manager/personnel/roles/page")) },
      { route: "/manager/personnel/training", component: lazy(() => import("@/app/manager/personnel/training/page")) },
      { route: "/manager/personnel/pay", component: lazy(() => import("@/app/manager/personnel/pay/page")) },
    ] },
  // Inventory · Suppliers · Waste log are one tab group in the manager UI.
  { id: "inventory", icon: Package, route: "/manager/inventory", permissionKey: "inventory", surfaces: ["store"], dockOn: ["store"],
    component: lazy(() => import("@/app/manager/inventory/page")),
    pages: [
      { route: "/manager/suppliers", component: lazy(() => import("@/app/manager/suppliers/page")) },
      { route: "/manager/inventory/waste", component: lazy(() => import("@/app/manager/inventory/waste/page")) },
    ] },
  // Products · Pricing
  { id: "products", icon: Tag, route: "/manager/products", permissionKey: "products", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/products/page")),
    pages: [{ route: "/manager/pricing", component: lazy(() => import("@/app/manager/pricing/page")) }] },
  // Sales · Reports · Finances
  { id: "sales", icon: TrendingUp, route: "/manager/sales", permissionKey: "sales", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/sales/page")),
    pages: [
      { route: "/manager/reports", component: lazy(() => import("@/app/manager/reports/page")) },
      { route: "/manager/finances", component: lazy(() => import("@/app/manager/finances/page")) },
    ] },
  { id: "pos", icon: MonitorSmartphone, route: "/manager/pos", permissionKey: "pos", betaFeature: "pos", surfaces: ["store"], dark: true, dockOn: ["store"],
    component: lazy(() => import("@/app/manager/pos/page")) },
  // Bookings · Membership · Reviews · Website builder share the storefront tabs.
  { id: "bookings", icon: CalendarCheck, route: "/manager/bookings", permissionKey: "settings", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/bookings/page")),
    pages: [
      { route: "/manager/membership", component: lazy(() => import("@/app/manager/membership/page")) },
      { route: "/manager/reviews", component: lazy(() => import("@/app/manager/reviews/page")) },
      { route: "/manager/builder", permissionKey: "website", betaFeature: "website", managerOnly: true, component: lazy(() => import("@/app/manager/builder/page")) },
    ] },
  // Customers · Marketing
  { id: "customers", icon: UserRoundSearch, route: "/manager/customers", permissionKey: "sales", betaFeature: "website", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/customers/page")),
    pages: [{ route: "/manager/marketing", component: lazy(() => import("@/app/manager/marketing/page")) }] },
  { id: "notifications", icon: Bell, route: "/manager/notifications", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/notifications/page")) },
  { id: "channel", icon: MessageSquare, route: "/manager/channel", permissionKey: "staffing", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/channel/page")) },
  { id: "display", icon: Monitor, route: "/manager/display", permissionKey: "pos", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/display/page")) },
  { id: "design", icon: Palette, route: "/manager/design", permissionKey: "website", betaFeature: "design", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/design/page")) },
  // Store settings · Integrations
  { id: "settings-org", icon: Settings2, route: "/manager/settings", permissionKey: "settings", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/settings/page")),
    pages: [{ route: "/manager/api-settings", component: lazy(() => import("@/app/manager/api-settings/page")) }] },
];

const BY_ID = new Map(APP_CATALOG.map((a) => [a.id, a]));

/** Catalog entry by id, or null. */
export function catalogApp(id: string): CatalogApp | null {
  return BY_ID.get(id) ?? null;
}

/** The app's main page as a CatalogPage. */
export function mainPage(app: CatalogApp): CatalogPage {
  return { route: app.route, component: app.component };
}

/** Every page of an app, main page first. */
export function catalogPages(app: CatalogApp): CatalogPage[] {
  return [mainPage(app), ...(app.pages ?? [])];
}

/** Page for `route` within `app` (falls back to the main page). */
export function catalogPage(app: CatalogApp, route?: string | null): CatalogPage {
  if (!route) return mainPage(app);
  return catalogPages(app).find((pg) => pg.route === route) ?? mainPage(app);
}

function normalize(pathname: string): string {
  return pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

/** App + page for a manager route (longest prefix match), or null. */
export function catalogPageForRoute(pathname: string): { app: CatalogApp; page: CatalogPage } | null {
  const path = normalize(pathname);
  let best: { app: CatalogApp; page: CatalogPage } | null = null;
  for (const app of APP_CATALOG) {
    for (const page of catalogPages(app)) {
      if (path === page.route || path.startsWith(page.route + "/")) {
        if (!best || page.route.length > best.page.route.length) best = { app, page };
      }
    }
  }
  return best;
}

/** Catalog entry for a manager route (longest prefix match), or null. */
export function catalogAppForRoute(pathname: string): CatalogApp | null {
  return catalogPageForRoute(pathname)?.app ?? null;
}

/** Whether `page` may be opened by an actor with these checks. */
export function pageAllowed(
  page: { permissionKey?: keyof Permissions; betaFeature?: BetaFeatureKey; managerOnly?: boolean },
  ctx: { can: (section: keyof Permissions) => boolean; isManager: boolean; betaFeatures: Partial<Record<BetaFeatureKey, boolean>> },
): boolean {
  if (page.managerOnly && !ctx.isManager) return false;
  if (page.betaFeature && !ctx.betaFeatures[page.betaFeature]) return false;
  if (page.permissionKey && !ctx.can(page.permissionKey)) return false;
  return true;
}

/** Grid entries for a surface, already filtered by permission + role. */
/** Who the grid is for. The store device passes its logged-in operator so a
 *  staff PIN never unlocks the manager apps of the account the tablet is
 *  signed in with; /personal omits it and uses the signed-in user. */
export interface CatalogActor {
  role: string;
  permissions: Permissions;
}

export function useCatalogApps(surface: "store" | "personal", actor?: CatalogActor | null): DeviceApp[] {
  const t = useT();
  const { can: canSelf, role: selfRole } = usePermissions();
  const { betaFeatures } = useBetaFeatures();
  const role = actor ? actor.role : selfRole;
  const isManager = role === "owner" || role === "manager";
  const can = useMemo(
    () =>
      actor
        ? (section: keyof Permissions) => actor.role === "owner" || actor.permissions[section]?.view === true
        : (section: keyof Permissions) => canSelf(section, "view"),
    [actor, canSelf],
  );
  return useMemo(
    () =>
      APP_CATALOG.filter((a) => {
        if (!a.surfaces.includes(surface)) return false;
        if (a.managerOnly && !isManager) return false;
        if (a.betaFeature && !betaFeatures[a.betaFeature]) return false;
        if (a.permissionKey && !can(a.permissionKey)) return false;
        return true;
      }).map((a) => ({
        id: a.id,
        label: t(`device.catalog.${a.id}`),
        icon: a.icon,
        dark: a.dark,
        dock: a.dockOn ? a.dockOn.includes(surface) : a.dock,
      })),
    [surface, isManager, betaFeatures, can, t],
  );
}
