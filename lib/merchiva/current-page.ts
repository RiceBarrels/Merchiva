import { presentTab } from "@/lib/browser-shell/hooks";
import { titleForUrl } from "@/lib/browser-shell/routes";
import { tabsStore } from "@/lib/browser-shell/store";
import type { TabsSnapshot } from "@/lib/browser-shell/types";
import { sanitizeCurrentPage, type CurrentPage } from "@/lib/ai/page-prompt";
import { WINDOW_PAGE_SCOPE, getPageContext, type MerchivaPageContext } from "@/lib/merchiva/page-context";

/*
 * The `page` field every Mr. Merchiva request carries: which page the chat's own tab shows, its
 * title, its search parameters and what the page said about itself (useMerchivaPageContext). Read
 * at send time — never from a subscription, so a chat does not re-render on every tab change.
 *
 * A chat belongs to its tab (the dock's sessionScope), and a background tab's chat is still
 * mounted: its page is that tab's current entry in the tab store, not window.location, which is
 * whatever the active tab shows. The "__window__" chat is the window's one Merchiva: outside the
 * browser shell (no tab store) it reads the window; on the single-tab phone layout it reads the tab
 * on screen, whose page publishes its context under the tab's id, not "__window__".
 */

export interface PageLocation {
  pathname: string;
  search: string;
}

export interface BuildCurrentPageInput {
  /** The chat's scope: a browser-shell tab id, or "__window__". */
  scope: string;
  snapshot: TabsSnapshot;
  /** window.location, for the "__window__" chat outside the browser shell. */
  location: PageLocation | null;
  t: (key: string) => string;
  context: MerchivaPageContext | null;
}

function splitUrl(url: string): { path: string; search: string } {
  const hash = url.indexOf("#");
  const bare = hash < 0 ? url : url.slice(0, hash);
  const q = bare.indexOf("?");
  return q < 0 ? { path: bare, search: "" } : { path: bare.slice(0, q), search: bare.slice(q) };
}

/**
 * The tab whose page a chat gets: its own, or for the "__window__" chat the tab on screen
 * (`requestedTabId ?? activeTabId`, the single-tab phone layout). Null when the store holds no
 * such tab — no browser shell is bound — and the "__window__" chat reads the window.
 */
export function pageTabId(scope: string, snapshot: TabsSnapshot): string | null {
  if (scope !== WINDOW_PAGE_SCOPE) return scope;
  const shown = snapshot.requestedTabId ?? snapshot.activeTabId;
  return shown && snapshot.tabs.some((tab) => tab.id === shown) ? shown : null;
}

/** What the chat's page said about itself: under the chat's own scope, else under its tab's id. */
export function pageContextFor(scope: string, snapshot: TabsSnapshot): MerchivaPageContext | null {
  const own = getPageContext(scope);
  if (own) return own;
  const tabId = pageTabId(scope, snapshot);
  return tabId && tabId !== scope ? getPageContext(tabId) : null;
}

/** The page payload for a chat, from explicit inputs (the tests drive this one). */
export function buildCurrentPage(input: BuildCurrentPageInput): CurrentPage | null {
  const tabId = pageTabId(input.scope, input.snapshot);
  let url: string;
  let title: string;
  if (tabId === null) {
    if (!input.location) return null;
    url = `${input.location.pathname}${input.location.search}`;
    title = titleForUrl(splitUrl(url).path, undefined, input.t);
  } else {
    const tab = input.snapshot.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return null;
    // The tab strip's own title and URL — a gated tab shows its gate page.
    const presented = presentTab(tab, input.snapshot, input.t);
    url = presented.url;
    title = presented.title;
  }
  const { path, search } = splitUrl(url);
  const query: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) query[key] = value;
  return sanitizeCurrentPage({ path, title, query, context: input.context ?? undefined });
}

/** The page the chat in `scope` belongs to, right now. `undefined` is the "__window__" chat. */
export function currentPagePayload(scope: string | undefined, t: (key: string) => string): CurrentPage | null {
  const key = scope || WINDOW_PAGE_SCOPE;
  const snapshot = tabsStore.getState();
  const location = typeof window === "undefined" ? null : window.location;
  return buildCurrentPage({
    scope: key,
    snapshot,
    location,
    t,
    context: pageContextFor(key, snapshot),
  });
}
