import { afterEach, describe, expect, test } from "bun:test";
import { IDLE_SNAPSHOT } from "@/lib/browser-shell/model";
import type { BrowserTab, TabsSnapshot } from "@/lib/browser-shell/types";
import { buildCurrentPage, currentPagePayload, pageContextFor } from "@/lib/merchiva/current-page";
import { WINDOW_PAGE_SCOPE, clearPageContext, setPageContext } from "@/lib/merchiva/page-context";

/*
 * Every Mr. Merchiva request carries the page its chat belongs to. Each browser tab has its own
 * chat, and a background tab's chat stays mounted, so the page is that tab's current entry — never
 * the window's location, which is whatever the ACTIVE tab shows. The single-tab phone layout has
 * one "__window__" chat, and its page is the tab on screen.
 */

const t = (key: string) => key;

function tab(id: string, urls: string[], index = urls.length - 1, titles: Record<number, string> = {}): BrowserTab {
  return {
    id,
    pinned: false,
    openerTabId: null,
    createdAt: 0,
    lastActiveAt: 0,
    history: {
      entries: urls.map((url, i) => ({ key: `e_${id.slice(2)}${i}`, url, at: i, ...(titles[i] ? { title: titles[i] } : {}) })),
      index,
    },
  };
}

const SCHEDULE = tab("t_schedule01", ["/manager/inventory", "/manager/personnel/schedule?week=2026-09-28&token=secret"]);
const DOC = tab("t_documents", ["/manager/docs/7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f"], 0, { 0: "Opening checklist" });
const BACK = tab("t_backwards", ["/manager/sales", "/manager/products"], 0);

function snapshot(overrides: Partial<TabsSnapshot> = {}): TabsSnapshot {
  return {
    ...IDLE_SNAPSHOT,
    status: "ready",
    scope: { userId: "u", organizationId: "o" },
    tabs: [SCHEDULE, DOC, BACK],
    activeTabId: DOC.id,
    requestedTabId: DOC.id,
    ...overrides,
  };
}

const ACTIVE_WINDOW = { pathname: "/manager/docs/7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f", search: "" };

describe("buildCurrentPage", () => {
  test("a background tab's chat gets its own tab's page, not the active tab's", () => {
    const page = buildCurrentPage({ scope: SCHEDULE.id, snapshot: snapshot(), location: ACTIVE_WINDOW, t, context: null });
    expect(page).toEqual({
      path: "/manager/personnel/schedule",
      title: "personnel.tabs.schedule",
      query: { week: "2026-09-28" },
    });
  });

  test("the tab's CURRENT entry, after going back", () => {
    const page = buildCurrentPage({ scope: BACK.id, snapshot: snapshot(), location: ACTIVE_WINDOW, t, context: null });
    expect(page?.path).toBe("/manager/sales");
  });

  test("the title is what the tab strip shows: the page's own title when it set one", () => {
    const page = buildCurrentPage({ scope: DOC.id, snapshot: snapshot(), location: null, t, context: null });
    expect(page).toEqual({ path: "/manager/docs/7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f", title: "Opening checklist" });
  });

  test("a gated tab is on its gate page", () => {
    const page = buildCurrentPage({
      scope: SCHEDULE.id,
      snapshot: snapshot({ gate: { tabId: SCHEDULE.id, url: "/manager/subscribe" } }),
      location: null,
      t,
      context: null,
    });
    expect(page?.path).toBe("/manager/subscribe");
  });

  test("a tab that is gone has no page", () => {
    expect(buildCurrentPage({ scope: "t_closed0000", snapshot: snapshot(), location: ACTIVE_WINDOW, t, context: null })).toBeNull();
  });

  test("the window chat (no browser shell) reads the window's location", () => {
    const page = buildCurrentPage({
      scope: WINDOW_PAGE_SCOPE,
      snapshot: IDLE_SNAPSHOT,
      location: { pathname: "/manager/inventory", search: "?filter=low&access_token=x" },
      t,
      context: null,
    });
    expect(page).toEqual({ path: "/manager/inventory", title: "nav.inventory", query: { filter: "low" } });
    expect(buildCurrentPage({ scope: WINDOW_PAGE_SCOPE, snapshot: IDLE_SNAPSHOT, location: null, t, context: null })).toBeNull();
  });

  test("the window chat on the phone layout gets the tab on screen, with its own title", () => {
    const location = { pathname: "/manager/inventory", search: "" };
    expect(buildCurrentPage({ scope: WINDOW_PAGE_SCOPE, snapshot: snapshot(), location, t, context: null })).toEqual({
      path: "/manager/docs/7d9f3c1e-2b4a-4c8d-9e6f-0a1b2c3d4e5f",
      title: "Opening checklist",
    });
    const requested = snapshot({ activeTabId: DOC.id, requestedTabId: SCHEDULE.id });
    expect(buildCurrentPage({ scope: WINDOW_PAGE_SCOPE, snapshot: requested, location, t, context: null })?.path).toBe(
      "/manager/personnel/schedule",
    );
    const gated = snapshot({ gate: { tabId: DOC.id, url: "/manager/subscribe" } });
    expect(buildCurrentPage({ scope: WINDOW_PAGE_SCOPE, snapshot: gated, location, t, context: null })?.path).toBe(
      "/manager/subscribe",
    );
  });

  test("a window chat whose shown tab is not in the store reads the window", () => {
    const page = buildCurrentPage({
      scope: WINDOW_PAGE_SCOPE,
      snapshot: snapshot({ activeTabId: "t_closed0000", requestedTabId: null }),
      location: { pathname: "/manager/inventory", search: "" },
      t,
      context: null,
    });
    expect(page?.path).toBe("/manager/inventory");
  });

  test("the page's own context rides along", () => {
    const page = buildCurrentPage({
      scope: SCHEDULE.id,
      snapshot: snapshot(),
      location: null,
      t,
      context: { summary: "Week of Sep 28", params: { weekStart: "2026-09-28" } },
    });
    expect(page?.context).toEqual({ summary: "Week of Sep 28", params: { weekStart: "2026-09-28" } });
  });
});

describe("currentPagePayload", () => {
  const realWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    clearPageContext(WINDOW_PAGE_SCOPE);
    clearPageContext(SCHEDULE.id);
    (globalThis as { window?: unknown }).window = realWindow;
  });

  test("the window chat reads window.location and the context published under __window__", () => {
    (globalThis as { window?: unknown }).window = { location: { pathname: "/manager/suppliers", search: "?q=milk" } };
    setPageContext(WINDOW_PAGE_SCOPE, { summary: "Supplier list", params: { count: 4 } });
    setPageContext(SCHEDULE.id, { summary: "Another tab's page" });
    expect(currentPagePayload(undefined, t)).toEqual({
      path: "/manager/suppliers",
      title: "nav.suppliers",
      query: { q: "milk" },
      context: { summary: "Supplier list", params: { count: 4 } },
    });
  });

  test("a tab chat reads the tab store, never the window", () => {
    (globalThis as { window?: unknown }).window = { location: { pathname: "/manager/suppliers", search: "" } };
    // No browser shell is bound in this process, so the store holds no tabs: the tab's page is unknown.
    expect(currentPagePayload(SCHEDULE.id, t)).toBeNull();
  });
});

describe("pageContextFor", () => {
  afterEach(() => {
    for (const scope of [WINDOW_PAGE_SCOPE, SCHEDULE.id, DOC.id]) clearPageContext(scope);
  });

  test("the window chat on the phone layout gets the context published under the tab on screen", () => {
    setPageContext(DOC.id, { summary: "Doc: Opening checklist", params: { docId: "7d9f" } });
    setPageContext(SCHEDULE.id, { summary: "A hidden tab's page" });
    expect(pageContextFor(WINDOW_PAGE_SCOPE, snapshot())).toEqual({ summary: "Doc: Opening checklist", params: { docId: "7d9f" } });
  });

  test("a context published under __window__ wins, as outside the browser shell", () => {
    setPageContext(WINDOW_PAGE_SCOPE, { summary: "Supplier list" });
    setPageContext(DOC.id, { summary: "Doc: Opening checklist" });
    expect(pageContextFor(WINDOW_PAGE_SCOPE, snapshot())).toEqual({ summary: "Supplier list" });
    expect(pageContextFor(WINDOW_PAGE_SCOPE, IDLE_SNAPSHOT)).toEqual({ summary: "Supplier list" });
  });

  test("a tab chat only ever gets its own tab's context", () => {
    setPageContext(DOC.id, { summary: "Doc: Opening checklist" });
    expect(pageContextFor(SCHEDULE.id, snapshot())).toBeNull();
    expect(pageContextFor(DOC.id, snapshot())).toEqual({ summary: "Doc: Opening checklist" });
  });

  test("no tab store bound: the window chat has only its own context", () => {
    setPageContext(DOC.id, { summary: "Doc: Opening checklist" });
    expect(pageContextFor(WINDOW_PAGE_SCOPE, IDLE_SNAPSHOT)).toBeNull();
  });
});
