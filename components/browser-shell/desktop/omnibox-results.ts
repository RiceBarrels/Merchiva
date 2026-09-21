"use client";

import { useMemo } from "react";
import { FilePlus, History, PanelTop, Plus, Settings, Sparkles, Star, Store, type LucideIcon } from "lucide-react";
import type { AppIcon } from "@/components/device/app-icons";
import {
  NOT_SEARCHABLE,
  ROUTES,
  getRouteAccess,
  listNavSections,
  matchRoute,
  parseOmniboxInput,
  useAccessContext,
  useActiveTab,
  useShortcutLabel,
  useTabsSnapshot,
  type AccessContext,
  type TabUrl,
} from "@/lib/browser-shell";
import { usePermissions } from "@/lib/context/permissions";
import type { RecentDocumentItem } from "@/lib/docs/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import type { OrgSummary } from "@/lib/types";
import { ADDRESS_HOST, describeTab, displayAddress, pathnameOf } from "./tab-describe";

/*
 * Omnibox result model (desktop spec §4.3). Everything except the hook is pure so the
 * ranking can be reasoned about (and tested) without React.
 */

export type OmniboxGroupId = "top" | "tabs" | "pages" | "docs" | "stores" | "actions" | "closed";
export type OmniboxActionId =
  | "new-tab"
  | "new-document"
  | "settings"
  | "switch-store"
  | "reopen-closed"
  | "toggle-bookmarks-bar"
  | "bookmark-page"
  | "ask-merchiva";
export type OmniboxItem =
  | { kind: "tab"; id: string; tabId: string; title: string; url: TabUrl; icon: AppIcon }
  | { kind: "page"; id: string; title: string; parentTitle?: string; url: TabUrl; icon: AppIcon }
  | { kind: "doc"; id: string; title: string; url: TabUrl; updatedAtMs: number }
  | { kind: "store"; id: string; orgId: string; title: string; logoUrl: string | null }
  | { kind: "action"; id: OmniboxActionId; title: string; icon: LucideIcon; shortcut?: string }
  | { kind: "closed"; id: string; closedId: string; title: string; url: TabUrl; icon: AppIcon }
  | { kind: "path"; id: "typed-path"; title: string; url: TabUrl };
export interface OmniboxGroup {
  value: OmniboxGroupId;
  label: string;
  items: OmniboxItem[];
}

export const OMNIBOX_LIMITS = Object.freeze({
  emptyTabs: 5,
  emptyDocs: 5,
  emptyClosed: 5,
  tabs: 5,
  pages: 6,
  docs: 5,
  stores: 5,
  actions: 5,
  total: 14,
});

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Matching ────────────────────────────────────────────────────────────────

function normalizeText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase();
}

/**
 * 0 = no match. Every whitespace-separated query token must match a field; each token
 * scores the best of: primary starts with it (100), a primary word starts with it (70),
 * primary contains it (40), a secondary field contains it (25). Token scores add up.
 * Secondary fields carry English path segments and registry keywords, so users of CJK
 * or Arabic locales can still type `inv`.
 */
export function scoreMatch(query: string, fields: { primary: string; secondary?: readonly string[] }): number {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const primary = normalizeText(fields.primary);
  const words = primary.split(/[\s\-_/·&.,:;()[\]]+/).filter(Boolean);
  const secondary = (fields.secondary ?? []).map(normalizeText);
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    if (primary.startsWith(token)) best = 100;
    else if (words.some((word) => word.startsWith(token))) best = 70;
    else if (primary.includes(token)) best = 40;
    else if (secondary.some((field) => field.includes(token))) best = 25;
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/** Input that should get a "Go to merchiva/…" row: contains a slash or scheme, or starts with the host. */
export function looksLikeTypedPath(input: string): boolean {
  const value = input.trim();
  if (!value || /\s/.test(value)) return false;
  return value.includes("/") || value.toLowerCase().startsWith(ADDRESS_HOST);
}

/**
 * "/inventory", "inventory/waste", "merchiva/inventory/waste", "/manager/…" or a same-origin
 * absolute URL → the canonical "/manager/…" URL, but only when it maps to a registry route the
 * user may open. Anything else → null: arbitrary text is never navigated (use-router.md XSS note).
 */
export function normalizeTypedPath(input: string, ctx: AccessContext): TabUrl | null {
  let raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  let candidate: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    candidate = raw;
  } else {
    const lower = raw.toLowerCase();
    if (lower === ADDRESS_HOST) raw = "";
    else if (lower.startsWith(`${ADDRESS_HOST}/`) || lower.startsWith(`${ADDRESS_HOST}?`)) raw = raw.slice(ADDRESS_HOST.length);
    raw = raw.replace(/^\/+/, "");
    candidate = raw === "manager" || /^manager[/?]/.test(raw) ? `/${raw}` : raw ? `/manager/${raw}` : "/manager";
  }
  const parsed = parseOmniboxInput(candidate);
  if (parsed.kind !== "url") return null;
  if (!matchRoute(pathnameOf(parsed.url))) return null;
  if (getRouteAccess(parsed.url, ctx) !== "allowed") return null;
  return parsed.url;
}

function urlSegments(url: TabUrl): string[] {
  return pathnameOf(url)
    .split("/")
    .filter((segment) => segment && segment !== "manager")
    .map((segment) => segment.replace(/[-_]+/g, " "));
}

// ─── Sources ─────────────────────────────────────────────────────────────────

export interface OmniboxPageSource {
  readonly href: TabUrl;
  readonly title: string;
  readonly parentTitle?: string;
  readonly icon: AppIcon;
  readonly keywords: readonly string[];
}

export interface OmniboxActionSource {
  readonly id: OmniboxActionId;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly shortcut?: string;
  readonly keywords: readonly string[];
}

export interface OmniboxSources {
  /** Open tabs except the active one, most recently active first. */
  readonly tabs: readonly { tabId: string; title: string; url: TabUrl; icon: AppIcon }[];
  /** Top-level sections (shown for an empty query). */
  readonly sections: readonly OmniboxPageSource[];
  /** Every searchable page: sections, their children and unlisted routes the user may open. */
  readonly pages: readonly OmniboxPageSource[];
  readonly docs: readonly RecentDocumentItem[];
  readonly stores: readonly OrgSummary[];
  readonly actions: readonly OmniboxActionSource[];
  readonly closed: readonly { closedId: string; title: string; url: TabUrl; icon: AppIcon }[];
  /** Resolved "Go to" target for the query, or null. */
  readonly typedPath: TabUrl | null;
  /** When the omnibox opened (for the "updated within 24h" doc bonus). */
  readonly now: number;
}

export interface OmniboxText {
  readonly groups: Readonly<Record<OmniboxGroupId, string>>;
  readonly untitled: string;
  goTo(url: TabUrl): string;
}

type ScoredGroup = "tabs" | "pages" | "docs" | "stores" | "actions";

interface Scored {
  readonly item: OmniboxItem;
  readonly score: number;
  readonly group: ScoredGroup;
  readonly url: TabUrl | null;
}

function docItem(doc: RecentDocumentItem, untitled: string): OmniboxItem {
  return { kind: "doc", id: `doc:${doc.id}`, title: doc.title.trim() || untitled, url: doc.href, updatedAtMs: doc.updatedAt.getTime() };
}

function pageItem(page: OmniboxPageSource): OmniboxItem {
  return { kind: "page", id: `page:${page.href}`, title: page.title, parentTitle: page.parentTitle, url: page.href, icon: page.icon };
}

function actionItem(action: OmniboxActionSource): OmniboxItem {
  return { kind: "action", id: action.id, title: action.title, icon: action.icon, shortcut: action.shortcut };
}

export function buildOmniboxGroups(query: string, sources: OmniboxSources, text: OmniboxText): OmniboxGroup[] {
  const q = query.trim();
  const groups: OmniboxGroup[] = [];
  const push = (value: OmniboxGroupId, items: OmniboxItem[]) => {
    if (items.length > 0) groups.push({ value, label: text.groups[value], items });
  };

  if (!q) {
    push(
      "tabs",
      sources.tabs.slice(0, OMNIBOX_LIMITS.emptyTabs).map((tab) => ({ kind: "tab", id: `tab:${tab.tabId}`, ...tab })),
    );
    push("docs", sources.docs.slice(0, OMNIBOX_LIMITS.emptyDocs).map((doc) => docItem(doc, text.untitled)));
    push("pages", sources.sections.map(pageItem));
    push(
      "closed",
      sources.closed
        .slice(0, OMNIBOX_LIMITS.emptyClosed)
        .map((record) => ({ kind: "closed", id: `closed:${record.closedId}`, ...record })),
    );
    push("actions", sources.actions.map(actionItem));
    return groups;
  }

  const scored: Scored[] = [];
  for (const tab of sources.tabs) {
    const score = scoreMatch(q, { primary: tab.title, secondary: [displayAddress(tab.url), ...urlSegments(tab.url)] });
    if (score > 0) scored.push({ item: { kind: "tab", id: `tab:${tab.tabId}`, ...tab }, score: score + 10, group: "tabs", url: tab.url });
  }
  for (const page of sources.pages) {
    const score = scoreMatch(q, {
      primary: page.title,
      secondary: [...page.keywords, ...urlSegments(page.href), ...(page.parentTitle ? [page.parentTitle] : [])],
    });
    if (score > 0) scored.push({ item: pageItem(page), score, group: "pages", url: page.href });
  }
  for (const doc of sources.docs) {
    const score = scoreMatch(q, { primary: doc.title });
    if (score <= 0) continue;
    const fresh = sources.now - doc.updatedAt.getTime() < DAY_MS;
    scored.push({ item: docItem(doc, text.untitled), score: score + (fresh ? 5 : 0), group: "docs", url: doc.href });
  }
  for (const org of sources.stores) {
    const score = scoreMatch(q, { primary: org.name });
    if (score > 0) {
      scored.push({
        item: { kind: "store", id: `store:${org.id}`, orgId: org.id, title: org.name, logoUrl: org.logoUrl ?? null },
        score,
        group: "stores",
        url: null,
      });
    }
  }
  for (const action of sources.actions) {
    const score = scoreMatch(q, { primary: action.title, secondary: action.keywords });
    if (score > 0) scored.push({ item: actionItem(action), score, group: "actions", url: null });
  }

  const ranked = scored
    .filter((entry) => !sources.typedPath || entry.url !== sources.typedPath || entry.group === "tabs")
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  const top: OmniboxItem[] = [];
  if (sources.typedPath) {
    top.push({ kind: "path", id: "typed-path", title: text.goTo(sources.typedPath), url: sources.typedPath });
  }
  const best = ranked[0];
  if (best) top.push(best.item);

  const rest = (group: ScoredGroup, limit: number) =>
    ranked.filter((entry) => entry.group === group && entry !== best).slice(0, limit).map((entry) => entry.item);

  const ordered: Array<[OmniboxGroupId, OmniboxItem[]]> = [
    ["top", top],
    ["tabs", rest("tabs", OMNIBOX_LIMITS.tabs)],
    ["pages", rest("pages", OMNIBOX_LIMITS.pages)],
    ["docs", rest("docs", OMNIBOX_LIMITS.docs)],
    ["stores", rest("stores", OMNIBOX_LIMITS.stores)],
    ["actions", rest("actions", OMNIBOX_LIMITS.actions)],
  ];
  let budget: number = OMNIBOX_LIMITS.total;
  for (const [value, items] of ordered) {
    if (budget <= 0) break;
    const taken = items.slice(0, budget);
    budget -= taken.length;
    push(value, taken);
  }
  return groups;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface OmniboxResultOptions {
  /** `getRouteAccess("/manager/docs") === "allowed"`. */
  readonly docsAllowed: boolean;
  readonly merchivaAllowed: boolean;
  readonly bookmarksBarVisible: boolean;
  /** The active tab shows the New Tab page ("Bookmark this tab" is hidden there). */
  readonly isNewTabPage: boolean;
  /** When the omnibox opened. */
  readonly openedAt: number;
}

/**
 * Grouped, ranked results for `query`. `docs` comes from `useRecentDocuments(20)`, which the
 * caller only mounts while the omnibox is open and Docs is allowed, so docs tables are never
 * subscribed by the idle chrome.
 */
export function useOmniboxResults(
  query: string,
  docs: readonly RecentDocumentItem[],
  opts: OmniboxResultOptions,
): OmniboxGroup[] {
  const t = useT();
  const snapshot = useTabsSnapshot();
  const activeTab = useActiveTab();
  const ctx = useAccessContext();
  const { organizations, currentOrg } = usePermissions();
  const newTabShortcut = useShortcutLabel("newTab");
  const reopenShortcut = useShortcutLabel("reopenClosedTab");
  const toggleBarShortcut = useShortcutLabel("toggleBookmarksBar");
  const { docsAllowed, merchivaAllowed, bookmarksBarVisible, isNewTabPage, openedAt } = opts;

  const pageSources = useMemo(() => {
    const navSections = listNavSections(ctx);
    const sections: OmniboxPageSource[] = [];
    const pages: OmniboxPageSource[] = [];
    const seen = new Set<string>();
    const add = (page: OmniboxPageSource) => {
      if (seen.has(page.href)) return;
      seen.add(page.href);
      pages.push(page);
    };
    for (const section of navSections) {
      const sectionTitle = t(section.titleKey);
      const page: OmniboxPageSource = {
        href: section.href,
        title: sectionTitle,
        icon: section.icon,
        keywords: matchRoute(section.href)?.keywords ?? [],
      };
      sections.push(page);
      add(page);
      for (const child of section.children) {
        const childTitle = t(child.titleKey);
        add({
          href: child.href,
          title: childTitle,
          parentTitle: childTitle !== sectionTitle ? sectionTitle : undefined,
          icon: child.icon,
          keywords: matchRoute(child.href)?.keywords ?? [],
        });
      }
    }
    // Personal mode lists only its own sections (listings, not access).
    if (!ctx.personalMode) {
      for (const route of ROUTES) {
        // `NOT_SEARCHABLE` (aliases and parameterized pages) is core's, shared with the New Tab
        // page's search so both fields offer the same pages; the paywall is excluded by kind, and
        // the home page is already in `seen` from the Home section above.
        if (route.listed || route.kind === "gate" || NOT_SEARCHABLE.has(route.prefix)) continue;
        const href = route.sectionHref ?? route.prefix;
        if (seen.has(href) || getRouteAccess(href, ctx) !== "allowed") continue;
        const parent = route.parent ? ROUTES.find((candidate) => candidate.prefix === route.parent) : undefined;
        add({
          href,
          title: t(route.titleKey),
          parentTitle: parent && parent.titleKey !== route.titleKey ? t(parent.titleKey) : undefined,
          icon: route.icon,
          keywords: route.keywords ?? [],
        });
      }
    }
    return { sections, pages };
  }, [ctx, t]);

  return useMemo(() => {
    const activeId = activeTab?.id ?? null;
    const tabs = snapshot.tabs
      .filter((tab) => tab.id !== activeId)
      .slice()
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map((tab) => {
        const summary = describeTab(tab, snapshot.gate, t);
        return { tabId: tab.id, title: summary.title, url: summary.url, icon: summary.icon };
      });
    const closed = snapshot.closed.slice(0, OMNIBOX_LIMITS.emptyClosed).map((record) => {
      const summary = describeTab(record.tab, null, t);
      return { closedId: record.id, title: summary.title, url: summary.url, icon: summary.icon };
    });

    const actions: OmniboxActionSource[] = [
      { id: "new-tab", title: t("browser.actions.newTab"), icon: Plus, shortcut: newTabShortcut ?? undefined, keywords: ["new tab", "open"] },
    ];
    if (docsAllowed) {
      actions.push({ id: "new-document", title: t("browserDesktop.actions.newDocument"), icon: FilePlus, keywords: ["new document", "doc", "create", "write"] });
    }
    actions.push(
      { id: "settings", title: t("nav.settings"), icon: Settings, keywords: ["settings", "preferences", "options"] },
      { id: "switch-store", title: t("browserDesktop.actions.switchStore"), icon: Store, keywords: ["switch store", "store", "organization", "location", "create store"] },
    );
    if (snapshot.closed.length > 0) {
      actions.push({ id: "reopen-closed", title: t("browser.actions.reopenClosedTab"), icon: History, shortcut: reopenShortcut ?? undefined, keywords: ["reopen", "closed tab", "restore"] });
    }
    actions.push({
      id: "toggle-bookmarks-bar",
      title: bookmarksBarVisible ? t("browserDesktop.actions.hideBookmarksBar") : t("browserDesktop.actions.toggleBookmarksBar"),
      icon: PanelTop,
      shortcut: toggleBarShortcut ?? undefined,
      keywords: ["bookmarks bar", "toolbar", "show", "hide"],
    });
    if (!isNewTabPage) {
      actions.push({ id: "bookmark-page", title: t("browserDesktop.actions.bookmarkPage"), icon: Star, keywords: ["bookmark", "star", "favorite", "save"] });
    }
    if (merchivaAllowed) {
      actions.push({ id: "ask-merchiva", title: t("browserDesktop.actions.askMerchiva"), icon: Sparkles, keywords: ["ask", "ai", "assistant", "merchiva", "help", "chat"] });
    }

    const typedPath = looksLikeTypedPath(query) ? normalizeTypedPath(query, ctx) : null;

    return buildOmniboxGroups(
      query,
      {
        tabs,
        sections: pageSources.sections,
        pages: pageSources.pages,
        docs: docsAllowed ? docs : [],
        stores: organizations.filter((org) => org.id !== currentOrg?.id),
        actions,
        closed,
        typedPath,
        now: openedAt,
      },
      {
        groups: {
          top: t("browserDesktop.omnibox.groups.top"),
          tabs: t("browserDesktop.omnibox.groups.tabs"),
          pages: t("browserDesktop.omnibox.groups.pages"),
          docs: t("browserDesktop.omnibox.groups.docs"),
          stores: t("browserDesktop.omnibox.groups.stores"),
          actions: t("browserDesktop.omnibox.groups.actions"),
          closed: t("browserDesktop.omnibox.groups.closed"),
        },
        untitled: t("browser.untitled"),
        goTo: (url) => fmt(t("browserDesktop.omnibox.goTo"), { path: displayAddress(url) }),
      },
    );
  }, [
    query,
    docs,
    ctx,
    t,
    snapshot.tabs,
    snapshot.closed,
    snapshot.gate,
    activeTab,
    organizations,
    currentOrg,
    pageSources,
    newTabShortcut,
    reopenShortcut,
    toggleBarShortcut,
    docsAllowed,
    merchivaAllowed,
    bookmarksBarVisible,
    isNewTabPage,
    openedAt,
  ]);
}
