import { createElement, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import type { AppIcon } from "@/components/device/app-icons";
import { useT } from "@/lib/i18n/context";
import { createFallbackTabActions } from "./fallback";
import { IDLE_SNAPSHOT, pathnameOf } from "./model";
import { matchRoute, titleForUrl } from "./routes";
import { tabsStore } from "./store";
import { useTabSlotId } from "./tab-slot-context";
import { canonicalizeUrl } from "./url";
import {
  NEW_TAB_URL,
  currentEntry,
  type BrowserTab,
  type ClosedTabRecord,
  type EntryKey,
  type HistoryEntry,
  type TabActions,
  type TabId,
  type TabPresentation,
  type TabUrl,
  type TabsSnapshot,
} from "./types";

/** CustomEvent<{ url: string; activate: boolean }> dispatched on `window`. */
export const OPEN_TAB_EVENT = "merchiva:open-tab";

const EMPTY_ENTRIES: readonly HistoryEntry[] = Object.freeze([]);

/** Icon for URLs with no registry route. */
const GenericPageIcon: AppIcon = function GenericPageIcon({ className }) {
  return createElement(Globe, { className, "aria-hidden": true });
};

function getServerSnapshot(): TabsSnapshot {
  return IDLE_SNAPSHOT;
}

/** Tab model snapshot (the frozen idle snapshot on the server and outside the browser shell). */
export function useTabsSnapshot(): TabsSnapshot {
  return useSyncExternalStore(tabsStore.subscribe, tabsStore.getState, getServerSnapshot);
}

/** The tab the chrome highlights (requested), falling back to the rendered tab. */
export function useActiveTab(): BrowserTab | null {
  const snapshot = useTabsSnapshot();
  const id = snapshot.requestedTabId ?? snapshot.activeTabId;
  return useMemo(() => (id ? snapshot.tabs.find((tab) => tab.id === id) ?? null : null), [snapshot.tabs, id]);
}

export function useTab(id: TabId | null): BrowserTab | null {
  const snapshot = useTabsSnapshot();
  return useMemo(() => (id ? snapshot.tabs.find((tab) => tab.id === id) ?? null : null), [snapshot.tabs, id]);
}

function presentUrl(url: TabUrl, pageTitle: string | undefined, pending: boolean, t: (key: string) => string): TabPresentation {
  const pathname = pathnameOf(url);
  const route = matchRoute(pathname);
  return {
    title: titleForUrl(url, pageTitle, t),
    icon: route?.icon ?? GenericPageIcon,
    url,
    isNewTab: pathname === NEW_TAB_URL,
    route,
    pending,
  };
}

/**
 * Presentation of a tab outside React (tab search, New Tab page suggestions). A gated tab shows
 * the gate route; otherwise the current entry with its page title.
 */
export function presentTab(tab: BrowserTab, snapshot: TabsSnapshot, t: (key: string) => string): TabPresentation {
  const pending = snapshot.pendingTabIds.includes(tab.id);
  if (snapshot.gate && snapshot.gate.tabId === tab.id) return presentUrl(snapshot.gate.url, undefined, pending, t);
  const entry = currentEntry(tab);
  return presentUrl(entry.url, entry.title, pending, t);
}

/**
 * Title precedence: page title (useSetTabTitle) → registry title ("New Tab" for the New Tab
 * page) → last path segment → "Untitled". A gated tab shows the gate route. With `tab === null`
 * the current router pathname is presented (legacy shell / before the store is ready).
 */
export function useTabPresentation(tab: BrowserTab | null): TabPresentation {
  const t = useT();
  const snapshot = useTabsSnapshot();
  const pathname = usePathname();
  return useMemo(() => {
    if (!tab) {
      const canonical = pathname ? canonicalizeUrl(pathname) : null;
      return presentUrl(canonical?.tabbable ? canonical.url : NEW_TAB_URL, undefined, false, t);
    }
    return presentTab(tab, snapshot, t);
  }, [tab, snapshot, pathname, t]);
}

const EMPTY_HISTORY = Object.freeze({
  canGoBack: false,
  canGoForward: false,
  back: EMPTY_ENTRIES,
  forward: EMPTY_ENTRIES,
});

/** Back/forward lists for long-press menus, nearest entry first. */
export function useTabHistory(tabId: TabId | null): {
  canGoBack: boolean;
  canGoForward: boolean;
  back: readonly HistoryEntry[];
  forward: readonly HistoryEntry[];
} {
  const tab = useTab(tabId);
  return useMemo(() => {
    if (!tab) return EMPTY_HISTORY;
    const { entries, index } = tab.history;
    return {
      canGoBack: index > 0,
      canGoForward: index < entries.length - 1,
      back: entries.slice(0, Math.max(0, index)).reverse(),
      forward: entries.slice(index + 1),
    };
  }, [tab]);
}

/** Recently closed tabs, newest first. */
export function useClosedTabs(limit?: number): readonly ClosedTabRecord[] {
  const { closed } = useTabsSnapshot();
  return useMemo(() => (limit === undefined ? closed : closed.slice(0, Math.max(0, limit))), [closed, limit]);
}

function getMountNonce(): number {
  return tabsStore.getState().mountNonce;
}

function getServerMountNonce(): number {
  return 0;
}

/**
 * The tab store's mount nonce: changes only on a soft reload (TabPageOutlet then remounts the
 * rendered tab's page). Subscribes to the nonce alone, so other tab changes never re-render.
 */
export function useTabMountKey(): string {
  return String(useSyncExternalStore(tabsStore.subscribe, getMountNonce, getServerMountNonce));
}

/**
 * The entry a page in `slotTabId`'s keep-alive slot shows: that tab's current entry (null while
 * it is gated). Outside a slot, the rendered entry.
 */
function slotEntry(slotTabId: TabId | null): { tab: BrowserTab; entry: HistoryEntry } | null {
  if (slotTabId === null) return tabsStore.getRenderedEntry();
  const state = tabsStore.getState();
  const tab = state.tabs.find((candidate) => candidate.id === slotTabId);
  if (!tab || state.gate?.tabId === tab.id) return null;
  return { tab, entry: currentEntry(tab) };
}

function getNoEntryKey(): EntryKey | null {
  return null;
}

/**
 * Sets the tab title of the entry this page renders (doc editor → document title).
 * The component binds to its tab's entry shown when it first commits (the keep-alive slot's tab,
 * so a page kept alive in a background tab never writes another tab's title). It re-binds only
 * when that entry changes to one with the SAME pathname (a page stays mounted across search-param
 * changes); a different pathname means this page is leaving, so a late title still lands on its
 * own entry. `null` is a no-op (the registry title shows); titles are not cleared on unmount.
 * No-op outside a browser shell.
 */
export function useSetTabTitle(title: string | null): void {
  const slotTabId = useTabSlotId();
  const getEntryKey = useCallback(() => slotEntry(slotTabId)?.entry.key ?? null, [slotTabId]);
  const renderedKey = useSyncExternalStore(tabsStore.subscribe, getEntryKey, getNoEntryKey);
  const binding = useRef<{ entryKey: EntryKey; pathname: string } | null>(null);
  useEffect(() => {
    const rendered = renderedKey === null ? null : slotEntry(slotTabId);
    if (rendered) {
      const pathname = pathnameOf(rendered.entry.url);
      const bound = binding.current;
      if (!bound || (bound.entryKey !== rendered.entry.key && bound.pathname === pathname)) {
        binding.current = { entryKey: rendered.entry.key, pathname };
      }
    }
    const bound = binding.current;
    const text = title?.trim();
    if (!bound || !text) return;
    tabsStore.setPageTitle(bound.entryKey, text);
  }, [renderedKey, slotTabId, title]);
}

/**
 * Tab actions. Inside a bound browser shell they drive the tab store; without one (legacy
 * shell, device surfaces, before binding) they fall back to plain router navigation
 * (plan §B1.5). Callers must only surface an error when `reason === "limit"`.
 */
export function useTabActions(): TabActions {
  const router = useRouter();
  return useMemo<TabActions>(() => {
    const fallback = createFallbackTabActions(router);
    const pick = (): TabActions => (tabsStore.isReady() ? tabsStore.actions : fallback);
    return {
      openTab: (url, opts) => pick().openTab(url, opts),
      openNewTabPage: (opts) => pick().openNewTabPage(opts),
      openUrl: (url, disposition) => pick().openUrl(url, disposition),
      activateTab: (id) => pick().activateTab(id),
      activateRelative: (delta) => pick().activateRelative(delta),
      activateIndex: (index) => pick().activateIndex(index),
      closeTab: (id, opts) => pick().closeTab(id, opts),
      closeOtherTabs: (id) => pick().closeOtherTabs(id),
      closeTabsToRight: (id) => pick().closeTabsToRight(id),
      closeAllTabs: () => pick().closeAllTabs(),
      reorderTab: (id, toIndex) => pick().reorderTab(id, toIndex),
      setPinned: (id, pinned) => pick().setPinned(id, pinned),
      duplicateTab: (id) => pick().duplicateTab(id),
      reopenClosedTab: (closedId) => pick().reopenClosedTab(closedId),
      navigateActive: (url, opts) => pick().navigateActive(url, opts),
      goBack: (opts) => pick().goBack(opts),
      goForward: () => pick().goForward(),
      goToEntry: (tabId, index) => pick().goToEntry(tabId, index),
      reload: (opts) => pick().reload(opts),
      goHome: () => pick().goHome(),
      prepareOrgSwitch: (orgId) => pick().prepareOrgSwitch(orgId),
    };
  }, [router]);
}

/**
 * Opens an in-app URL in a new tab from non-React code. Inside the browser shell this
 * dispatches OPEN_TAB_EVENT (handled by BrowserShellProvider); elsewhere it navigates.
 * Cross-origin or unparseable URLs are ignored.
 */
export function openInNewTab(url: string, opts?: { activate?: boolean }): void {
  if (typeof window === "undefined") return;
  const href = canonicalizeUrl(url)?.url;
  if (!href) return;
  if (document.documentElement.dataset.browserShell) {
    window.dispatchEvent(
      new CustomEvent<{ url: string; activate: boolean }>(OPEN_TAB_EVENT, {
        detail: { url: href, activate: opts?.activate ?? true },
      }),
    );
    return;
  }
  window.location.assign(href);
}
