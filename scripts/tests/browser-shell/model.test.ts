import { describe, expect, test } from "bun:test";
import {
  IDLE_SNAPSHOT,
  applyAccess,
  cleanTitle,
  commitActivation,
  createTab,
  duplicate,
  findByEntryKey,
  findByUrlKey,
  insertTab,
  patchEntryUrl,
  pickSuccessor,
  pushEntry,
  removeTab,
  reorder,
  replaceEntry,
  restoreClosed,
  setEntryScroll,
  setEntryTitle,
  setIndex,
  setPinned,
  urlKeyOf,
  type IdGen,
} from "@/lib/browser-shell/model";
import {
  MAX_CLOSED,
  MAX_ENTRIES_PER_TAB,
  NEW_TAB_URL,
  currentEntry,
  type BrowserTab,
  type RouteAccess,
  type TabsSnapshot,
} from "@/lib/browser-shell/types";

function seqIds(): IdGen {
  let n = 0;
  const next = (prefix: string) => `${prefix}_${(++n).toString(36).padStart(10, "0")}`;
  return { tab: () => next("t"), entry: () => next("e"), closed: () => next("c"), stamp: () => next("k") };
}

function tabWith(
  ids: IdGen,
  urls: readonly string[],
  opts: { index?: number; pinned?: boolean; opener?: string | null; lastActiveAt?: number } = {},
): BrowserTab {
  return {
    id: ids.tab(),
    pinned: opts.pinned === true,
    openerTabId: opts.opener ?? null,
    createdAt: 1,
    lastActiveAt: opts.lastActiveAt ?? 1,
    history: {
      entries: urls.map((url) => ({ key: ids.entry(), url, at: 1 })),
      index: opts.index ?? urls.length - 1,
    },
  };
}

function ready(tabs: BrowserTab[], activeTabId: string | null = tabs[0]?.id ?? null): TabsSnapshot {
  return {
    ...IDLE_SNAPSHOT,
    status: "ready",
    scope: { userId: "u", organizationId: "o" },
    tabs,
    activeTabId,
    requestedTabId: activeTabId,
  };
}

const order = (state: TabsSnapshot) => state.tabs.map((tab) => tab.id);

describe("tabs and entries", () => {
  test("createTab starts with one entry at index 0", () => {
    const ids = seqIds();
    const tab = createTab("/manager/inventory", 5, ids, { openerTabId: "t_x" });
    expect(tab.history.entries).toHaveLength(1);
    expect(tab.history.index).toBe(0);
    expect(currentEntry(tab).url).toBe("/manager/inventory");
    expect(tab.openerTabId).toBe("t_x");
    expect(tab.pinned).toBe(false);
  });

  test("pushEntry truncates forward history", () => {
    const ids = seqIds();
    const tab = tabWith(ids, ["/manager/a", "/manager/b", "/manager/c"], { index: 0 });
    const { state, entry } = pushEntry(ready([tab]), tab.id, "/manager/d", 2, ids);
    const next = state.tabs[0];
    expect(next.history.entries.map((e) => e.url)).toEqual(["/manager/a", "/manager/d"]);
    expect(next.history.index).toBe(1);
    expect(entry?.url).toBe("/manager/d");
  });

  test("pushEntry caps the history, dropping the oldest entries", () => {
    const ids = seqIds();
    const tab = tabWith(ids, ["/manager/p0"]);
    let state = ready([tab]);
    for (let i = 1; i < 60; i++) state = pushEntry(state, tab.id, `/manager/p${i}`, i, ids).state;
    const next = state.tabs[0];
    expect(next.history.entries).toHaveLength(MAX_ENTRIES_PER_TAB);
    expect(next.history.index).toBe(MAX_ENTRIES_PER_TAB - 1);
    expect(next.history.entries[0].url).toBe("/manager/p10");
  });

  test("replaceEntry keeps the key for the same UrlKey and re-keys a different URL", () => {
    const ids = seqIds();
    const tab = tabWith(ids, ["/manager/x?a=1&b=2"]);
    const original = currentEntry(tab);
    const withTitle = setEntryTitle(ready([tab]), original.key, "Kept");
    const drifted = replaceEntry(withTitle, tab.id, "/manager/x?b=2&a=1", 2, ids);
    expect(drifted.entry?.key).toBe(original.key);
    expect(drifted.entry?.url).toBe("/manager/x?b=2&a=1");
    expect(drifted.entry?.title).toBe("Kept");
    const changed = replaceEntry(drifted.state, tab.id, "/manager/y", 3, ids);
    expect(changed.entry?.key).not.toBe(original.key);
    expect(changed.entry?.title).toBeUndefined();
    expect(changed.state.tabs[0].history.entries).toHaveLength(1);
  });

  test("patchEntryUrl, setIndex, titles and scroll", () => {
    const ids = seqIds();
    const tab = tabWith(ids, ["/manager/a", "/manager/b"]);
    const [a, b] = tab.history.entries;
    let state = patchEntryUrl(ready([tab]), a.key, "/manager/a?x=1");
    expect(findByEntryKey(state, a.key)?.tab.history.entries[0].url).toBe("/manager/a?x=1");
    state = setIndex(state, tab.id, 9);
    expect(state.tabs[0].history.index).toBe(1);
    state = setEntryTitle(state, b.key, `  ${"x".repeat(250)}  `);
    expect(state.tabs[0].history.entries[1].title).toHaveLength(200);
    expect(setEntryTitle(state, b.key, null).tabs[0].history.entries[1].title).toBeUndefined();
    state = setEntryScroll(state, b.key, 420.6);
    expect(state.tabs[0].history.entries[1].scrollY).toBe(421);
    expect(setEntryScroll(state, b.key, 0).tabs[0].history.entries[1].scrollY).toBeUndefined();
    expect(setEntryScroll(state, b.key, 421)).toBe(state);
    expect(cleanTitle(" a \n b ")).toBe("a b");
  });

  test("commitActivation sets active + requested and lifts the gate", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/a"]);
    const b = tabWith(ids, ["/manager/b"]);
    const gated: TabsSnapshot = { ...ready([a, b], a.id), requestedTabId: b.id, gate: { tabId: a.id, url: "/manager/subscribe" } };
    const next = commitActivation(gated, b.id, 99);
    expect(next.activeTabId).toBe(b.id);
    expect(next.requestedTabId).toBe(b.id);
    expect(next.gate).toBeNull();
    expect(next.tabs[1].lastActiveAt).toBe(99);
  });

  test("findByUrlKey matches current entries and never the New Tab page", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/x?b=1&a=2", "/manager/y"], { index: 0 });
    const n = tabWith(ids, [NEW_TAB_URL]);
    const state = ready([a, n]);
    expect(findByUrlKey(state, urlKeyOf("/manager/x?a=2&b=1"))?.id).toBe(a.id);
    expect(findByUrlKey(state, urlKeyOf("/manager/y"))).toBeNull();
    expect(findByUrlKey(state, urlKeyOf(NEW_TAB_URL))).toBeNull();
  });
});

describe("insertTab positions", () => {
  test("end, afterActive, afterOpenerGroup and numeric positions", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/a"]);
    const child = tabWith(ids, ["/manager/c"], { opener: a.id });
    const b = tabWith(ids, ["/manager/b"]);
    const state = ready([a, child, b], a.id);

    const end = createTab("/manager/e", 1, ids);
    expect(order(insertTab(state, end, "end", null))).toEqual([a.id, child.id, b.id, end.id]);

    const afterActive = createTab("/manager/f", 1, ids);
    expect(order(insertTab(state, afterActive, "afterActive", a.id))).toEqual([a.id, afterActive.id, child.id, b.id]);

    const grouped = createTab("/manager/g", 1, ids, { openerTabId: a.id });
    expect(order(insertTab(state, grouped, "afterOpenerGroup", a.id))).toEqual([a.id, child.id, grouped.id, b.id]);

    const at = createTab("/manager/h", 1, ids);
    expect(order(insertTab(state, at, 1, null))).toEqual([a.id, at.id, child.id, b.id]);
    expect(order(insertTab(state, createTab("/manager/i", 1, ids), -5, null))[0]).not.toBe(a.id);
  });

  test("unpinned tabs never land inside the pinned block and pinned tabs stay in it", () => {
    const ids = seqIds();
    const p = tabWith(ids, ["/manager/p"], { pinned: true });
    const u = tabWith(ids, ["/manager/u"]);
    const state = ready([p, u], p.id);
    const unpinned = createTab("/manager/x", 1, ids);
    expect(order(insertTab(state, unpinned, 0, null))).toEqual([p.id, unpinned.id, u.id]);
    const pinned = createTab("/manager/y", 1, ids, { pinned: true });
    expect(order(insertTab(state, pinned, "end", null))).toEqual([p.id, pinned.id, u.id]);
  });
});

describe("closing", () => {
  test("successor: opener when the tab never navigated, else right, else left", () => {
    const ids = seqIds();
    const opener = tabWith(ids, ["/manager/o"]);
    const middle = tabWith(ids, ["/manager/m"]);
    const fresh = tabWith(ids, ["/manager/f"], { opener: opener.id });
    const last = tabWith(ids, ["/manager/l"]);
    const state = ready([opener, middle, fresh, last], fresh.id);
    expect(pickSuccessor(state, fresh.id)).toBe(opener.id);

    const navigated = tabWith(ids, ["/manager/f", "/manager/g"], { opener: opener.id });
    const state2 = ready([opener, middle, navigated, last], navigated.id);
    expect(pickSuccessor(state2, navigated.id)).toBe(last.id);
    expect(pickSuccessor(state2, last.id)).toBe(navigated.id);
    expect(pickSuccessor(ready([opener]), opener.id)).toBeNull();
  });

  test("removeTab records the closed tab, clears openers and detaches the active tab", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/a"]);
    const b = tabWith(ids, ["/manager/b"], { opener: a.id });
    const state = { ...ready([a, b], a.id), pendingTabIds: [a.id] };
    const { state: next, successorId } = removeTab(state, a.id, 7, ids, { recordClosed: true });
    expect(successorId).toBe(b.id);
    expect(order(next)).toEqual([b.id]);
    expect(next.tabs[0].openerTabId).toBeNull();
    expect(next.activeTabId).toBeNull();
    expect(next.requestedTabId).toBeNull();
    expect(next.pendingTabIds).toEqual([]);
    expect(next.closed).toHaveLength(1);
    expect(next.closed[0].tab.id).toBe(a.id);
    expect(next.closed[0].index).toBe(0);
    expect(next.closed[0].closedAt).toBe(7);
    expect(removeTab(state, a.id, 7, ids, { recordClosed: false }).state.closed).toHaveLength(0);
  });

  test("the closed stack is capped, newest first", () => {
    const ids = seqIds();
    let state = ready([tabWith(ids, ["/manager/keep"])]);
    for (let i = 0; i < MAX_CLOSED + 5; i++) {
      const tab = createTab(`/manager/p${i}`, i, ids);
      state = insertTab(state, tab, "end", null);
      state = removeTab(state, tab.id, i, ids, { recordClosed: true }).state;
    }
    expect(state.closed).toHaveLength(MAX_CLOSED);
    expect(currentEntry(state.closed[0].tab).url).toBe(`/manager/p${MAX_CLOSED + 4}`);
  });

  test("restoreClosed keeps the tab id and entry keys and clamps the index", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/a"]);
    const b = tabWith(ids, ["/manager/b1", "/manager/b2"], { index: 0, opener: a.id });
    const c = tabWith(ids, ["/manager/c"]);
    let state = ready([a, b, c], a.id);
    state = removeTab(state, b.id, 1, ids, { recordClosed: true }).state;
    state = removeTab(state, a.id, 2, ids, { recordClosed: true }).state;
    const firstClosed = state.closed[1];
    const restored = restoreClosed(state, firstClosed.id, ids);
    expect(restored?.tabId).toBe(b.id);
    const tab = restored?.state.tabs.find((t) => t.id === b.id);
    expect(tab?.history.entries.map((e) => e.key)).toEqual(b.history.entries.map((e) => e.key));
    expect(tab?.history.index).toBe(0);
    expect(tab?.openerTabId).toBeNull();
    expect(restored?.state.closed.map((r) => r.id)).toEqual([state.closed[0].id]);
    expect(order(restored?.state ?? state)).toEqual([c.id, b.id]);
    expect(restoreClosed(ready([c]), undefined, ids)).toBeNull();
  });
});

describe("strip order", () => {
  test("reorder clamps inside the pinned / unpinned partition", () => {
    const ids = seqIds();
    const p1 = tabWith(ids, ["/manager/p1"], { pinned: true });
    const p2 = tabWith(ids, ["/manager/p2"], { pinned: true });
    const u1 = tabWith(ids, ["/manager/u1"]);
    const u2 = tabWith(ids, ["/manager/u2"]);
    const state = ready([p1, p2, u1, u2]);
    expect(order(reorder(state, u2.id, 0))).toEqual([p1.id, p2.id, u2.id, u1.id]);
    expect(order(reorder(state, p1.id, 10))).toEqual([p2.id, p1.id, u1.id, u2.id]);
    expect(order(reorder(state, u1.id, 3))).toEqual([p1.id, p2.id, u2.id, u1.id]);
    expect(reorder(state, u1.id, 2)).toBe(state);
  });

  test("pinning moves to the end of the pinned block, unpinning to the start of the rest", () => {
    const ids = seqIds();
    const p = tabWith(ids, ["/manager/p"], { pinned: true });
    const a = tabWith(ids, ["/manager/a"]);
    const b = tabWith(ids, ["/manager/b"]);
    const pinned = setPinned(ready([p, a, b]), b.id, true);
    expect(order(pinned)).toEqual([p.id, b.id, a.id]);
    expect(pinned.tabs[1].pinned).toBe(true);
    const unpinned = setPinned(pinned, p.id, false);
    expect(order(unpinned)).toEqual([b.id, p.id, a.id]);
    expect(setPinned(unpinned, a.id, false)).toBe(unpinned);
  });

  test("duplicate copies history with fresh keys right after the source", () => {
    const ids = seqIds();
    const a = tabWith(ids, ["/manager/a1", "/manager/a2"], { index: 0 });
    const b = tabWith(ids, ["/manager/b"]);
    const result = duplicate(ready([a, b]), a.id, 5, ids);
    expect(result).not.toBeNull();
    const copy = result?.state.tabs[1];
    expect(order(result?.state ?? ready([]))).toEqual([a.id, result?.tabId ?? "", b.id]);
    expect(copy?.history.entries.map((e) => e.url)).toEqual(["/manager/a1", "/manager/a2"]);
    expect(copy?.history.index).toBe(0);
    expect(copy?.openerTabId).toBe(a.id);
    const sourceKeys = new Set(a.history.entries.map((e) => e.key));
    expect(copy?.history.entries.some((e) => sourceKeys.has(e.key))).toBe(false);
  });
});

describe("applyAccess", () => {
  const accessOf = (table: Record<string, RouteAccess>) => (url: string): RouteAccess => table[url] ?? "allowed";

  test("removes forbidden and unknown entries, keeps featureOff and the active current entry", () => {
    const ids = seqIds();
    const active = tabWith(ids, ["/manager/team", "/manager/sales"], { index: 1 });
    const other = tabWith(ids, ["/manager/inventory", "/manager/team", "/manager/pos", "/manager/gone"], { index: 2 });
    const activeForbidden = tabWith(ids, ["/manager/team"]);
    const state = ready([activeForbidden, active, other], activeForbidden.id);
    const next = applyAccess(
      state,
      accessOf({ "/manager/team": "forbidden", "/manager/pos": "featureOff", "/manager/gone": "unknownRoute" }),
    );
    expect(next.tabs[0].history.entries.map((e) => e.url)).toEqual(["/manager/team"]);
    expect(next.tabs[1].history.entries.map((e) => e.url)).toEqual(["/manager/sales"]);
    expect(next.tabs[1].history.index).toBe(0);
    expect(next.tabs[2].history.entries.map((e) => e.url)).toEqual(["/manager/inventory", "/manager/pos"]);
    expect(next.tabs[2].history.index).toBe(1);
  });

  test("the index moves to the closest surviving entry at or before it", () => {
    const ids = seqIds();
    const active = tabWith(ids, ["/manager/a"]);
    const tab = tabWith(ids, ["/manager/ok", "/manager/bad", "/manager/bad2", "/manager/ok2"], { index: 2 });
    const next = applyAccess(ready([active, tab], active.id), accessOf({ "/manager/bad": "forbidden", "/manager/bad2": "forbidden" }));
    expect(next.tabs[1].history.index).toBe(0);
    const head = tabWith(ids, ["/manager/bad", "/manager/ok"], { index: 0 });
    const moved = applyAccess(ready([active, head], active.id), accessOf({ "/manager/bad": "forbidden" }));
    expect(moved.tabs[1].history.index).toBe(0);
    expect(moved.tabs[1].history.entries[0].url).toBe("/manager/ok");
  });

  test("tabs without entries disappear without a closed record; closed records are filtered", () => {
    const ids = seqIds();
    const active = tabWith(ids, ["/manager/a"]);
    const doomed = tabWith(ids, ["/manager/bad"]);
    const opened = tabWith(ids, ["/manager/child"], { opener: doomed.id });
    let state = ready([active, doomed, opened], active.id);
    const closedTab = tabWith(ids, ["/manager/bad"]);
    state = { ...state, closed: [{ id: ids.closed(), tab: closedTab, index: 0, closedAt: 1 }] };
    const next = applyAccess(state, accessOf({ "/manager/bad": "forbidden" }));
    expect(order(next)).toEqual([active.id, opened.id]);
    expect(next.tabs[1].openerTabId).toBeNull();
    expect(next.closed).toHaveLength(0);
  });

  test("protectEntryKey keeps the boot entry and unchanged input returns the same object", () => {
    const ids = seqIds();
    const active = tabWith(ids, ["/manager/a"]);
    const boot = tabWith(ids, ["/manager/bad"]);
    const state = ready([active, boot], active.id);
    const kept = applyAccess(state, accessOf({ "/manager/bad": "forbidden" }), { protectEntryKey: currentEntry(boot).key });
    expect(kept).toBe(state);
    expect(applyAccess(state, accessOf({}))).toBe(state);
  });
});
