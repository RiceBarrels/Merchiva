"use client";

// Every existing Merchiva feature (the pages under app/manager/*) that can be
// opened as an "app" from the store-device and personal-device home grids.
// Pages are loaded lazily (next/dynamic, ssr: false) and rendered inside the
// surface's slide-over panel via <EmbeddedPage>.

import { useMemo, type ComponentType } from "react";
import dynamic from "next/dynamic";
import {
  BadgeDollarSign, Bell, CalendarCheck, CalendarDays, Crown, FileBarChart, Globe,
  GraduationCap, LayoutDashboard, Megaphone, MessageSquare, Monitor, MonitorSmartphone,
  Package, Palette, PiggyBank, Plug, Settings2, Star, Tag, Trash2, TrendingUp, Truck, UserCog,
  UserRoundSearch, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { Permissions } from "@/lib/types";
import type { BetaFeatureKey } from "@/lib/beta-features";
import { usePermissions } from "@/lib/context/permissions";
import { useBetaFeatures } from "@/lib/spacetimedb/hooks/useBetaFeatures";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";
import type { DeviceApp } from "./types";

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
  { id: "schedule", icon: CalendarDays, route: "/manager/personnel/schedule", permissionKey: "staffing", surfaces: ["store", "personal"], dockOn: ["personal"],
    component: lazy(() => import("@/app/manager/personnel/schedule/page")) },
  { id: "training", icon: GraduationCap, route: "/manager/personnel/training", permissionKey: "staffing", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/personnel/training/page")) },
  { id: "pay", icon: Wallet, route: "/manager/personnel/pay", permissionKey: "staffing", surfaces: ["personal"],
    component: lazy(() => import("@/app/manager/personnel/pay/page")) },
  { id: "team", icon: Users, route: "/manager/personnel/team", permissionKey: "team", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/personnel/team/page")) },
  { id: "roles", icon: UserCog, route: "/manager/personnel/roles", permissionKey: "team", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/personnel/roles/page")) },
  { id: "inventory", icon: Package, route: "/manager/inventory", permissionKey: "inventory", surfaces: ["store"], dockOn: ["store"],
    component: lazy(() => import("@/app/manager/inventory/page")) },
  { id: "waste", icon: Trash2, route: "/manager/inventory/waste", permissionKey: "inventory", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/inventory/waste/page")) },
  { id: "products", icon: Tag, route: "/manager/products", permissionKey: "products", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/products/page")) },
  { id: "pricing", icon: BadgeDollarSign, route: "/manager/pricing", permissionKey: "products", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/pricing/page")) },
  { id: "suppliers", icon: Truck, route: "/manager/suppliers", permissionKey: "inventory", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/suppliers/page")) },
  { id: "sales", icon: TrendingUp, route: "/manager/sales", permissionKey: "sales", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/sales/page")) },
  { id: "pos", icon: MonitorSmartphone, route: "/manager/pos", permissionKey: "pos", betaFeature: "pos", surfaces: ["store"], dark: true, dockOn: ["store"],
    component: lazy(() => import("@/app/manager/pos/page")) },
  { id: "bookings", icon: CalendarCheck, route: "/manager/bookings", permissionKey: "sales", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/bookings/page")) },
  { id: "customers", icon: UserRoundSearch, route: "/manager/customers", permissionKey: "sales", betaFeature: "website", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/customers/page")) },
  { id: "marketing", icon: Megaphone, route: "/manager/marketing", permissionKey: "sales", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/marketing/page")) },
  { id: "finances", icon: PiggyBank, route: "/manager/finances", permissionKey: "sales", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/finances/page")) },
  { id: "reports", icon: FileBarChart, route: "/manager/reports", permissionKey: "sales", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/reports/page")) },
  { id: "reviews", icon: Star, route: "/manager/reviews", permissionKey: "sales", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/reviews/page")) },
  { id: "membership", icon: Crown, route: "/manager/membership", permissionKey: "sales", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/membership/page")) },
  { id: "notifications", icon: Bell, route: "/manager/notifications", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/notifications/page")) },
  { id: "channel", icon: MessageSquare, route: "/manager/channel", permissionKey: "staffing", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/channel/page")) },
  { id: "display", icon: Monitor, route: "/manager/display", permissionKey: "pos", surfaces: ["store"],
    component: lazy(() => import("@/app/manager/display/page")) },
  { id: "website", icon: Globe, route: "/manager/builder", permissionKey: "website", betaFeature: "website", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/builder/page")) },
  { id: "design", icon: Palette, route: "/manager/design", permissionKey: "website", betaFeature: "design", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/design/page")) },
  { id: "settings-org", icon: Settings2, route: "/manager/settings", permissionKey: "settings", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/settings/page")) },
  { id: "api-settings", icon: Plug, route: "/manager/api-settings", permissionKey: "settings", surfaces: ["store"], managerOnly: true,
    component: lazy(() => import("@/app/manager/api-settings/page")) },
];

const BY_ID = new Map(APP_CATALOG.map((a) => [a.id, a]));

/** Catalog entry by id, or null. */
export function catalogApp(id: string): CatalogApp | null {
  return BY_ID.get(id) ?? null;
}

/** Catalog entry for a manager route (longest prefix match), or null. */
export function catalogAppForRoute(pathname: string): CatalogApp | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  let best: CatalogApp | null = null;
  for (const app of APP_CATALOG) {
    if (path === app.route || path.startsWith(app.route + "/")) {
      if (!best || app.route.length > best.route.length) best = app;
    }
  }
  return best;
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
