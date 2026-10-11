// Which optional Merchiva apps are "installed" on the /store and /personal
// device surfaces. A manager (or anyone with settings edit permission)
// downloads apps from the device App Store; the set is org-wide and cached
// on the settings row as a JSON string[] of app ids (`deviceApps`).

import type { Permissions } from "@/lib/types";

/** Apps every device always has; they can't be removed and aren't stored. */
export const REQUIRED_DEVICE_APPS = [
  "punch-in",
  "schedule",
  "directory",
  "channel",
  "merchiva",
  "inventory",
  "settings",
  "bugs",
  // Every file lives in Drive; Docs, Sheets and Slides are editor plugins
  // that open its files (EDITOR_PLUGINS).
  "drive",
  // Manager-only shell pieces that are never "apps" to download.
  "dashboard",
  "personnel",
  "settings-org",
] as const;

const REQUIRED = new Set<string>(REQUIRED_DEVICE_APPS);

/**
 * Ids of apps that no longer exist. A stored list can still hold one: "notifications" was an
 * installable app before it became a required one, and notifications are now built in (a dot on
 * each feature's entry, no inbox, no tile). Never installed, never written back.
 */
export const RETIRED_DEVICE_APPS: readonly string[] = ["notifications"];

const RETIRED = new Set<string>(RETIRED_DEVICE_APPS);

export function isRequiredDeviceApp(id: string): boolean {
  return REQUIRED.has(id);
}

/** A document editor that installs as its own plugin and opens its files inside Drive. */
export type EditorKind = "doc" | "sheet" | "slides";
export const EDITOR_KINDS: readonly EditorKind[] = ["doc", "sheet", "slides"];
/** Plugin (device app) id of each editor. */
export const EDITOR_PLUGINS: Readonly<Record<EditorKind, "docs" | "sheets" | "slides">> = { doc: "docs", sheet: "sheets", slides: "slides" };

export function editorPluginOf(kind: EditorKind): "docs" | "sheets" | "slides" {
  return EDITOR_PLUGINS[kind];
}

/** Whether `kind`'s editor plugin is installed. */
export function isEditorInstalled(kind: EditorKind, installed: ReadonlySet<string> | string[]): boolean {
  return isDeviceAppInstalled(editorPluginOf(kind), installed);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Every distinct id in the stored JSON (string[]), required ones included. Unknown shapes → empty. */
function storedIds(raw: unknown): string[] {
  let value = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  return out;
}

/** Parses the stored JSON (string[] of ids), dropping required and retired ids. Unknown shapes → empty. */
export function parseDeviceApps(raw: unknown): string[] {
  return storedIds(raw).filter((id) => !REQUIRED.has(id) && !RETIRED.has(id));
}

/**
 * The installed list a settings row stands for.
 *
 * Legacy rule (read path only): Sheets and Slides used to be pages of Drive, so a stored list that still holds
 * "drive" also stands for both editors. Only clients from before the split wrote "drive": every write now goes
 * through parseDeviceApps (lib/spacetimedb/actions.ts setDeviceApps), which drops it as a required id. The first
 * write after the split therefore stores "sheets" and "slides" explicitly and drops "drive", and from then on
 * uninstalling either editor sticks. A retired id ("notifications") is dropped on both paths (RETIRED_DEVICE_APPS).
 */
export function deviceAppsFromSettingsRow(row: unknown): string[] {
  if (!isObject(row) || !Object.prototype.hasOwnProperty.call(row, "deviceApps")) return [];
  const ids = parseDeviceApps(row.deviceApps);
  if (!storedIds(row.deviceApps).includes("drive")) return ids;
  for (const id of [EDITOR_PLUGINS.sheet, EDITOR_PLUGINS.slides]) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** Whether an app is available on the devices (required, or installed). */
export function isDeviceAppInstalled(id: string, installed: ReadonlySet<string> | string[]): boolean {
  if (REQUIRED.has(id)) return true;
  return Array.isArray(installed) ? installed.includes(id) : installed.has(id);
}

/** Who may open the App Store and install / remove apps: owners and
 *  managers, or members granted settings edit. Mirrors the reducer check. */
export function canManageDeviceApps(role: string | null | undefined, permissions: Permissions | null | undefined): boolean {
  if (role === "owner" || role === "manager") return true;
  return permissions?.settings?.edit === true;
}

/** Manager routes owned by an optional app. Installing the app from
 *  /manager/apps turns the whole org feature on: these routes (nav items,
 *  tab strips, page guards) and the device tiles. Longest prefix wins.
 *  Drive (/manager/drive) is required and always on, so it owns no route
 *  here; its Sheets / Slides editor pages belong to those editor plugins. */
export const MANAGER_ROUTE_APPS: Record<string, string> = {
  "/manager/sales": "sales",
  "/manager/reports": "sales",
  "/manager/finances": "sales",
  "/manager/products": "products",
  "/manager/pricing": "products",
  "/manager/personnel/roles": "tasks",
  "/manager/personnel/training": "training",
  "/manager/personnel/pay": "pay",
  // Only the Docs editor: the old Docs home (/manager/docs) is an always-on alias of Drive's documents view.
  "/manager/docs/edit": "docs",
  "/manager/drive/sheet": "sheets",
  "/manager/drive/slides": "slides",
  "/manager/bookings": "bookings",
  "/manager/reviews": "bookings",
  "/manager/forms": "forms",
};

/** App id owning a manager route, or null when the route is always on. */
export function appForManagerRoute(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  let best: string | null = null;
  let bestLen = -1;
  for (const [route, app] of Object.entries(MANAGER_ROUTE_APPS)) {
    if ((path === route || path.startsWith(route + "/")) && route.length > bestLen) {
      best = app;
      bestLen = route.length;
    }
  }
  return best;
}

/** Whether a manager route is enabled for the org (always-on, or its app is installed). */
export function isManagerRouteEnabled(pathname: string, installed: ReadonlySet<string> | string[]): boolean {
  const app = appForManagerRoute(pathname);
  return !app || isDeviceAppInstalled(app, installed);
}
