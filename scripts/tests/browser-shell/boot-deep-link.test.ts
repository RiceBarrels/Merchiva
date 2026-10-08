// The deep-link step of the tab store's boot (lib/browser-shell/boot-deep-link.ts): where a cold
// load on a bookmark, a login ?next= or a notification lands in the restored tabs — a tab of its
// own on the desktop, the tab on screen on the single-tab phone layout, which could never show,
// close or switch to another tab.

import { describe, expect, test } from "bun:test";
import { placeDeepLink } from "@/lib/browser-shell/boot-deep-link";
import { IDLE_SNAPSHOT, type IdGen } from "@/lib/browser-shell/model";
import { MAX_TABS, currentEntry, type BrowserTab, type TabsSnapshot } from "@/lib/browser-shell/types";

const NOW = 5_000;

function seqIds(): IdGen {
  let n = 0;
  const next = (prefix: string) => `${prefix}_${(++n).toString(36).padStart(10, "0")}`;
  return { tab: () => next("t"), entry: () => next("e"), closed: () => next("c"), stamp: () => next("k") };
}

function tabWith(ids: IdGen, urls: readonly string[], index = urls.length - 1): BrowserTab {
  return {
    id: ids.tab(),
    pinned: false,
    openerTabId: null,
    createdAt: 1,
    lastActiveAt: 1,
    history: { entries: urls.map((url) => ({ key: ids.entry(), url, at: 1 })), index },
  };
}

/** Tabs as bootState restores them: ready, the first tab active unless `active` says otherwise. */
function restored(tabs: BrowserTab[], active: BrowserTab = tabs[0]): TabsSnapshot {
  return {
    ...IDLE_SNAPSHOT,
    status: "ready",
    scope: { userId: "u", organizationId: "o" },
    tabs,
    activeTabId: active.id,
    requestedTabId: active.id,
  };
}

const tabIds = (state: TabsSnapshot) => state.tabs.map((tab) => tab.id);
const urlsOf = (state: TabsSnapshot, id: string) =>
  state.tabs.find((tab) => tab.id === id)?.history.entries.map((entry) => entry.url) ?? [];

describe("desktop: a deep link gets a tab of its own", () => {
  test("a URL no tab shows is appended as a new active tab, the others untouched", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/inventory", "/manager/sales"]);
    const b = tabWith(ids, ["/manager/reports"]);
    const st = restored([a, b]);
    const out = placeDeepLink(st, a.id, "/manager/finances", NOW, ids, false);
    expect(out.state.tabs).toHaveLength(3);
    expect(tabIds(out.state).slice(0, 2)).toEqual([a.id, b.id]);
    const added = out.state.tabs[2];
    expect(urlsOf(out.state, added.id)).toEqual(["/manager/finances"]);
    expect(out.state.activeTabId).toBe(added.id);
    expect(out.state.requestedTabId).toBe(added.id);
    expect(out.protectEntryKey).toBe(currentEntry(added).key);
    expect(urlsOf(out.state, a.id)).toEqual(["/manager/inventory", "/manager/sales"]);
  });

  test("at the tab limit the active tab's entry is replaced instead", () => {
    const ids = seqIds();
    const tabs = Array.from({ length: MAX_TABS }, (_, i) => tabWith(ids, [`/manager/inventory?page=${i}`]));
    const st = restored(tabs, tabs[3]);
    const out = placeDeepLink(st, tabs[3].id, "/manager/finances", NOW, ids, false);
    expect(out.state.tabs).toHaveLength(MAX_TABS);
    expect(out.state.activeTabId).toBe(tabs[3].id);
    expect(urlsOf(out.state, tabs[3].id)).toEqual(["/manager/finances"]);
  });
});

describe("phone (single-tab): a deep link never adds a tab", () => {
  test("a URL no tab shows is pushed onto the active tab, so Back returns to the page before", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/inventory", "/manager/sales"]);
    const hidden = tabWith(ids, ["/manager/reports"]);
    const st = restored([a, hidden]);
    const before = currentEntry(a);
    const out = placeDeepLink(st, a.id, "/manager/finances", NOW, ids, true);
    expect(tabIds(out.state)).toEqual([a.id, hidden.id]);
    expect(out.state.activeTabId).toBe(a.id);
    expect(out.state.requestedTabId).toBe(a.id);
    const tab = out.state.tabs[0];
    expect(urlsOf(out.state, a.id)).toEqual(["/manager/inventory", "/manager/sales", "/manager/finances"]);
    expect(tab.history.index).toBe(2);
    // The entry the browser's previous history entry is stamped with is still there to go back to.
    expect(tab.history.entries[1].key).toBe(before.key);
    expect(out.protectEntryKey).toBe(currentEntry(tab).key);
    expect(out.protectEntryKey).not.toBe(before.key);
  });

  test("the push drops the active tab's forward entries, like any navigation", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/inventory", "/manager/sales", "/manager/tasks"], 0);
    const out = placeDeepLink(restored([a]), a.id, "/manager/finances", NOW, ids, true);
    expect(urlsOf(out.state, a.id)).toEqual(["/manager/inventory", "/manager/finances"]);
    expect(out.state.tabs[0].history.index).toBe(1);
  });

  test("at the tab limit it is pushed as well", () => {
    const ids = seqIds();
    const tabs = Array.from({ length: MAX_TABS }, (_, i) => tabWith(ids, [`/manager/inventory?page=${i}`]));
    const out = placeDeepLink(restored(tabs), tabs[0].id, "/manager/finances", NOW, ids, true);
    expect(out.state.tabs).toHaveLength(MAX_TABS);
    expect(urlsOf(out.state, tabs[0].id)).toEqual(["/manager/inventory?page=0", "/manager/finances"]);
  });
});

describe("a tab that already shows the URL", () => {
  test("desktop: that tab is reused and becomes active, with no new tab or entry", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/inventory"]);
    const b = tabWith(ids, ["/manager/sales", "/manager/reports?b=2&a=1"]);
    const st = restored([a, b]);
    // Same page, its params in another order: the same entry, its URL as the browser shows it.
    const out = placeDeepLink(st, a.id, "/manager/reports?a=1&b=2", NOW, ids, false);
    expect(tabIds(out.state)).toEqual([a.id, b.id]);
    expect(out.state.activeTabId).toBe(b.id);
    expect(urlsOf(out.state, b.id)).toEqual(["/manager/sales", "/manager/reports?a=1&b=2"]);
    expect(out.protectEntryKey).toBe(currentEntry(b).key);
    expect(urlsOf(out.state, a.id)).toEqual(["/manager/inventory"]);
  });

  test("phone: the tab on screen is reused in place", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/sales", "/manager/reports?b=2&a=1"]);
    const hidden = tabWith(ids, ["/manager/inventory"]);
    const out = placeDeepLink(restored([a, hidden]), a.id, "/manager/reports?a=1&b=2", NOW, ids, true);
    expect(tabIds(out.state)).toEqual([a.id, hidden.id]);
    expect(out.state.activeTabId).toBe(a.id);
    expect(urlsOf(out.state, a.id)).toEqual(["/manager/sales", "/manager/reports?a=1&b=2"]);
    expect(out.protectEntryKey).toBe(currentEntry(a).key);
  });

  test("phone: a hidden tab that shows it is never revealed — the URL is pushed onto the tab on screen", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/inventory"]);
    const hidden = tabWith(ids, ["/manager/sales", "/manager/docs", "/manager/reports"]);
    const out = placeDeepLink(restored([a, hidden]), a.id, "/manager/reports", NOW, ids, true);
    expect(tabIds(out.state)).toEqual([a.id, hidden.id]);
    expect(out.state.activeTabId).toBe(a.id);
    expect(out.state.requestedTabId).toBe(a.id);
    expect(urlsOf(out.state, a.id)).toEqual(["/manager/inventory", "/manager/reports"]);
    expect(urlsOf(out.state, hidden.id)).toEqual(["/manager/sales", "/manager/docs", "/manager/reports"]);
  });
});
