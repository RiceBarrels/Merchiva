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
  "notifications",
  // Manager-only shell pieces that are never "apps" to download.
  "dashboard",
  "personnel",
  "settings-org",
] as const;

const REQUIRED = new Set<string>(REQUIRED_DEVICE_APPS);

export function isRequiredDeviceApp(id: string): boolean {
  return REQUIRED.has(id);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parses the stored JSON (string[] of ids). Unknown shapes → empty. */
export function parseDeviceApps(raw: unknown): string[] {
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
  for (const v of value) if (typeof v === "string" && v && !REQUIRED.has(v) && !out.includes(v)) out.push(v);
  return out;
}

export function deviceAppsFromSettingsRow(row: unknown): string[] {
  if (isObject(row) && Object.prototype.hasOwnProperty.call(row, "deviceApps")) {
    return parseDeviceApps(row.deviceApps);
  }
  return [];
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
 *  tab strips, page guards) and the device tiles. Longest prefix wins. */
export const MANAGER_ROUTE_APPS: Record<string, string> = {
  "/manager/sales": "sales",
  "/manager/reports": "sales",
  "/manager/finances": "sales",
  "/manager/products": "products",
  "/manager/pricing": "products",
  "/manager/personnel/roles": "tasks",
  "/manager/personnel/training": "training",
  "/manager/personnel/pay": "pay",
  "/manager/docs": "docs",
  // Also the Sheets / Slides editors (/manager/drive/sheet, /manager/drive/slides).
  "/manager/drive": "drive",
  "/manager/bookings": "bookings",
  "/manager/reviews": "bookings",
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
