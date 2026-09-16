import { useCallback, useMemo } from "react";
import type { AppIcon } from "@/components/device/app-icons";
import { PERSONAL_MODE_HREFS, useAppMode } from "@/lib/app-mode";
import { isCapacitorHiddenPath, useIsCapacitor } from "@/lib/capacitor";
import { usePermissions } from "@/lib/context/permissions";
import { isManagerRouteEnabled } from "@/lib/device-apps";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import type { Permissions } from "@/lib/types";
import { ROUTES, matchRoute } from "./routes";
import { isTabbablePathname } from "./url";
import type { AccessContext, NavSection, RouteAccess, RouteDef, TabUrl } from "./types";

function pathnameOf(url: string): string {
  const p = (url.split(/[?#]/, 1)[0] ?? "").replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

function hrefOf(route: RouteDef): TabUrl {
  return route.sectionHref ?? route.prefix;
}

function routePermitted(route: RouteDef, ctx: AccessContext): boolean {
  if (ctx.isOwner) return true;
  if (route.permissionKey && !ctx.can(route.permissionKey, "view")) return false;
  if (route.extraPermissionKey && !ctx.can(route.extraPermissionKey, "view")) return false;
  return true;
}

/**
 * Order (tab-state §5.2):
 *   notTabbable  → !isTabbablePathname
 *   unknownRoute → no registry match
 *   forbidden    → a permission key fails can(key,"view"), or a Capacitor-hidden path in the native app
 *   featureOff   → device apps loaded and the route's optional app isn't installed
 *   allowed
 */
export function getRouteAccess(url: TabUrl, ctx: AccessContext): RouteAccess {
  const pathname = pathnameOf(url);
  if (!isTabbablePathname(pathname)) return "notTabbable";
  const route = matchRoute(pathname);
  if (!route) return "unknownRoute";
  if (!routePermitted(route, ctx)) return "forbidden";
  if (ctx.isCapacitor && isCapacitorHiddenPath(pathname)) return "forbidden";
  if (ctx.appsReady && !isManagerRouteEnabled(pathname, ctx.installedApps)) return "featureOff";
  return "allowed";
}

/** Same filters as the sidebar children (sidebar.tsx:961-968). */
function childVisible(child: RouteDef, ctx: AccessContext): boolean {
  if (!isManagerRouteEnabled(child.prefix, ctx.installedApps)) return false;
  if (ctx.isCapacitor && isCapacitorHiddenPath(child.prefix)) return false;
  if (ctx.personalMode && !PERSONAL_MODE_HREFS.has(child.prefix)) return false;
  return routePermitted(child, ctx);
}

/**
 * Launcher / bookmarks-bar sections. Filter = sidebar.tsx:912-925 (installed apps, personal
 * mode, Capacitor-hidden, permission) + 961-968 for children, without the store-machine rule
 * (store-machine devices keep the legacy shell).
 */
export function listNavSections(ctx: AccessContext): NavSection[] {
  const sections: NavSection[] = [];
  for (const section of ROUTES) {
    if (!section.section || !section.listed) continue;
    const href = hrefOf(section);
    const childRoutes = ROUTES.filter((r) => r.parent === section.prefix && r.listed && !r.section);

    if (!isManagerRouteEnabled(href, ctx.installedApps)) continue;
    if (ctx.isCapacitor && isCapacitorHiddenPath(href)) continue;
    if (ctx.personalMode && !PERSONAL_MODE_HREFS.has(href) && !childRoutes.some((c) => PERSONAL_MODE_HREFS.has(c.prefix))) continue;
    if (!routePermitted(section, ctx)) continue;

    const children = childRoutes
      .filter((child) => childVisible(child, ctx))
      .map((child) => ({ href: child.prefix, titleKey: child.titleKey, icon: child.icon }));
    // A section whose only listed child is its own target shows no sub-pages (it would repeat the row).
    const visibleChildren = children.length === 1 && children[0].href === href ? [] : children;

    sections.push({
      href,
      titleKey: section.titleKey,
      icon: section.icon,
      permissionKey: section.permissionKey,
      children: visibleChildren,
    });
  }
  return sections;
}

/**
 * Routes that make no sense as a search result: aliases and pages that need parameters. Gates
 * (`kind: "gate"`) are excluded separately, by kind. Shared with the desktop omnibox so both
 * search fields offer the same pages.
 */
export const NOT_SEARCHABLE: ReadonlySet<string> = new Set(["/manager", "/manager/docs/edit", "/manager/usage"]);

function matchStrength(query: string, text: string): number {
  const haystack = text.toLocaleLowerCase();
  if (!haystack) return 0;
  if (haystack.startsWith(query)) return 3;
  if (haystack.split(/[\s\-_/·&.,]+/).some((word) => word.startsWith(query))) return 2;
  if (haystack.includes(query)) return 1;
  return 0;
}

function lastSegment(prefix: string): string {
  const segment = prefix.slice(prefix.lastIndexOf("/") + 1);
  return segment.replace(/[-_]+/g, " ");
}

/**
 * Case-insensitive match over the localized title, the English keywords and the last path
 * segment. Ranking: prefix > word start > substring; title beats keyword beats segment.
 * Only routes whose access is "allowed" (listed or not), never an alias or a gate; personal mode
 * lists only PERSONAL_MODE_HREFS. Results are deduped by href and sorted best first.
 */
export function searchRoutes(
  q: string,
  t: (k: string) => string,
  ctx: AccessContext,
): { href: TabUrl; titleKey: string; parentTitleKey?: string; icon: AppIcon; score: number }[] {
  const query = q.trim().toLocaleLowerCase();
  if (!query) return [];
  const byHref = new Map<string, { href: TabUrl; titleKey: string; parentTitleKey?: string; icon: AppIcon; score: number }>();

  for (const route of ROUTES) {
    // A gate (the paywall) is an overlay the shell raises itself, never a place to navigate to.
    if (NOT_SEARCHABLE.has(route.prefix) || route.kind === "gate") continue;
    const href = hrefOf(route);
    if (getRouteAccess(href, ctx) !== "allowed") continue;
    if (ctx.personalMode && !PERSONAL_MODE_HREFS.has(href)) continue;

    const titleStrength = matchStrength(query, t(route.titleKey));
    const keywordStrength = Math.max(0, ...(route.keywords ?? []).map((keyword) => matchStrength(query, keyword)));
    const segmentStrength = matchStrength(query, lastSegment(route.prefix));
    const score = Math.max(
      titleStrength > 0 ? titleStrength * 10 + 2 : 0,
      keywordStrength > 0 ? keywordStrength * 10 + 1 : 0,
      segmentStrength > 0 ? segmentStrength * 10 : 0,
    );
    if (score <= 0) continue;

    const parent = route.parent ? ROUTES.find((r) => r.prefix === route.parent) : undefined;
    const parentTitleKey = parent && parent.titleKey !== route.titleKey ? parent.titleKey : undefined;
    const existing = byHref.get(href);
    if (!existing || existing.score < score) {
      byHref.set(href, { href, titleKey: route.titleKey, parentTitleKey, icon: route.icon, score });
    }
  }

  return Array.from(byHref.values()).sort(
    (a, b) => b.score - a.score || t(a.titleKey).localeCompare(t(b.titleKey)),
  );
}

/** Access inputs for the current user, org, device apps, app mode and platform. */
export function useAccessContext(): AccessContext {
  const { isOwner, permissions } = usePermissions();
  const { installed, isReady } = useDeviceApps();
  const [appMode] = useAppMode();
  const isCapacitor = useIsCapacitor();

  // Mirrors PermissionsProvider.can(section, "view") (lib/context/permissions.tsx:76-83) with a
  // stable identity, so the context only changes when its inputs do.
  const can = useCallback(
    (section: keyof Permissions) => isOwner || permissions?.[section]?.view === true,
    [isOwner, permissions],
  );

  return useMemo<AccessContext>(
    () => ({
      isOwner,
      can,
      installedApps: installed,
      appsReady: isReady,
      appMode,
      personalMode: appMode === "personal",
      isCapacitor,
    }),
    [isOwner, can, installed, isReady, appMode, isCapacitor],
  );
}

/** `listNavSections` for the current access context. */
export function useNavSections(): NavSection[] {
  const ctx = useAccessContext();
  return useMemo(() => listNavSections(ctx), [ctx]);
}
