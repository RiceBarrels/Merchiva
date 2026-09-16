// Isolated fixture for scripts/tests/browser-shell/history-bridge.test.ts — NOT auto-discovered
// by `bun test` (no .test. in the name). It installs a fake browser (history, location,
// storage, events) on globalThis and replaces UI modules with mock.module, so it runs in its
// own process. The fake router writes history exactly like Next's HistoryUpdater (pushState
// with `__NA`, a same-URL push becomes a replace) and the fake history is patched the way
// Next's app router patches it, so the bridge is exercised through the real wrapper chain.

import { expect, mock, test } from "bun:test";

const toasts: string[] = [];
const visits: string[] = [];

mock.module("sonner", () => ({
  toast: Object.assign((message: string) => {
    toasts.push(message);
  }, {
    error: (message: string) => {
      toasts.push(message);
    },
  }),
}));
mock.module("@/components/page-tabs", () => ({
  skipNextPageTransition: () => {},
  shouldSkipTransition: () => false,
}));
mock.module("@/lib/browser-shell/browsing-history", () => ({
  recordBrowsingVisit: (_scope: unknown, url: string) => {
    visits.push(url);
  },
  updateBrowsingHistoryTitle: () => {},
}));

// ─── Fake browser ────────────────────────────────────────────────────────────

type HistoryWrite = (data: unknown, unused: string, url?: string | URL | null) => void;

/**
 * RouterInvariantGuard emulation: in the app it runs after every committed pathname/search
 * change (router navigations and popstate traversals). Wired to the store after import.
 */
let routeCommitted: (href: string) => void = () => {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class FakeHistory {
  entries: Array<{ url: string; state: unknown }>;
  index = 0;
  scrollRestoration: "auto" | "manual" = "auto";
  private readonly onPop: (state: unknown) => void;

  constructor(url: string, onPop: (state: unknown) => void) {
    this.entries = [{ url, state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { url } } }];
    this.onPop = onPop;
  }

  get state(): unknown {
    return this.entries[this.index].state;
  }

  get length(): number {
    return this.entries.length;
  }

  private resolve(url: string | URL | null | undefined): string {
    const current = this.entries[this.index].url;
    return url == null ? current : new URL(String(url), current).href;
  }

  pushState(data: unknown, _unused: string, url?: string | URL | null): void {
    const next = this.resolve(url);
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ url: next, state: structuredClone(data ?? null) });
    this.index = this.entries.length - 1;
  }

  replaceState(data: unknown, _unused: string, url?: string | URL | null): void {
    this.entries[this.index] = { url: this.resolve(url), state: structuredClone(data ?? null) };
  }

  go(delta: number): void {
    const target = this.index + delta;
    if (delta === 0 || target < 0 || target >= this.entries.length) return;
    setTimeout(() => {
      this.index = target;
      this.onPop(this.entries[target].state);
    }, 1);
  }

  back(): void {
    this.go(-1);
  }

  forward(): void {
    this.go(1);
  }
}

interface FakeBrowser {
  readonly history: FakeHistory;
  readonly session: Map<string, string>;
  readonly local: Map<string, string>;
  readonly router: { push(href: string): void; replace(href: string): void };
  readonly nextPush: HistoryWrite;
  readonly nextReplace: HistoryWrite;
  readonly path: string;
  readonly href: string;
  reloads: number;
  /**
   * Router navigations commit after 20 ms (an uncached route) and, like Next's action queue, a
   * newer navigation or a foreign history write with a URL (ACTION_RESTORE) discards the pending one.
   */
  slowNavigations: boolean;
}

/** What `document.querySelector("#desktop-content, #mobile-content")` returns (scroll restore). */
let contentHost: unknown = null;

function mapStorage(data: Map<string, string>): Storage {
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  } as unknown as Storage;
}

function openBrowser(path: string, storage?: { session?: Map<string, string>; local?: Map<string, string> }): FakeBrowser {
  const events = new EventTarget();
  const history = new FakeHistory(`http://local${path}`, (state) => {
    const event = new Event("popstate");
    Object.defineProperty(event, "state", { value: state });
    events.dispatchEvent(event);
    setTimeout(() => routeCommitted(history.entries[history.index].url), 0);
  });
  // Next's app router patch (app-router.js): `__NA` data passes through, other data gets Next's state copied in.
  const rawPush = history.pushState.bind(history);
  const rawReplace = history.replaceState.bind(history);
  const copyInternals = (data: unknown): Record<string, unknown> => {
    const base = isRecord(data) ? { ...data } : {};
    const current = history.state;
    if (isRecord(current) && current.__NA) {
      base.__NA = true;
      base.__PRIVATE_NEXTJS_INTERNALS_TREE = current.__PRIVATE_NEXTJS_INTERNALS_TREE;
    }
    return base;
  };
  let pendingNavigation: { cancelled: boolean } | null = null;
  const discardPendingNavigation = () => {
    if (pendingNavigation) pendingNavigation.cancelled = true;
    pendingNavigation = null;
  };
  const nextPush: HistoryWrite = function pushState(data, unused, url) {
    if (isRecord(data) && data.__NA) return rawPush(data, unused, url);
    if (url) discardPendingNavigation();
    return rawPush(copyInternals(data), unused, url);
  };
  const nextReplace: HistoryWrite = function replaceState(data, unused, url) {
    if (isRecord(data) && data.__NA) return rawReplace(data, unused, url);
    if (url) discardPendingNavigation();
    return rawReplace(copyInternals(data), unused, url);
  };
  history.pushState = nextPush;
  history.replaceState = nextReplace;
  // Next registers its popstate listener at app mount, before the shell.
  events.addEventListener("popstate", () => {});

  const session = storage?.session ?? new Map<string, string>();
  const local = storage?.local ?? new Map<string, string>();
  if (!local.has("app_mode")) local.set("app_mode", "admin");

  const browser: FakeBrowser = {
    history,
    session,
    local,
    nextPush,
    nextReplace,
    reloads: 0,
    slowNavigations: false,
    get href() {
      return history.entries[history.index].url;
    },
    get path() {
      const url = new URL(history.entries[history.index].url);
      return `${url.pathname}${url.search}`;
    },
    router: {
      push(href: string) {
        navigate("push", href);
      },
      replace(href: string) {
        navigate("replace", href);
      },
    },
  };

  // HistoryUpdater: commits after render (async), push only when the URL differs.
  function navigate(kind: "push" | "replace", href: string): void {
    const commitNavigation = () => {
      const data = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { href } };
      if (kind === "push" && new URL(href, browser.href).href !== browser.href) window.history.pushState(data, "", href);
      else window.history.replaceState(data, "", href);
      setTimeout(() => routeCommitted(browser.href), 0);
    };
    if (!browser.slowNavigations) {
      queueMicrotask(commitNavigation);
      return;
    }
    discardPendingNavigation();
    const navigation = { cancelled: false };
    pendingNavigation = navigation;
    setTimeout(() => {
      if (navigation.cancelled) return;
      pendingNavigation = null;
      commitNavigation();
    }, 20);
  }

  const location = {
    get href() {
      return browser.href;
    },
    get origin() {
      return new URL(browser.href).origin;
    },
    get pathname() {
      return new URL(browser.href).pathname;
    },
    get search() {
      return new URL(browser.href).search;
    },
    get hash() {
      return new URL(browser.href).hash;
    },
    reload: () => {
      browser.reloads++;
    },
  };
  const documentStub = {
    visibilityState: "visible",
    activeElement: null,
    documentElement: { dataset: {}, getAttribute: () => null, setAttribute: () => {}, removeAttribute: () => {} },
    querySelector: () => contentHost,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => events.addEventListener(`document:${type}`, fn),
    removeEventListener: (type: string, fn: EventListenerOrEventListenerObject) => events.removeEventListener(`document:${type}`, fn),
  };
  const windowStub = {
    history,
    location,
    sessionStorage: mapStorage(session),
    localStorage: mapStorage(local),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    innerHeight: 800,
  };
  Object.assign(globalThis, {
    window: windowStub,
    document: documentStub,
    location,
    localStorage: windowStub.localStorage,
    sessionStorage: windowStub.sessionStorage,
    requestAnimationFrame: (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
  return browser;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 3));
}

// A browser must exist before the store module evaluates (its mirror uses sessionStorage).
openBrowser("/manager/inventory");
const { __resetTabsStoreForTests, executeShellCommand, tabsStore } = await import("@/lib/browser-shell/store");
const { MIRROR_STORAGE_KEY, readStamp } = await import("@/lib/browser-shell/history-bridge");
const { AUTH_USER_STORAGE_KEY, BOOT_INTENT_KEY, localTabsKey, sessionTabsKey } = await import("@/lib/browser-shell/persistence");
const { MAX_TABS, NEW_TAB_URL, currentEntry } = await import("@/lib/browser-shell/types");
type Snapshot = ReturnType<typeof tabsStore.getState>;
routeCommitted = (href) => tabsStore.onRouteCommitted(href);

const ORG_1 = { userId: "user-1", organizationId: "org-1" };

function bind(browser: FakeBrowser, scope = ORG_1): () => void {
  return tabsStore.bind({ scope, router: browser.router });
}

const state = (): Snapshot => tabsStore.getState();
const tabOf = (id: string) => {
  const tab = state().tabs.find((candidate) => candidate.id === id);
  if (!tab) throw new Error(`tab ${id} missing`);
  return tab;
};
const urlsOf = (id: string) => tabOf(id).history.entries.map((entry) => entry.url);
const activeId = () => state().activeTabId ?? "";
const opened = (result: ReturnType<typeof tabsStore.actions.openTab>) => {
  if (!result.ok) throw new Error(`openTab failed: ${result.reason}`);
  return result.tabId;
};

test("boot, links, redirects, per-tab back/forward, background tabs, activation, native back across tabs", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/inventory");
  const release = bind(b);
  expect(state().status).toBe("ready");
  expect(state().tabs).toHaveLength(1);
  const A = activeId();
  expect(readStamp(b.history.state)?.t).toBe(A);
  expect(isRecord(b.history.state) && b.history.state.__NA).toBe(true);

  b.router.push("/manager/sales");
  await settle();
  expect(urlsOf(A)).toEqual(["/manager/inventory", "/manager/sales"]);
  expect(b.history.length).toBe(2);
  expect(readStamp(b.history.state)?.e).toBe(currentEntry(tabOf(A)).key);

  // A page redirect (router.replace) never leaves a back-button trap.
  b.router.push("/manager/personnel");
  await settle();
  b.router.replace("/manager/personnel/schedule");
  await settle();
  expect(urlsOf(A)).toEqual(["/manager/inventory", "/manager/sales", "/manager/personnel/schedule"]);
  expect(b.history.length).toBe(3);

  // Shell back / forward reuse real history entries.
  tabsStore.actions.goBack();
  expect(state().pendingTabIds).toEqual([A]);
  await settle();
  expect(tabOf(A).history.index).toBe(1);
  expect(b.path).toBe("/manager/sales");
  expect(b.history.length).toBe(3);
  expect(state().pendingTabIds).toEqual([]);
  tabsStore.actions.goForward();
  await settle();
  expect(tabOf(A).history.index).toBe(2);
  expect(b.path).toBe("/manager/personnel/schedule");

  // Background tab: model only, placed after the opener.
  const B = opened(tabsStore.actions.openTab("/manager/reports", { activate: false }));
  await settle();
  expect(state().tabs.map((tab) => tab.id)).toEqual([A, B]);
  expect(tabOf(B).openerTabId).toBe(A);
  expect(activeId()).toBe(A);
  expect(b.path).toBe("/manager/personnel/schedule");

  // Activation: the highlight moves at once, the rendered tab when the write commits.
  tabsStore.actions.activateTab(B);
  expect(state().requestedTabId).toBe(B);
  expect(state().activeTabId).toBe(A);
  expect(state().pendingTabIds).toEqual([B]);
  await settle();
  expect(activeId()).toBe(B);
  expect(state().pendingTabIds).toEqual([]);
  expect(b.path).toBe("/manager/reports");
  expect(readStamp(b.history.state)?.t).toBe(B);

  // Native back after a tab switch re-activates the previous tab; its history is untouched.
  b.history.back();
  await settle();
  expect(activeId()).toBe(A);
  expect(tabOf(A).history.index).toBe(2);
  expect(urlsOf(A)).toHaveLength(3);
  b.history.forward();
  await settle();
  expect(activeId()).toBe(B);

  // In-app back is strictly per tab.
  tabsStore.actions.goBack();
  await settle();
  expect(activeId()).toBe(B);
  expect(b.path).toBe("/manager/reports");
  // …unless back may close a fresh tab into its opener.
  tabsStore.actions.goBack({ closeToOpener: true });
  await settle();
  expect(activeId()).toBe(A);
  expect(state().tabs.map((tab) => tab.id)).toEqual([A]);
  expect(visits).toContain("/manager/reports");

  release();
  await settle();
});

test("closing, reopening, pinned shortcut guard, duplicate and the New Tab fallback", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/inventory");
  const release = bind(b);
  const A = activeId();
  const B = opened(tabsStore.actions.openTab("/manager/sales"));
  await settle();
  expect(activeId()).toBe(B);
  const keysOfB = tabOf(B).history.entries.map((entry) => entry.key);

  tabsStore.actions.closeTab(B);
  expect(state().activeTabId).toBeNull();
  expect(state().requestedTabId).toBe(A);
  await settle();
  expect(activeId()).toBe(A);
  expect(b.path).toBe("/manager/inventory");
  expect(state().closed).toHaveLength(1);

  const reopened = tabsStore.actions.reopenClosedTab();
  expect(reopened).toEqual({ ok: true, tabId: B, reused: false });
  await settle();
  expect(activeId()).toBe(B);
  expect(tabOf(B).history.entries.map((entry) => entry.key)).toEqual(keysOfB);
  expect(state().closed).toHaveLength(0);

  tabsStore.actions.setPinned(A, true);
  tabsStore.actions.activateTab(A);
  await settle();
  expect(activeId()).toBe(A);
  expect(executeShellCommand("closeTab")).toBe(true);
  await settle();
  expect(state().tabs.map((tab) => tab.id)).toEqual([A, B]);
  expect(activeId()).toBe(B);

  const nonce = state().mountNonce;
  const length = b.history.length;
  const C = opened(tabsStore.actions.duplicateTab(B));
  await settle();
  expect(activeId()).toBe(C);
  expect(state().mountNonce).toBe(nonce + 1);
  expect(b.history.length).toBe(length);
  expect(readStamp(b.history.state)?.t).toBe(C);

  tabsStore.actions.closeAllTabs();
  await settle();
  expect(state().tabs).toHaveLength(1);
  expect(currentEntry(state().tabs[0]).url).toBe(NEW_TAB_URL);
  expect(b.path).toBe(NEW_TAB_URL);
  expect(state().closed.length).toBeGreaterThanOrEqual(3);

  release();
  await settle();
});

test("dialogs, the paywall gate, drift repair, access changes and the tab limit", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/inventory");
  const release = bind(b);
  const A = activeId();
  b.router.push("/manager/sales");
  await settle();

  // DynamicUIElement writes `?dialogs=` through the global history API.
  window.history.pushState({ dialogs: 1 }, "", "/manager/sales?dialogs=Edit");
  await settle();
  expect(urlsOf(A)).toEqual(["/manager/inventory", "/manager/sales"]);
  expect(readStamp(b.history.state)?.e).toBe(currentEntry(tabOf(A)).key);
  expect(isRecord(b.history.state) && b.history.state.__NA).toBe(true);
  // Shell back skips the dialog duplicate and lands on the real previous entry.
  tabsStore.actions.goBack();
  await settle();
  expect(b.path).toBe("/manager/inventory");
  expect(b.history.index).toBe(0);
  expect(tabOf(A).history.index).toBe(0);

  // Paywall: a replace to /manager/subscribe overlays the tab without editing its history.
  b.router.push("/manager/reports");
  await settle();
  const before = urlsOf(A);
  b.router.replace("/manager/subscribe");
  await settle();
  expect(state().gate).toEqual({ tabId: A, url: "/manager/subscribe" });
  expect(urlsOf(A)).toEqual(before);
  const B = opened(tabsStore.actions.openTab("/manager/finances"));
  await settle();
  expect(activeId()).toBe(B);
  expect(state().gate).toBeNull();
  b.router.replace("/manager/subscribe");
  await settle();
  expect(state().gate?.tabId).toBe(B);
  expect(urlsOf(B)).toEqual(["/manager/finances"]);
  expect(b.session.get("merchiva_tabs:v1:user-1:org-1") ?? "").not.toContain("subscribe");

  // A URL change that bypassed the wrappers is repaired as a replace on the rendered tab.
  const warn = console.warn;
  console.warn = () => {};
  FakeHistory.prototype.replaceState.call(b.history, { __NA: true }, "", "/manager/channel");
  tabsStore.onRouteCommitted(b.href);
  console.warn = warn;
  expect(urlsOf(B)).toEqual(["/manager/channel"]);
  expect(state().gate).toBeNull();
  expect(readStamp(b.history.state)?.t).toBe(B);

  // Losing sales access removes inactive sales entries; the rendered entry is left to PermissionGuard.
  tabsStore.setAccess({
    isOwner: false,
    can: (section) => section !== "sales",
    installedApps: new Set(["sales"]),
    appsReady: true,
    appMode: "admin",
    personalMode: false,
    isCapacitor: false,
  });
  await settle();
  expect(urlsOf(A)).toEqual(["/manager/inventory"]);
  expect(urlsOf(B)).toEqual(["/manager/channel"]);

  for (let i = state().tabs.length; i < MAX_TABS; i++) tabsStore.actions.openTab(`/manager/inventory?n=${i}`, { activate: false });
  expect(state().tabs).toHaveLength(MAX_TABS);
  expect(tabsStore.actions.openTab("/manager/inventory?n=x", { activate: false })).toEqual({ ok: false, reason: "limit" });
  tabsStore.actions.openUrl("/manager/inventory?n=y", "new-background");
  expect(toasts).toContain("browser.tabLimit");
  expect(tabsStore.actions.openTab("/choose")).toEqual({ ok: false, reason: "notTabbable" });

  tabsStore.setAccess(null);
  release();
  await settle();
});

test("rapid back presses, goToEntry and the router fallback when the mirror can't help", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/inventory");
  const release = bind(b);
  const A = activeId();
  for (const path of ["/manager/sales", "/manager/reports", "/manager/finances"]) {
    b.router.push(path);
    await settle();
  }
  tabsStore.actions.goBack();
  tabsStore.actions.goBack();
  await settle();
  await settle();
  expect(tabOf(A).history.index).toBe(1);
  expect(b.path).toBe("/manager/sales");

  tabsStore.actions.goToEntry(A, 3);
  await settle();
  expect(tabOf(A).history.index).toBe(3);
  expect(b.path).toBe("/manager/finances");
  expect(b.history.length).toBe(4);

  // A reload with a lost mirror: back still works through router.push + a traverse intent.
  __resetTabsStoreForTests();
  b.session.delete(MIRROR_STORAGE_KEY);
  const rebound = bind(b);
  expect(activeId()).toBe(A);
  tabsStore.actions.goBack();
  await settle();
  expect(tabOf(A).history.index).toBe(2);
  expect(b.path).toBe("/manager/reports");
  expect(b.history.length).toBe(5);
  expect(urlsOf(A)).toHaveLength(4);

  tabsStore.actions.reload();
  expect(state().mountNonce).toBe(1);
  tabsStore.actions.reload({ hard: true });
  expect(b.reloads).toBe(1);

  rebound();
  release();
  await settle();
});

test("persistence across reloads, deep links, launch restore and org switches", async () => {
  __resetTabsStoreForTests();
  const local = new Map<string, string>();
  const b = openBrowser("/manager/inventory", { local });
  bind(b);
  b.router.push("/manager/sales");
  await settle();
  const B = opened(tabsStore.actions.openTab("/manager/reports"));
  await settle();
  tabsStore.setPageTitle(currentEntry(tabOf(B)).key, "Weekly report");
  const ids = state().tabs.map((tab) => tab.id);

  // Reload: the browser keeps history (with stamps) and sessionStorage; module state is gone.
  __resetTabsStoreForTests();
  bind(b);
  expect(state().tabs.map((tab) => tab.id)).toEqual(ids);
  expect(activeId()).toBe(B);
  expect(currentEntry(tabOf(B)).title).toBe("Weekly report");

  // A new browser tab (empty sessionStorage) seeds from the localStorage snapshot; a deep link adds a tab.
  __resetTabsStoreForTests();
  const deep = openBrowser("/manager/finances", { local });
  bind(deep);
  expect(state().tabs.map((tab) => tab.id).slice(0, ids.length)).toEqual(ids);
  expect(state().tabs).toHaveLength(ids.length + 1);
  const F = activeId();
  expect(currentEntry(tabOf(F)).url).toBe("/manager/finances");

  // A deep link to an already open URL activates that tab instead.
  __resetTabsStoreForTests();
  const again = openBrowser("/manager/reports", { local });
  bind(again);
  expect(activeId()).toBe(B);

  // App launch ("/manager") restores the last active tab with a replace.
  __resetTabsStoreForTests();
  const launch = openBrowser("/manager", { local });
  bind(launch);
  expect(activeId()).toBe(B);
  await settle();
  expect(launch.path).toBe("/manager/reports");
  expect(launch.history.length).toBe(1);

  // Org switch: prepare, hard reload into the other org (no tabs there yet) …
  tabsStore.actions.prepareOrgSwitch("org-2");
  expect(launch.session.has(BOOT_INTENT_KEY)).toBe(true);
  __resetTabsStoreForTests();
  bind(launch, { userId: "user-1", organizationId: "org-2" });
  expect(state().tabs).toHaveLength(1);
  expect(currentEntry(state().tabs[0]).url).toBe("/manager/reports");
  expect(state().tabs[0].id).not.toBe(B);
  b.router.push("/manager/channel");
  await settle();
  // … and back: the reload lands on another URL, the intent restores org-1's active tab.
  tabsStore.actions.prepareOrgSwitch("org-1");
  __resetTabsStoreForTests();
  FakeHistory.prototype.replaceState.call(launch.history, { __NA: true }, "", "/manager/dashboard");
  bind(launch);
  expect(activeId()).toBe(B);
  await settle();
  expect(launch.path).toBe("/manager/reports");

  __resetTabsStoreForTests();
});

test("the home page is a launch URL: landings restore the session instead of piling up tabs", async () => {
  __resetTabsStoreForTests();
  const local = new Map<string, string>();
  const first = openBrowser("/manager/inventory", { local });
  bind(first);
  first.router.push("/manager/sales");
  await settle();
  const ids = state().tabs.map((tab) => tab.id);
  expect(ids).toHaveLength(1);

  // /choose and "Switch to manager mode" land on the home page (APP_MODE_HOME.admin): the session
  // is restored with a replace and no tab is appended — five switches later, still one tab.
  for (let i = 0; i < 5; i++) {
    __resetTabsStoreForTests();
    const relaunch = openBrowser(NEW_TAB_URL, { local });
    bind(relaunch);
    expect(state().tabs.map((tab) => tab.id)).toEqual(ids);
    await settle();
    expect(relaunch.path).toBe("/manager/sales");
    expect(relaunch.history.length).toBe(1);
  }

  // The restored tab goes home: the next landing leaves the URL alone (nothing to replace).
  __resetTabsStoreForTests();
  const browsing = openBrowser(NEW_TAB_URL, { local });
  bind(browsing);
  await settle();
  browsing.router.push(NEW_TAB_URL);
  await settle();
  __resetTabsStoreForTests();
  const onHome = openBrowser(NEW_TAB_URL, { local });
  bind(onHome);
  expect(state().tabs.map((tab) => tab.id)).toEqual(ids);
  await settle();
  expect(onHome.path).toBe(NEW_TAB_URL);
  expect(onHome.history.length).toBe(1);

  // A home URL carrying a query is a deep link, so a shared search still opens its own tab.
  __resetTabsStoreForTests();
  const search = openBrowser(`${NEW_TAB_URL}?q=inv`, { local });
  bind(search);
  expect(state().tabs).toHaveLength(ids.length + 1);
  expect(currentEntry(tabOf(activeId())).url).toBe(`${NEW_TAB_URL}?q=inv`);

  __resetTabsStoreForTests();
});

test('the "/manager" alias never becomes a tab URL, whatever the app mode is', async () => {
  __resetTabsStoreForTests();
  // Admin device: the alias is an app launch — the tab opens on the home page and the alias is
  // replaced, so no tab, entry or history record rests on "/manager".
  const admin = openBrowser("/manager");
  bind(admin);
  expect(currentEntry(tabOf(activeId())).url).toBe(NEW_TAB_URL);
  await settle();
  expect(admin.path).toBe(NEW_TAB_URL);
  expect(admin.history.length).toBe(1);

  // Store / personal device: app/manager/page.tsx owns the redirect to its own surface, so the
  // shell must not navigate — and its tab still must not rest on the alias.
  __resetTabsStoreForTests();
  const storeDevice = openBrowser("/manager", { local: new Map([["app_mode", "store"]]) });
  bind(storeDevice);
  expect(state().tabs.map((tab) => currentEntry(tab).url)).toEqual([NEW_TAB_URL]);
  await settle();
  expect(storeDevice.path).toBe("/manager");
  expect(storeDevice.history.length).toBe(1);

  __resetTabsStoreForTests();
});

test("unbinding restores history, and StrictMode re-binds keep one installation", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/inventory");
  const release = bind(b);
  expect(b.history.pushState).not.toBe(b.nextPush);
  expect(b.history.scrollRestoration).toBe("manual");
  release();
  expect(state().status).toBe("ready");
  await settle();
  expect(state().status).toBe("idle");
  expect(b.history.pushState).toBe(b.nextPush);
  expect(b.history.replaceState).toBe(b.nextReplace);
  expect(b.history.scrollRestoration).toBe("auto");

  window.history.pushState({ __NA: true }, "", "/manager/sales");
  expect(readStamp(b.history.state)).toBeNull();
  tabsStore.actions.goBack();
  expect(b.path).toBe("/manager/sales");

  const first = bind(b);
  first();
  const second = bind(b);
  await settle();
  expect(state().status).toBe("ready");
  expect(b.history.pushState).not.toBe(b.nextPush);
  second();
  await settle();
  expect(b.history.pushState).toBe(b.nextPush);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const tabKeysIn = (browser: FakeBrowser, userId = "user-1") =>
  [...browser.session.keys(), ...browser.local.keys()].filter((key) => key.startsWith(`merchiva_tabs:v1:${userId}:`) || key.startsWith(`merchiva_tabs_last:v1:${userId}:`));

test("sign-out never writes tab state back; purgeForSignOut removes it and blocks writes", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/inventory");
  b.local.set(AUTH_USER_STORAGE_KEY, JSON.stringify({ id: "user-1" }));
  const release = bind(b);
  b.router.push("/manager/docs/edit?id=abc");
  await settle();
  const docEntry = currentEntry(tabOf(activeId())).key;
  tabsStore.setPageTitle(docEntry, "Disciplinary notes");
  window.dispatchEvent(new Event("pagehide"));
  expect(b.local.get(localTabsKey(ORG_1)) ?? "").toContain("Disciplinary notes");

  // lib/auth/context.tsx signOut(): both storages cleared, then the provider unmounts.
  b.local.clear();
  b.session.clear();
  window.dispatchEvent(new Event("pagehide"));
  tabsStore.setPageTitle(docEntry, "Disciplinary notes (v2)");
  release();
  await sleep(300);
  expect(state().status).toBe("idle");
  expect(tabKeysIn(b)).toEqual([]);

  // The next sign-in persists normally; the explicit purge removes this user's state in every org.
  b.local.set(AUTH_USER_STORAGE_KEY, JSON.stringify({ id: "user-1" }));
  const again = bind(b);
  window.dispatchEvent(new Event("pagehide"));
  expect(b.session.has(sessionTabsKey(ORG_1))).toBe(true);
  expect(b.local.has(localTabsKey(ORG_1))).toBe(true);
  b.local.set(localTabsKey({ userId: "user-1", organizationId: "org-2" }), "{}");
  b.local.set(localTabsKey({ userId: "user-10", organizationId: "org-1" }), "{}");
  b.session.set(BOOT_INTENT_KEY, "{}");
  expect(b.session.has(MIRROR_STORAGE_KEY)).toBe(true);
  tabsStore.actions.navigateActive("/manager/reports");
  tabsStore.purgeForSignOut();
  expect(tabKeysIn(b)).toEqual([]);
  expect(tabKeysIn(b, "user-10")).toHaveLength(1);
  expect(b.session.has(BOOT_INTENT_KEY)).toBe(false);
  expect(b.session.has(MIRROR_STORAGE_KEY)).toBe(false);
  // Nothing writes it back: the navigation's debounced save, pagehide, a title change, teardown.
  await sleep(300);
  window.dispatchEvent(new Event("pagehide"));
  tabsStore.setPageTitle(currentEntry(tabOf(activeId())).key, "Payroll");
  again();
  await sleep(300);
  expect(tabKeysIn(b)).toEqual([]);
});

test("closing the rendered tab while another tab's switch is in flight lands on that tab", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/reports");
  const release = bind(b);
  const X = activeId();
  const A = opened(tabsStore.actions.openTab("/manager/inventory", { activate: true, position: "end" }));
  await settle();
  const C = opened(tabsStore.actions.openTab("/manager/sales", { activate: false, position: "end" }));
  expect(state().tabs.map((tab) => tab.id)).toEqual([X, A, C]);
  expect(activeId()).toBe(A);

  tabsStore.actions.activateTab(C);
  tabsStore.actions.closeTab(A, { source: "pointer" });
  expect(state().requestedTabId).toBe(C);
  await settle();
  expect(activeId()).toBe(C);
  expect(b.path).toBe("/manager/sales");

  // Leftmost rendered tab, switching to the last one.
  const D = opened(tabsStore.actions.openTab("/manager/finances", { activate: false, position: "end" }));
  tabsStore.actions.activateTab(X);
  await settle();
  expect(state().tabs.map((tab) => tab.id)).toEqual([X, C, D]);
  tabsStore.actions.activateTab(D);
  tabsStore.actions.closeTab(X, { source: "pointer" });
  await settle();
  expect(activeId()).toBe(D);
  expect(b.path).toBe("/manager/finances");
  expect(state().tabs.map((tab) => tab.id)).toEqual([C, D]);

  release();
  await settle();
});

test("a same-URL history write that discards a tab switch dispatches the switch again", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/settings");
  b.slowNavigations = true;
  const release = bind(b);
  const A = activeId();
  const B = opened(tabsStore.actions.openTab("/manager/inventory", { activate: false }));

  // DynamicUIElement's delayed `?dialogs=` cleanup rewrites the current URL while B is still loading.
  tabsStore.actions.activateTab(B);
  window.history.replaceState({ dialogs: 0 }, "", b.href);
  await sleep(80);
  expect(b.path).toBe("/manager/inventory");
  expect(activeId()).toBe(B);
  expect(state().requestedTabId).toBe(B);
  expect(state().pendingTabIds).toEqual([]);
  expect(urlsOf(A)).toEqual(["/manager/settings"]);
  expect(urlsOf(B)).toEqual(["/manager/inventory"]);

  // A page's same-URL router.replace supersedes the switch the same way.
  const C = opened(tabsStore.actions.openTab("/manager/sales", { activate: false }));
  tabsStore.actions.activateTab(C);
  b.router.replace(b.path);
  await sleep(120);
  expect(b.path).toBe("/manager/sales");
  expect(activeId()).toBe(C);
  expect(urlsOf(B)).toEqual(["/manager/inventory"]);
  expect(urlsOf(C)).toEqual(["/manager/sales"]);

  // A URL-less state write is invisible to Next and leaves the switch alone.
  tabsStore.actions.activateTab(A);
  window.history.replaceState({ scroll: 1 }, "");
  await sleep(80);
  expect(activeId()).toBe(A);
  expect(b.path).toBe("/manager/settings");

  release();
  await settle();
});

test("reload restores the scroll offset on the page that mounted together with the shell", async () => {
  __resetTabsStoreForTests();
  const b = openBrowser("/manager/inventory");
  const release = bind(b);
  b.router.push("/manager/sales");
  await settle();
  release();
  await settle();

  // The persisted snapshot carries the rendered entry's offset (as the pagehide flush writes it).
  const saved = JSON.parse(b.session.get(sessionTabsKey(ORG_1)) ?? "null") as { tabs: { e: { u: string; y?: number }[] }[] };
  const salesEntry = saved.tabs[0].e.find((entry) => entry.u === "/manager/sales");
  if (!salesEntry) throw new Error("sales entry not persisted");
  salesEntry.y = 1200;
  b.session.set(sessionTabsKey(ORG_1), JSON.stringify(saved));

  const root = {
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 800,
    isConnected: true,
    getClientRects: () => [1],
    matches: (selector: string) => selector === "[data-tab-scroll-root]",
  };
  contentHost = { isConnected: true, matches: () => false, querySelectorAll: () => [root] };
  const rebound = bind(b);
  expect(b.path).toBe("/manager/sales");
  await sleep(30);
  expect(root.scrollTop).toBe(0); // still loading: not tall enough yet
  root.scrollHeight = 3000;
  await sleep(30);
  expect(root.scrollTop).toBe(1200);

  contentHost = null;
  rebound();
  await settle();
});
