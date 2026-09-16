import { createElement } from "react";
import { Globe } from "lucide-react";
import type { AppIcon } from "@/components/device/app-icons";
import { matchRoute } from "../routes";
import { NEW_TAB_URL, type PreviewKind, type RouteDef } from "../types";

/*
 * Labels for URLs that are not the active tab's current entry (history rows, bookmarks,
 * search suggestions, back/forward lists). Same precedence as core's tab presentation:
 * page title → registry title → last path segment → "Untitled". The New Tab page is the home
 * page, so its registry title is `nav.home`; only the "new tab" affordances say "New Tab".
 */

export const GenericPageIcon: AppIcon = function GenericPageIcon({ className }) {
  return createElement(Globe, { className, "aria-hidden": true });
};

export interface UrlLabel {
  readonly title: string;
  readonly icon: AppIcon;
  readonly isNewTab: boolean;
  readonly route: RouteDef | null;
  readonly pathname: string;
  readonly previewKind: PreviewKind;
}

export function pathOfUrl(url: string): string {
  const cut = url.search(/[?#]/);
  const path = (cut < 0 ? url : url.slice(0, cut)).replace(/\/+$/, "");
  return path === "" ? "/" : path;
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

export function labelForUrl(url: string, pageTitle: string | undefined, t: (key: string) => string): UrlLabel {
  const pathname = pathOfUrl(url);
  const isNewTab = pathname === NEW_TAB_URL;
  const route = matchRoute(pathname);
  const fromPage = pageTitle?.trim();
  let title: string;
  if (fromPage) title = fromPage;
  else if (route) title = t(route.titleKey);
  else title = prettifySegment(pathname) || t("browser.untitled");
  return {
    title,
    icon: route?.icon ?? GenericPageIcon,
    isNewTab,
    route,
    pathname,
    previewKind: isNewTab ? "blank" : route?.previewKind ?? "list",
  };
}

/** 3 = prefix, 2 = word start, 1 = substring, 0 = no match. `query` must be lower-cased and trimmed. */
export function matchStrength(query: string, text: string | undefined | null): number {
  if (!query || !text) return 0;
  const haystack = text.toLocaleLowerCase();
  if (haystack.startsWith(query)) return 3;
  if (haystack.split(/[\s\-_/·&.,:()]+/).some((word) => word.startsWith(query))) return 2;
  if (haystack.includes(query)) return 1;
  return 0;
}

/** Local calendar day key (YYYY-M-D) for grouping history rows. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
