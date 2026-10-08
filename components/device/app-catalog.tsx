"use client";

// Every Merchiva feature that can be opened as an "app" from the store-device
// and personal-device home grids.
//
// Device apps are LITE versions built for frontline staff (see
// components/device/apps/lite.tsx): an entry is shown on the grids only when
// it has a `lite` component. The full manager pages (`component` / `pages`,
// loaded lazily) are only ever shown in /manager; here they serve link
// interception and any kiosk-style page flagged `keepManagerPage`.

import { useMemo, type ComponentType } from "react";
import dynamic from "next/dynamic";
import {
  BookingsIcon, BugIcon, ChannelIcon, DashboardIcon, DirectoryIcon, DocsIcon, DriveIcon, FormsIcon, InventoryIcon,
  NotificationsIcon, PayIcon, ProductsIcon, SalesIcon, ScheduleIcon, SheetsIcon, SlidesIcon, StoreSettingsIcon,
  TasksIcon, TrainingIcon, type AppIcon,
} from "./app-icons";
import type { Permissions } from "@/lib/types";
import { usePermissions } from "@/lib/context/permissions";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { isDeviceAppInstalled, type EditorKind } from "@/lib/device-apps";
import { DEFAULT_DEVICE_APPS } from "./apps-grid";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";
import type { DeviceApp, TileColor } from "./types";
import type { LiteAppProps } from "./apps/types";

export interface CatalogPage {
  /** Manager route of this page (used to intercept in-page tab links). */
  route: string;
  component: ComponentType;
  /** Extra gating on top of the app's own (e.g. the website builder tab). */
  permissionKey?: keyof Permissions;
  managerOnly?: boolean;
}

export interface CatalogApp {
  /** Stable id, also used as the i18n key `device.catalog.<id>`. */
  id: string;
  icon: AppIcon;
  /** Manager route this feature lives at (used to intercept in-page links). */
  route: string;
  /** Permission section gating the app (undefined = everyone). */
  permissionKey?: keyof Permissions;
  /** Which surfaces show it. Every app is on both today; the grid is gated
   *  per user by `permissionKey` / `managerOnly` instead. */
  surfaces: Array<"store" | "personal">;
  /** Managers only (owner / manager role). */
  managerOnly?: boolean;
  /** Lazy manager page component (fallback / kiosk pages only). */
  component: ComponentType;
  /** Simplified device app. Entries without one are hidden from the grids
   *  unless `keepManagerPage` is set. */
  lite?: ComponentType<LiteAppProps>;
  /** Show the manager page as-is (kiosk-style UIs such as the POS terminal). */
  keepManagerPage?: boolean;
  /** An editor plugin: no tile of its own; it opens and creates its kind of
   *  file inside Drive on every surface (Drive's device app hosts its
   *  editor). Listed in the plugin store. */
  editor?: EditorKind;
  /** Tile colour on the grid (every app gets its own). */
  color?: TileColor;
  /** Dark tile (legacy; prefer `color`). */
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

/** Lazy lite app (named export). Loaded on open, like the manager pages. */
function lite(loader: () => Promise<ComponentType<LiteAppProps>>): ComponentType<LiteAppProps> {
  return dynamic(() => loader().then((c) => ({ default: c })), { ssr: false, loading: Loading }) as ComponentType<LiteAppProps>;
}

export const APP_CATALOG: CatalogApp[] = [
  { id: "dashboard", icon: DashboardIcon, route: "/manager/dashboard", color: "slate", permissionKey: "dashboard", surfaces: ["store", "personal"], managerOnly: true,
    component: lazy(() => import("@/app/manager/dashboard/page")) },
  // Personnel: the manager hub (schedule · team · roles · training · pay) is
  // split into four single-purpose lite apps. Everyone sees their own data,
  // so none of them is permission-gated; the hub entry below stays for link
  // interception only (no lite → hidden from the grids).
  { id: "schedule", icon: ScheduleIcon, route: "/manager/personnel/schedule", color: "indigo", surfaces: ["store", "personal"], dockOn: ["personal"],
    component: lazy(() => import("@/app/manager/personnel/schedule/page")),
    lite: lite(() => import("./apps/schedule").then((m) => m.ScheduleLite)) },
  // Tasks = the manager's "Roles" tab (roles + their task lists); the lite
  // app is today's to-do list. Installing it turns the roles tab on.
  { id: "tasks", icon: TasksIcon, route: "/manager/personnel/roles", color: "green", surfaces: ["store", "personal"], dockOn: ["personal"],
    component: lazy(() => import("@/app/manager/personnel/roles/page")),
    lite: lite(() => import("./apps/tasks").then((m) => m.TasksLite)) },
  { id: "training", icon: TrainingIcon, route: "/manager/personnel/training", color: "purple", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/personnel/training/page")),
    lite: lite(() => import("./apps/training").then((m) => m.TrainingLite)) },
  { id: "pay", icon: PayIcon, route: "/manager/personnel/pay", color: "emerald", surfaces: ["personal"],
    component: lazy(() => import("@/app/manager/personnel/pay/page")),
    lite: lite(() => import("./apps/pay").then((m) => m.PayLite)) },
  { id: "personnel", icon: DirectoryIcon, route: "/manager/personnel/schedule", color: "indigo", permissionKey: "staffing", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/personnel/schedule/page")),
    pages: [
      { route: "/manager/personnel/team", permissionKey: "team", component: lazy(() => import("@/app/manager/personnel/team/page")) },
    ] },
  // Inventory · Suppliers · Waste log are one tab group in the manager UI.
  { id: "inventory", icon: InventoryIcon, route: "/manager/inventory", color: "orange", permissionKey: "inventory", surfaces: ["store", "personal"], dockOn: ["store"],
    component: lazy(() => import("@/app/manager/inventory/page")),
    lite: lite(() => import("./apps/inventory").then((m) => m.InventoryLite)),
    pages: [
      { route: "/manager/suppliers", component: lazy(() => import("@/app/manager/suppliers/page")) },
      { route: "/manager/inventory/waste", component: lazy(() => import("@/app/manager/inventory/waste/page")) },
    ] },
  // Products · Pricing
  { id: "products", icon: ProductsIcon, route: "/manager/products", color: "pink", permissionKey: "products", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/products/page")),
    lite: lite(() => import("./apps/products").then((m) => m.ProductsLite)),
    pages: [{ route: "/manager/pricing", component: lazy(() => import("@/app/manager/pricing/page")) }] },
  // Sales · Reports · Finances
  { id: "sales", icon: SalesIcon, route: "/manager/sales", color: "red", permissionKey: "sales", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/sales/page")),
    lite: lite(() => import("./apps/sales").then((m) => m.SalesLite)),
    pages: [
      { route: "/manager/reports", component: lazy(() => import("@/app/manager/reports/page")) },
      { route: "/manager/finances", component: lazy(() => import("@/app/manager/finances/page")) },
    ] },
  // Bookings · Membership · Reviews · Website builder share the storefront tabs.
  { id: "bookings", icon: BookingsIcon, route: "/manager/bookings", color: "sky", permissionKey: "settings", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/bookings/page")),
    lite: lite(() => import("./apps/bookings").then((m) => m.BookingsLite)),
    pages: [
      { route: "/manager/reviews", component: lazy(() => import("@/app/manager/reviews/page")) },
    ] },
  // Forms: checklists, reports and surveys. Owners and managers build them on
  // /manager/forms (by role); the device apps only fill them in, through our own
  // lite renderer. Optional: the feature stays dark until the org installs it.
  { id: "forms", icon: FormsIcon, route: "/manager/forms", color: "teal", permissionKey: "dashboard", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/forms/page")),
    lite: lite(() => import("./apps/forms").then((m) => m.FormsLite)) },
  { id: "channel", icon: ChannelIcon, route: "/manager/channel", color: "cyan", permissionKey: "staffing", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/channel/page")) },
  // Files: Drive is the one place every file lives, and it is built in
  // (lib/device-apps.ts → REQUIRED_DEVICE_APPS). Docs, Sheets and Slides are
  // editor plugins (`editor`): no tile of their own, every file is found in
  // Drive, and Drive's device panel hosts their phone layouts (./apps/drive).
  // Installing one turns its manager routes on (MANAGER_ROUTE_APPS); its
  // `component` is the editor page, for link interception.
  { id: "docs", icon: DocsIcon, route: "/manager/docs/edit", color: "amber", permissionKey: "dashboard", surfaces: ["store", "personal"], editor: "doc",
    component: lazy(() => import("@/app/manager/docs/edit/page")) },
  // Drive: every file the store keeps — uploads and folders, the Docs, Sheets
  // and Slides documents, and read-only views of files other apps stored. It
  // takes the dock spot Docs had.
  { id: "drive", icon: DriveIcon, route: "/manager/drive", color: "violet", permissionKey: "dashboard", surfaces: ["store", "personal"], dockOn: ["store", "personal"],
    component: lazy(() => import("@/app/manager/drive/page")),
    lite: lite(() => import("./apps/drive").then((m) => m.DriveLite)) },
  { id: "sheets", icon: SheetsIcon, route: "/manager/drive/sheet", color: "lime", permissionKey: "dashboard", surfaces: ["store", "personal"], editor: "sheet",
    component: lazy(() => import("@/app/manager/drive/sheet/page")) },
  { id: "slides", icon: SlidesIcon, route: "/manager/drive/slides", color: "fuchsia", permissionKey: "dashboard", surfaces: ["store", "personal"], editor: "slides",
    component: lazy(() => import("@/app/manager/drive/slides/page")) },
  // Bug tracker: on every device by default (REQUIRED_DEVICE_APPS) and gated by
  // nothing — reporting a problem with Merchiva must never depend on a
  // permission or on someone having installed the app first. Triage is on the
  // manager page, where the controls are owner/manager only.
  { id: "bugs", icon: BugIcon, route: "/manager/bugs", color: "rose", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/bugs/page")),
    lite: lite(() => import("./apps/bugs").then((m) => m.BugsLite)) },
  // Notifications · required for the same reason as Bug reports: a member's
  // own alerts must not depend on a permission or on someone installing them.
  { id: "notifications", icon: NotificationsIcon, route: "/manager/notifications", color: "amber", surfaces: ["store", "personal"],
    component: lazy(() => import("@/app/manager/notifications/page")),
    lite: lite(() => import("./apps/notifications").then((m) => m.NotificationsLite)) },
  // Store settings · Integrations
  { id: "settings-org", icon: StoreSettingsIcon, route: "/manager/settings", color: "slate", permissionKey: "settings", surfaces: ["store", "personal"], managerOnly: true,
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
  page: { permissionKey?: keyof Permissions; managerOnly?: boolean },
  ctx: { can: (section: keyof Permissions) => boolean; isManager: boolean },
): boolean {
  if (page.managerOnly && !ctx.isManager) return false;
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

/** Whether a catalog app can appear on a surface at all (has a device UI
 *  and is listed for the surface). Editor plugins never get a tile: their
 *  files open from Drive. Permission / role and install state are checked
 *  separately. */
export function catalogAppOnSurface(a: CatalogApp, surface: "store" | "personal"): boolean {
  if (a.editor) return false;
  if (!a.lite && !a.keepManagerPage) return false;
  if (!a.surfaces.includes(surface)) return false;
  return true;
}

/** Permission checks for the person using a surface (the operator on
 *  /store, the signed-in member on /personal). */
export function useCatalogActor(actor?: CatalogActor | null) {
  const { can: canSelf, role: selfRole } = usePermissions();
  const role = actor ? actor.role : selfRole;
  const isManager = role === "owner" || role === "manager";
  const can = useMemo(
    () =>
      actor
        ? (section: keyof Permissions) => actor.role === "owner" || actor.permissions[section]?.view === true
        : (section: keyof Permissions) => canSelf(section, "view"),
    [actor, canSelf],
  );
  return { role, isManager, can };
}

/** The surface's own (non-catalog) apps, filtered like the catalog: required
 *  ones always, optional ones once installed from /manager/apps. The store
 *  device has no Punch In tile (punching happens at log-in / log-out). */
export function useDeviceBuiltins(surface: "store" | "personal"): DeviceApp[] {
  const t = useT();
  const { installed } = useDeviceApps();
  const ns = surface === "store" ? "storeDevice" : "personalDevice";
  return useMemo(
    () =>
      DEFAULT_DEVICE_APPS.filter((a) => {
        if (surface === "store" && a.id === "punch-in") return false;
        return isDeviceAppInstalled(a.id, installed);
      }).map((a) => ({ ...a, label: t(`${ns}.apps.${a.id}`) })),
    [surface, installed, t, ns],
  );
}

export function useCatalogApps(surface: "store" | "personal", actor?: CatalogActor | null): DeviceApp[] {
  const t = useT();
  const { isManager, can } = useCatalogActor(actor);
  const { installed } = useDeviceApps();
  return useMemo(
    () =>
      APP_CATALOG.filter((a) => {
        if (!catalogAppOnSurface(a, surface)) return false;
        if (!isDeviceAppInstalled(a.id, installed)) return false;
        if (a.managerOnly && !isManager) return false;
        if (a.permissionKey && !can(a.permissionKey)) return false;
        return true;
      }).map((a) => ({
        id: a.id,
        label: t(`device.catalog.${a.id}`),
        icon: a.icon,
        dark: a.dark,
        color: a.color,
        dock: a.dockOn ? a.dockOn.includes(surface) : a.dock,
      })),
    [surface, isManager, can, installed, t],
  );
}
