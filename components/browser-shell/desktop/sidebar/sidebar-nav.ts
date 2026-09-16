import { matchRoute, type NavSection, type TabUrl } from "@/lib/browser-shell";
import { pathnameOf } from "../tab-describe";

/*
 * Pure helpers behind the desktop sidebar's nav rows. They only read the core route registry,
 * so the sidebar's permission / device-app / personal-mode gating stays exactly what
 * `useNavSections()` returns, and the row logic stays unit-testable.
 */

/** Sections pinned to the bottom of the sidebar instead of the scrolling nav list. */
export const SIDEBAR_PINNED_HREFS: readonly string[] = ["/manager/settings"];

/**
 * Identity of a nav target: its registry route prefix, so `/manager/personnel/team/42` and
 * `/manager/personnel/team` are the same row. Unregistered URLs fall back to their pathname.
 */
export function navKeyOf(url: TabUrl): string {
  const pathname = pathnameOf(url);
  return matchRoute(pathname)?.prefix ?? pathname;
}

/** The section prefix that owns `url` (a section route itself, or its parent). */
export function sectionKeyOf(url: TabUrl): string | null {
  const route = matchRoute(pathnameOf(url));
  if (!route) return null;
  return route.section ? route.prefix : route.parent ?? route.prefix;
}

/** True when `href` is the row the active URL is on (`aria-current="page"`). */
export function isRowActive(href: TabUrl, activeUrl: TabUrl): boolean {
  return navKeyOf(href) === navKeyOf(activeUrl);
}

/** True when one of the section's listed sub-pages is the row the active URL is on. */
export function hasActiveChild(section: NavSection, activeUrl: TabUrl): boolean {
  return section.children.some((child) => isRowActive(child.href, activeUrl));
}

/**
 * Whether the section's own row carries the highlight and `aria-current="page"`.
 * `childrenVisible` is true only while its sub-page list is on screen (expanded, and not the
 * icon rail), so the row lights up when:
 *   - a visible child already shows the location → that child wins (legacy sidebar.tsx:997);
 *   - its own route is active;
 *   - it owns the active URL and nothing else shows it: an unlisted sub-route such as
 *     /manager/docs/edit or /manager/settings/billing (neither is in `section.children`, so no
 *     child row can carry it), or a collapsed section hiding its active child. The legacy
 *     sidebar lit the parent in both cases (sidebar.tsx:973-974, 997-1001).
 */
export function isSectionRowActive(
  section: NavSection,
  activeUrl: TabUrl,
  activeSection: TabUrl | null,
  childrenVisible: boolean,
): boolean {
  if (hasActiveChild(section, activeUrl)) return !childrenVisible;
  if (isRowActive(section.href, activeUrl)) return true;
  return activeSection === section.href;
}

/** The href of the section the active URL belongs to, or null when it is outside the nav. */
export function activeSectionHref(sections: readonly NavSection[], activeUrl: TabUrl): TabUrl | null {
  const activeKey = sectionKeyOf(activeUrl);
  if (activeKey === null) return null;
  for (const section of sections) {
    if (sectionKeyOf(section.href) === activeKey) return section.href;
    if (section.children.some((child) => sectionKeyOf(child.href) === activeKey)) return section.href;
  }
  return null;
}

/** Splits `useNavSections()` into the scrolling nav list and the rows pinned to the bottom. */
export function splitSidebarSections(sections: readonly NavSection[]): {
  primary: NavSection[];
  pinned: NavSection[];
} {
  const pinnedSet = new Set(SIDEBAR_PINNED_HREFS);
  const primary: NavSection[] = [];
  const pinned: NavSection[] = [];
  for (const section of sections) {
    if (pinnedSet.has(navKeyOf(section.href))) pinned.push(section);
    else primary.push(section);
  }
  return { primary, pinned };
}

/**
 * Adds `href` to the expanded set without ever collapsing another section — the auto-expand
 * of the active section, kept pure so it can be tested and so the caller can skip a re-render
 * when nothing changes.
 */
export function withExpanded(expanded: ReadonlySet<string>, href: string | null): ReadonlySet<string> {
  if (href === null || expanded.has(href)) return expanded;
  const next = new Set(expanded);
  next.add(href);
  return next;
}

/** Flips one section open or closed. */
export function toggleExpanded(expanded: ReadonlySet<string>, href: string): ReadonlySet<string> {
  const next = new Set(expanded);
  if (!next.delete(href)) next.add(href);
  return next;
}
