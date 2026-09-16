import { afterEach, describe, expect, test } from "bun:test";
import { MIRROR_STORAGE_KEY } from "@/lib/browser-shell/history-bridge";
import { IDLE_SNAPSHOT, type IdGen } from "@/lib/browser-shell/model";
import {
  AUTH_USER_STORAGE_KEY,
  BOOT_INTENT_KEY,
  BOOT_INTENT_TTL_MS,
  consumeBootIntent,
  hasAuthUserRecord,
  loadPersisted,
  localTabsKey,
  purgeTabStateForUser,
  sanitize,
  savePersisted,
  sessionTabsKey,
  toPersisted,
  writeBootIntent,
  type PersistedTabV1,
} from "@/lib/browser-shell/persistence";
import { HOME_URL, MAX_CLOSED, MAX_ENTRIES_PER_TAB, MAX_TABS, currentEntry, type BrowserTab, type TabsSnapshot } from "@/lib/browser-shell/types";

function seqIds(): IdGen {
  let n = 0;
  const next = (prefix: string) => `${prefix}_${(++n).toString(36).padStart(10, "z")}`;
  return { tab: () => next("t"), entry: () => next("e"), closed: () => next("c"), stamp: () => next("k") };
}

const tabId = (i: number) => `t_${i.toString(36).padStart(10, "0")}`;
const entryKey = (i: number) => `e_${i.toString(36).padStart(10, "0")}`;

function rawTab(id: number, urls: readonly string[], extra: Partial<PersistedTabV1> = {}): PersistedTabV1 {
  return {
    id: tabId(id),
    c: 1,
    la: id,
    i: urls.length - 1,
    e: urls.map((u, j) => ({ k: entryKey(id * 100 + j), u, at: 1 })),
    ...extra,
  };
}

function readyState(tabs: BrowserTab[], activeTabId: string): TabsSnapshot {
  return { ...IDLE_SNAPSHOT, status: "ready", scope: { userId: "u", organizationId: "o" }, tabs, activeTabId, requestedTabId: activeTabId };
}

describe("toPersisted", () => {
  test("drops the gate, persist:false entries and volatile params; caps titles; merges tracked scroll", () => {
    const tabs: BrowserTab[] = [
      {
        id: tabId(1),
        pinned: true,
        openerTabId: null,
        createdAt: 1,
        lastActiveAt: 2,
        history: {
          entries: [
            { key: entryKey(1), url: "/manager/settings?tab=pos&connected=square", at: 1, title: "x".repeat(300) },
            { key: entryKey(2), url: "/manager/subscribe", at: 2 },
          ],
          index: 1,
        },
      },
      {
        id: tabId(2),
        pinned: false,
        openerTabId: tabId(1),
        createdAt: 1,
        lastActiveAt: 1,
        history: { entries: [{ key: entryKey(3), url: "/manager/subscribe", at: 1 }], index: 0 },
      },
    ];
    const state: TabsSnapshot = { ...readyState(tabs, tabId(2)), gate: { tabId: tabId(1), url: "/manager/subscribe" } };
    const out = toPersisted(state, 50, { scrollOf: (key) => (key === entryKey(1) ? 333 : undefined) });
    expect(out.v).toBe(1);
    expect(out.savedAt).toBe(50);
    expect(out.tabs).toHaveLength(1);
    expect(out.tabs[0].p).toBe(1);
    expect(out.tabs[0].i).toBe(0);
    expect(out.tabs[0].e).toEqual([{ k: entryKey(1), u: "/manager/settings?tab=pos", at: 1, t: "x".repeat(200), y: 333 }]);
    expect(out.active).toBe(tabId(1));
    expect("gate" in out).toBe(false);
  });

  test("the quota fallback shape has no closed stack and no titles", () => {
    const tab: BrowserTab = {
      id: tabId(1), pinned: false, openerTabId: null, createdAt: 1, lastActiveAt: 1,
      history: { entries: [{ key: entryKey(1), url: "/manager/inventory", at: 1, title: "Stock" }], index: 0 },
    };
    const state: TabsSnapshot = { ...readyState([tab], tab.id), closed: [{ id: "c_0000000001", tab, index: 0, closedAt: 1 }] };
    const slim = toPersisted(state, 1, { withClosed: false, withTitles: false });
    expect(slim.closed).toEqual([]);
    expect(slim.tabs[0].e[0].t).toBeUndefined();
  });
});

describe("sanitize", () => {
  const opts = () => ({ ids: seqIds() });

  test("round-trips a persisted state", () => {
    const tabs: BrowserTab[] = [
      {
        id: tabId(1), pinned: true, openerTabId: null, createdAt: 3, lastActiveAt: 9,
        history: { entries: [{ key: entryKey(1), url: "/manager/inventory?view=grid", at: 4, title: "Stock", scrollY: 120 }], index: 0 },
      },
      {
        id: tabId(2), pinned: false, openerTabId: tabId(1), createdAt: 5, lastActiveAt: 7,
        history: {
          entries: [
            { key: entryKey(2), url: "/manager/sales", at: 5 },
            { key: entryKey(3), url: "/manager/docs/edit?id=abc", at: 6, title: "Opening checklist" },
          ],
          index: 0,
        },
      },
    ];
    const closedTab: BrowserTab = {
      id: tabId(3), pinned: false, openerTabId: null, createdAt: 1, lastActiveAt: 1,
      history: { entries: [{ key: entryKey(4), url: "/manager/reports", at: 1 }], index: 0 },
    };
    const state: TabsSnapshot = { ...readyState(tabs, tabId(2)), closed: [{ id: "c_0000000001", tab: closedTab, index: 1, closedAt: 8 }] };
    const raw: unknown = JSON.parse(JSON.stringify(toPersisted(state, 10)));
    const out = sanitize(raw, 11, opts());
    expect(out).not.toBeNull();
    expect(out?.activeTabId).toBe(tabId(2));
    expect(out?.tabs).toEqual(tabs);
    expect(out?.closed).toEqual([{ id: "c_0000000001", tab: closedTab, index: 1, closedAt: 8 }]);
  });

  test("returns null for malformed, wrong-version or empty input", () => {
    expect(sanitize(null, 1, opts())).toBeNull();
    expect(sanitize("nope", 1, opts())).toBeNull();
    expect(sanitize([], 1, opts())).toBeNull();
    expect(sanitize({ v: 2, tabs: [rawTab(1, ["/manager/inventory"])] }, 1, opts())).toBeNull();
    expect(sanitize({ v: 1, tabs: "x" }, 1, opts())).toBeNull();
    expect(sanitize({ v: 1, tabs: [] }, 1, opts())).toBeNull();
    expect(sanitize({ v: 1, tabs: [rawTab(1, ["/manager/nope", "/choose", "https://x.test/manager"])] }, 1, opts())).toBeNull();
  });

  test("drops invalid and duplicate tabs, bad entries; regenerates bad or duplicate keys", () => {
    const raw = {
      v: 1,
      active: tabId(2),
      tabs: [
        { ...rawTab(1, ["/manager/inventory"]), id: "bad id" },
        rawTab(2, ["/manager/inventory", "/manager/unknown", "/manager/sales"], { i: 2 }),
        rawTab(2, ["/manager/reports"]),
        { id: tabId(3), c: 1, la: 1, i: 0, e: [{ k: entryKey(200), u: "/manager/reports", at: 1 }, { k: "not-a-key", u: "/manager/channel", at: "x" }, 42] },
        null,
      ],
    };
    const out = sanitize(raw, 99, opts());
    expect(out?.tabs.map((t) => t.id)).toEqual([tabId(2), tabId(3)]);
    expect(out?.tabs[0].history.entries.map((e) => e.url)).toEqual(["/manager/inventory", "/manager/sales"]);
    expect(out?.tabs[0].history.index).toBe(1);
    const third = out?.tabs[1];
    expect(third?.history.entries.map((e) => e.url)).toEqual(["/manager/reports", "/manager/channel"]);
    const keys = out?.tabs.flatMap((t) => t.history.entries.map((e) => e.key)) ?? [];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => /^e_[0-9a-z]{10}$/.test(k))).toBe(true);
    expect(third?.history.entries[1].at).toBe(99);
  });

  test("maps the index across dropped entries and applies legacy redirects", () => {
    const raw = { v: 1, tabs: [rawTab(1, ["/manager/nope", "/manager/chat", "/manager/nope2", "/manager/sales"], { i: 2 })] };
    const out = sanitize(raw, 1, opts());
    expect(out?.tabs[0].history.entries.map((e) => e.url)).toEqual(["/manager/channel", "/manager/sales"]);
    expect(out?.tabs[0].history.index).toBe(0);
  });

  test("rewrites the /manager alias onto the home page, whatever the device", () => {
    const raw = { v: 1, tabs: [rawTab(1, ["/manager/", "/manager/inventory"], { i: 0 })] };
    const out = sanitize(raw, 1, opts());
    expect(out?.tabs[0].history.entries.map((e) => e.url)).toEqual([HOME_URL, "/manager/inventory"]);
    expect(out?.tabs[0].history.index).toBe(0);
  });

  test("caps entries and tabs, keeps pinned tabs first, falls back to the most recent active tab", () => {
    const longUrls = Array.from({ length: MAX_ENTRIES_PER_TAB + 10 }, (_, i) => `/manager/inventory?page=${i}`);
    const tabs: PersistedTabV1[] = [rawTab(1, longUrls, { i: 12 })];
    for (let i = 2; i <= MAX_TABS + 5; i++) tabs.push(rawTab(i, [`/manager/sales?t=${i}`]));
    tabs.push(rawTab(999, ["/manager/reports"], { p: 1, la: 0 }));
    const out = sanitize({ v: 1, active: "t_missing000", tabs }, 1, opts());
    expect(out?.tabs).toHaveLength(MAX_TABS);
    expect(out?.tabs[0].id).toBe(tabId(999));
    expect(out?.tabs[0].pinned).toBe(true);
    expect(out?.tabs.some((t) => t.id === tabId(1))).toBe(false);
    expect(out?.activeTabId).toBe(tabId(MAX_TABS + 5));

    const capped = sanitize({ v: 1, tabs: [rawTab(1, longUrls, { i: 12 })] }, 1, opts());
    expect(capped?.tabs[0].history.entries).toHaveLength(MAX_ENTRIES_PER_TAB);
    expect(capped?.tabs[0].history.index).toBe(2);
    expect(currentEntry(capped?.tabs[0] as BrowserTab).url).toBe("/manager/inventory?page=12");
  });

  test("closed records: capped, colliding tab ids dropped, missing openers cleared", () => {
    const closed = Array.from({ length: MAX_CLOSED + 4 }, (_, i) => ({
      id: `c_${i.toString(36).padStart(10, "0")}`,
      tab: rawTab(500 + i, ["/manager/reports"], { o: tabId(7) }),
      index: 2,
      at: i,
    }));
    closed.unshift({ id: "c_dup0000000", tab: rawTab(1, ["/manager/sales"]), index: 0, at: 0 });
    const out = sanitize({ v: 1, tabs: [rawTab(1, ["/manager/inventory"])], closed }, 1, opts());
    expect(out?.closed).toHaveLength(MAX_CLOSED);
    expect(out?.closed.some((r) => r.tab.id === tabId(1))).toBe(false);
    expect(out?.closed.every((r) => r.tab.openerTabId === null)).toBe(true);
  });
});

// ─── Storage (fake window) ───────────────────────────────────────────────────

function memoryStorage(limit = Number.POSITIVE_INFINITY) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > limit) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
  return { storage: storage as unknown as Storage, data };
}

const globals = globalThis as { window?: unknown };

function installWindow(session: Storage, local: Storage): void {
  globals.window = { sessionStorage: session, localStorage: local };
}

afterEach(() => {
  delete globals.window;
});

describe("storage", () => {
  const scope = { userId: "user-1", organizationId: "org-1" };
  const tab: BrowserTab = {
    id: tabId(1), pinned: false, openerTabId: null, createdAt: 1, lastActiveAt: 1,
    history: { entries: [{ key: entryKey(1), url: "/manager/inventory", at: 1, title: "t".repeat(180) }], index: 0 },
  };
  const state = readyState([tab], tab.id);

  test("keys are scoped by user and org", () => {
    expect(sessionTabsKey(scope)).toBe("merchiva_tabs:v1:user-1:org-1");
    expect(localTabsKey(scope)).toBe("merchiva_tabs_last:v1:user-1:org-1");
  });

  test("session is always written, local only when asked; load prefers session", () => {
    const session = memoryStorage();
    const local = memoryStorage();
    installWindow(session.storage, local.storage);
    savePersisted(scope, state, { local: false, now: 5 });
    expect(session.data.has(sessionTabsKey(scope))).toBe(true);
    expect(local.data.has(localTabsKey(scope))).toBe(false);
    savePersisted(scope, state, { local: true, now: 6 });
    expect(local.data.has(localTabsKey(scope))).toBe(true);
    local.data.set(localTabsKey(scope), JSON.stringify({ v: 1, marker: "local" }));
    expect((loadPersisted(scope) as { savedAt: number }).savedAt).toBe(6);
    session.data.clear();
    expect((loadPersisted(scope) as { marker: string }).marker).toBe("local");
  });

  test("retries without titles and closed tabs when storage is full; idle states are never saved", () => {
    // Fits the slim fallback (no titles, no closed stack) but not the full state with its 180-char title.
    const session = memoryStorage(220);
    installWindow(session.storage, memoryStorage().storage);
    savePersisted(scope, state, { local: false, now: 1 });
    const saved = JSON.parse(session.data.get(sessionTabsKey(scope)) ?? "null") as { tabs: PersistedTabV1[] };
    expect(saved.tabs[0].e[0].t).toBeUndefined();
    session.data.clear();
    savePersisted(scope, IDLE_SNAPSHOT, { local: true, now: 1 });
    expect(session.data.size).toBe(0);
  });

  test("storage that throws is tolerated", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    installWindow(broken as unknown as Storage, broken as unknown as Storage);
    expect(loadPersisted(scope)).toBeNull();
    expect(() => savePersisted(scope, state, { local: true, now: 1 })).not.toThrow();
    expect(consumeBootIntent("org-1", 1)).toBe(false);
    expect(() => purgeTabStateForUser("user-1")).not.toThrow();
    expect(hasAuthUserRecord()).toBeNull();
  });

  test("purgeTabStateForUser removes one user's tab state in every org, the boot intent and the mirror", () => {
    const session = memoryStorage();
    const local = memoryStorage();
    installWindow(session.storage, local.storage);
    const otherOrg = { userId: "user-1", organizationId: "org-2" };
    const otherUser = { userId: "user-10", organizationId: "org-1" };
    for (const s of [scope, otherOrg, otherUser]) {
      session.data.set(sessionTabsKey(s), "{}");
      local.data.set(localTabsKey(s), "{}");
    }
    session.data.set(BOOT_INTENT_KEY, "{}");
    session.data.set(MIRROR_STORAGE_KEY, "{}");
    local.data.set("app_mode", "admin");

    purgeTabStateForUser("user-1");
    expect([...session.data.keys()]).toEqual([sessionTabsKey(otherUser)]);
    expect([...local.data.keys()].sort()).toEqual(["app_mode", localTabsKey(otherUser)].sort());

    purgeTabStateForUser(null);
    expect(session.data.size).toBe(0);
    expect([...local.data.keys()]).toEqual(["app_mode"]);
  });

  test("the signed-in user record probe", () => {
    expect(hasAuthUserRecord()).toBeNull();
    const local = memoryStorage();
    installWindow(memoryStorage().storage, local.storage);
    expect(hasAuthUserRecord()).toBe(false);
    local.data.set(AUTH_USER_STORAGE_KEY, "{}");
    expect(hasAuthUserRecord()).toBe(true);
  });

  test("the org-switch boot intent is one-shot, org-specific and expires", () => {
    const session = memoryStorage();
    installWindow(session.storage, memoryStorage().storage);
    writeBootIntent("org-2", 1_000);
    expect(consumeBootIntent("org-1", 1_000)).toBe(false);
    expect(consumeBootIntent("org-2", 1_000)).toBe(false);
    writeBootIntent("org-2", 1_000);
    expect(consumeBootIntent("org-2", 1_000 + BOOT_INTENT_TTL_MS + 1)).toBe(false);
    writeBootIntent("org-2", 1_000);
    expect(consumeBootIntent("org-2", 2_000)).toBe(true);
    expect(consumeBootIntent("org-2", 2_000)).toBe(false);
  });
});
