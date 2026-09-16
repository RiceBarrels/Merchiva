import { createElement } from "react";
import { Globe } from "lucide-react";
import type { AppIcon } from "@/components/device/app-icons";
import {
  NEW_TAB_URL,
  currentEntry,
  matchRoute,
  type BrowserTab,
  type TabUrl,
  type TabsSnapshot,
  type OpenTabResult,
} from "@/lib/browser-shell";

/** Shown in place of the host in the omnibox and hover cards: `merchiva/inventory/waste`. */
export const ADDRESS_HOST = "merchiva";

const MANAGER_PREFIX = "/manager";

/** Icon for URLs without a registry route. */
export const GenericPageIcon: AppIcon = function GenericPageIcon({ className }) {
  return createElement(Globe, { className, "aria-hidden": true });
};

/** "/manager/inventory/waste?x=1" → "inventory/waste?x=1"; "/manager" → "". */
export function displayPath(url: TabUrl): string {
  let rest = url.startsWith(MANAGER_PREFIX) ? url.slice(MANAGER_PREFIX.length) : url;
  if (rest.startsWith("/")) rest = rest.slice(1);
  return rest;
}

/** "merchiva/inventory/waste", or "" for the New Tab page. */
export function displayAddress(url: TabUrl): string {
  const q = url.indexOf("?");
  const pathname = q < 0 ? url : url.slice(0, q);
  if (pathname === NEW_TAB_URL) return "";
  const path = displayPath(url);
  return path ? `${ADDRESS_HOST}/${path}` : ADDRESS_HOST;
}

export interface TabSummary {
  readonly id: string;
  readonly url: TabUrl;
  readonly title: string;
  readonly icon: AppIcon;
  readonly isNewTab: boolean;
  readonly pinned: boolean;
  readonly lastActiveAt: number;
}

function prettifySegment(pathname: string): string {
  const raw = pathname.slice(pathname.lastIndexOf("/") + 1);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const words = decoded.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : "";
}

/** Pathname part of a tab URL. */
export function pathnameOf(url: TabUrl): string {
  const q = url.indexOf("?");
  return q < 0 ? url : url.slice(0, q);
}

/**
 * Title and icon for one URL, with the `useTabPresentation` precedence: page title → registry
 * title → last path segment → "Untitled". The New Tab page is the home page, so its registry
 * title is `nav.home` (routes.ts); only the "new tab" affordances say "New Tab", from the
 * separate `browser.actions.newTab` key. `isNewTab` still rides along for the callers that
 * disable bookmarking (app-menu.tsx, bookmark-star.tsx) and blank the address.
 */
export function describeUrl(
  url: TabUrl,
  pageTitle: string | undefined,
  t: (key: string) => string,
): { title: string; icon: AppIcon; isNewTab: boolean } {
  const pathname = pathnameOf(url);
  const isNewTab = pathname === NEW_TAB_URL;
  const route = matchRoute(pathname);
  const fromPage = pageTitle?.trim();
  let title: string;
  if (fromPage) title = fromPage;
  else if (route) title = t(route.titleKey);
  else title = prettifySegment(pathname) || t("browser.untitled");
  return { title, icon: route?.icon ?? GenericPageIcon, isNewTab };
}

/**
 * Non-hook twin of `useTabPresentation` for lists (omnibox, tab search); a gated tab shows
 * the gate route.
 */
export function describeTab(tab: BrowserTab, gate: TabsSnapshot["gate"], t: (key: string) => string): TabSummary {
  const entry = currentEntry(tab);
  const gated = gate && gate.tabId === tab.id;
  const url = gated ? gate.url : entry.url;
  const described = describeUrl(url, gated ? undefined : entry.title, t);
  return {
    id: tab.id,
    url,
    title: described.title,
    icon: described.icon,
    isNewTab: described.isNewTab,
    pinned: tab.pinned,
    lastActiveAt: tab.lastActiveAt,
  };
}

/** Plan §B1.5: callers only surface an error for the tab limit. Returns true when a tab opened. */
export function reportOpenResult(
  result: OpenTabResult | null,
  t: (key: string) => string,
  toastFn: (message: string) => void,
): boolean {
  if (!result) return false;
  if (result.ok) return true;
  if (result.reason === "limit") toastFn(t("browser.tabLimit"));
  return false;
}
