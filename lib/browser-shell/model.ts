import { canonicalizeUrl } from "./url";
import {
  MAX_CLOSED,
  MAX_ENTRIES_PER_TAB,
  NEW_TAB_URL,
  currentEntry,
  type BrowserTab,
  type ClosedTabRecord,
  type EntryKey,
  type HistoryEntry,
  type OpenTabOptions,
  type RouteAccess,
  type TabId,
  type TabUrl,
  type TabsSnapshot,
  type UrlKey,
} from "./types";

/*
 * Pure tab-model transitions (tab-state spec §4.3). No DOM, no storage, no React:
 * every function takes a snapshot and returns a new one (or the same object when
 * nothing changed, so callers can skip notifications cheaply).
 */

export const MAX_TITLE_LEN = 200;
export const TAB_ID_RE = /^t_[0-9a-z]{10}$/;
export const ENTRY_KEY_RE = /^e_[0-9a-z]{10}$/;
export const CLOSED_ID_RE = /^c_[0-9a-z]{10}$/;

/** Constant base so URL keys never depend on `window.location`. */
const KEY_BASE = "http://local/";
const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export interface IdGen {
  tab(): TabId;
  entry(): EntryKey;
  closed(): string;
  /** Unique key per browser history entry (history stamps). */
  stamp(): string;
}

function randomToken(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (const byte of bytes) out += ID_ALPHABET[byte % ID_ALPHABET.length];
  return out;
}

export function createIdGen(): IdGen {
  return {
    tab: () => `t_${randomToken(10)}`,
    entry: () => `e_${randomToken(10)}`,
    closed: () => `c_${randomToken(10)}`,
    stamp: () => `k_${randomToken(10)}`,
  };
}

const EMPTY_TABS: readonly BrowserTab[] = Object.freeze([]);
const EMPTY_IDS: readonly TabId[] = Object.freeze([]);
const EMPTY_CLOSED: readonly ClosedTabRecord[] = Object.freeze([]);

/** Snapshot while no browser shell is bound (and on the server). */
export const IDLE_SNAPSHOT: TabsSnapshot = Object.freeze({
  status: "idle",
  scope: null,
  tabs: EMPTY_TABS,
  activeTabId: null,
  requestedTabId: null,
  pendingTabIds: EMPTY_IDS,
  closed: EMPTY_CLOSED,
  gate: null,
  mountNonce: 0,
});

/** Equality key of a tab URL (pathname + sorted search). */
export function urlKeyOf(url: TabUrl): UrlKey {
  return canonicalizeUrl(url, KEY_BASE)?.key ?? url;
}

export function pathnameOf(url: TabUrl): string {
  const q = url.indexOf("?");
  return q < 0 ? url : url.slice(0, q);
}

export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LEN);
}

export function findTab(state: TabsSnapshot, tabId: TabId | null | undefined): BrowserTab | null {
  if (!tabId) return null;
  return state.tabs.find((tab) => tab.id === tabId) ?? null;
}

export function pinnedCount(tabs: readonly BrowserTab[]): number {
  let n = 0;
  while (n < tabs.length && tabs[n].pinned) n++;
  return n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function mapTab(state: TabsSnapshot, tabId: TabId, fn: (tab: BrowserTab) => BrowserTab): TabsSnapshot {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return state;
  const prev = state.tabs[index];
  const next = fn(prev);
  if (next === prev) return state;
  const tabs = state.tabs.slice();
  tabs[index] = next;
  return { ...state, tabs };
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export function createTab(
  url: TabUrl,
  now: number,
  ids: IdGen,
  opts?: { pinned?: boolean; openerTabId?: TabId | null },
): BrowserTab {
  return {
    id: ids.tab(),
    pinned: opts?.pinned === true,
    openerTabId: opts?.openerTabId ?? null,
    createdAt: now,
    lastActiveAt: now,
    history: { entries: [{ key: ids.entry(), url, at: now }], index: 0 },
  };
}

export type TabPosition = NonNullable<OpenTabOptions["position"]>;

/**
 * Strip index for a new tab. Pinned tabs go inside the pinned block, unpinned ones after it.
 *   "end"              → end of its block
 *   "afterActive"      → right after `anchorTabId`
 *   "afterOpenerGroup" → after the opener and the run of tabs it already opened (Chrome link tabs)
 *   number             → clamped into its block
 */
export function insertionIndex(
  tabs: readonly BrowserTab[],
  pinned: boolean,
  position: TabPosition,
  openerTabId: TabId | null,
  anchorTabId: TabId | null,
): number {
  const pc = pinnedCount(tabs);
  const [min, max] = pinned ? [0, pc] : [pc, tabs.length];
  let index: number;
  if (typeof position === "number") {
    index = Number.isFinite(position) ? Math.trunc(position) : max;
  } else if (position === "afterActive") {
    const anchor = anchorTabId ? tabs.findIndex((tab) => tab.id === anchorTabId) : -1;
    index = anchor < 0 ? max : anchor + 1;
  } else if (position === "afterOpenerGroup") {
    const opener = openerTabId ? tabs.findIndex((tab) => tab.id === openerTabId) : -1;
    if (opener < 0) index = max;
    else {
      index = opener + 1;
      while (index < tabs.length && tabs[index].openerTabId === openerTabId) index++;
    }
  } else {
    index = max;
  }
  return clamp(index, min, max);
}

export function insertTab(
  state: TabsSnapshot,
  tab: BrowserTab,
  position: TabPosition,
  openerTabId: TabId | null,
  anchorTabId: TabId | null = state.requestedTabId ?? state.activeTabId,
): TabsSnapshot {
  const index = insertionIndex(state.tabs, tab.pinned, position, openerTabId, anchorTabId);
  const tabs = state.tabs.slice();
  tabs.splice(index, 0, tab);
  return { ...state, tabs };
}

// ─── History entries ─────────────────────────────────────────────────────────

/** Pushes onto a tab's history: truncates forward entries, caps the length (oldest dropped). */
export function pushEntry(
  state: TabsSnapshot,
  tabId: TabId,
  url: TabUrl,
  now: number,
  ids: IdGen,
): { state: TabsSnapshot; entry: HistoryEntry | null } {
  const entry: HistoryEntry = { key: ids.entry(), url, at: now };
  let pushed: HistoryEntry | null = null;
  const next = mapTab(state, tabId, (tab) => {
    const kept = tab.history.entries.slice(0, tab.history.index + 1);
    kept.push(entry);
    const entries = kept.length > MAX_ENTRIES_PER_TAB ? kept.slice(kept.length - MAX_ENTRIES_PER_TAB) : kept;
    pushed = entry;
    return { ...tab, history: { entries, index: entries.length - 1 } };
  });
  return { state: next, entry: pushed };
}

/**
 * Replaces the tab's current entry. The entry keeps its key (and title / scroll) when the
 * UrlKey is unchanged (param order drift); a different URL gets a fresh key.
 */
export function replaceEntry(
  state: TabsSnapshot,
  tabId: TabId,
  url: TabUrl,
  now: number,
  ids: IdGen,
): { state: TabsSnapshot; entry: HistoryEntry | null } {
  let replaced: HistoryEntry | null = null;
  const next = mapTab(state, tabId, (tab) => {
    const current = currentEntry(tab);
    const index = tab.history.entries.indexOf(current);
    const entry: HistoryEntry =
      urlKeyOf(current.url) === urlKeyOf(url)
        ? current.url === url
          ? current
          : { ...current, url }
        : { key: ids.entry(), url, at: now };
    replaced = entry;
    if (entry === current) return tab;
    const entries = tab.history.entries.slice();
    entries[index] = entry;
    return { ...tab, history: { entries, index } };
  });
  return { state: next, entry: replaced };
}

/** Same entry, drifted URL (e.g. param order after a traversal). */
export function patchEntryUrl(state: TabsSnapshot, entryKey: EntryKey, url: TabUrl): TabsSnapshot {
  const hit = findByEntryKey(state, entryKey);
  if (!hit || hit.tab.history.entries[hit.index].url === url) return state;
  return mapTab(state, hit.tab.id, (tab) => {
    const entries = tab.history.entries.slice();
    entries[hit.index] = { ...entries[hit.index], url };
    return { ...tab, history: { entries, index: tab.history.index } };
  });
}

export function setIndex(state: TabsSnapshot, tabId: TabId, index: number): TabsSnapshot {
  return mapTab(state, tabId, (tab) => {
    const next = clamp(Math.trunc(index), 0, tab.history.entries.length - 1);
    return next === tab.history.index ? tab : { ...tab, history: { entries: tab.history.entries, index: next } };
  });
}

/** The tab becomes both the rendered and the highlighted tab; any gate is lifted. */
export function commitActivation(state: TabsSnapshot, tabId: TabId, now: number): TabsSnapshot {
  if (!findTab(state, tabId)) return state;
  const touched = mapTab(state, tabId, (tab) => (tab.lastActiveAt === now ? tab : { ...tab, lastActiveAt: now }));
  if (touched.activeTabId === tabId && touched.requestedTabId === tabId && touched.gate === null && touched === state) {
    return state;
  }
  return { ...touched, activeTabId: tabId, requestedTabId: tabId, gate: null };
}

export function setRequested(state: TabsSnapshot, tabId: TabId | null): TabsSnapshot {
  return state.requestedTabId === tabId ? state : { ...state, requestedTabId: tabId };
}

export function setPending(state: TabsSnapshot, tabIds: readonly TabId[]): TabsSnapshot {
  const same = state.pendingTabIds.length === tabIds.length && tabIds.every((id, i) => state.pendingTabIds[i] === id);
  return same ? state : { ...state, pendingTabIds: tabIds.length > 0 ? tabIds.slice() : EMPTY_IDS };
}

export function setGate(state: TabsSnapshot, tabId: TabId, url: TabUrl): TabsSnapshot {
  if (state.gate && state.gate.tabId === tabId && state.gate.url === url) return state;
  return { ...state, gate: { tabId, url } };
}

export function clearGate(state: TabsSnapshot): TabsSnapshot {
  return state.gate === null ? state : { ...state, gate: null };
}

export function bumpMountNonce(state: TabsSnapshot): TabsSnapshot {
  return { ...state, mountNonce: state.mountNonce + 1 };
}

// ─── Closing ─────────────────────────────────────────────────────────────────

/**
 * Successor when `closingId` closes (plan D11):
 *   1. its opener, if still open and the closing tab never navigated (history index 0)
 *   2. otherwise the tab to its right
 *   3. otherwise the tab to its left
 */
export function pickSuccessor(state: TabsSnapshot, closingId: TabId): TabId | null {
  const index = state.tabs.findIndex((tab) => tab.id === closingId);
  if (index < 0) return null;
  const tab = state.tabs[index];
  if (tab.openerTabId && tab.history.index === 0 && state.tabs.some((t) => t.id === tab.openerTabId && t.id !== closingId)) {
    return tab.openerTabId;
  }
  if (index + 1 < state.tabs.length) return state.tabs[index + 1].id;
  if (index > 0) return state.tabs[index - 1].id;
  return null;
}

export function removeTab(
  state: TabsSnapshot,
  tabId: TabId,
  now: number,
  ids: IdGen,
  opts: { recordClosed: boolean },
): { state: TabsSnapshot; successorId: TabId | null } {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return { state, successorId: null };
  const tab = state.tabs[index];
  const successorId = pickSuccessor(state, tabId);
  const tabs = state.tabs
    .filter((t) => t.id !== tabId)
    .map((t) => (t.openerTabId === tabId ? { ...t, openerTabId: null } : t));
  const closed = opts.recordClosed
    ? [{ id: ids.closed(), tab, index, closedAt: now }, ...state.closed].slice(0, MAX_CLOSED)
    : state.closed;
  return {
    state: {
      ...state,
      tabs,
      closed,
      activeTabId: state.activeTabId === tabId ? null : state.activeTabId,
      requestedTabId: state.requestedTabId === tabId ? null : state.requestedTabId,
      pendingTabIds: state.pendingTabIds.includes(tabId) ? state.pendingTabIds.filter((id) => id !== tabId) : state.pendingTabIds,
      gate: state.gate?.tabId === tabId ? null : state.gate,
    },
    successorId,
  };
}

// ─── Strip order ─────────────────────────────────────────────────────────────

/** Moves a tab; the target is clamped inside its pinned / unpinned partition. */
export function reorder(state: TabsSnapshot, tabId: TabId, toIndex: number): TabsSnapshot {
  const from = state.tabs.findIndex((tab) => tab.id === tabId);
  if (from < 0) return state;
  const tab = state.tabs[from];
  const rest = state.tabs.filter((t) => t.id !== tabId);
  const pc = pinnedCount(rest);
  const target = tab.pinned
    ? clamp(Math.trunc(toIndex), 0, pc)
    : clamp(Math.trunc(toIndex), pc, rest.length);
  if (target === from) return state;
  rest.splice(target, 0, tab);
  return { ...state, tabs: rest };
}

/** Pin → end of the pinned block; unpin → start of the unpinned block. */
export function setPinned(state: TabsSnapshot, tabId: TabId, pinned: boolean): TabsSnapshot {
  const tab = findTab(state, tabId);
  if (!tab || tab.pinned === pinned) return state;
  const rest = state.tabs.filter((t) => t.id !== tabId);
  const pc = pinnedCount(rest);
  rest.splice(pc, 0, { ...tab, pinned });
  return { ...state, tabs: rest };
}

/** Copies the whole history with fresh entry keys, inserted right after the source. */
export function duplicate(
  state: TabsSnapshot,
  tabId: TabId,
  now: number,
  ids: IdGen,
): { state: TabsSnapshot; tabId: TabId } | null {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return null;
  const source = state.tabs[index];
  const copy: BrowserTab = {
    id: ids.tab(),
    pinned: source.pinned,
    openerTabId: source.id,
    createdAt: now,
    lastActiveAt: now,
    history: {
      entries: source.history.entries.map((entry) => ({ ...entry, key: ids.entry() })),
      index: source.history.index,
    },
  };
  const tabs = state.tabs.slice();
  const pc = pinnedCount(tabs);
  const at = copy.pinned ? clamp(index + 1, 0, pc) : clamp(index + 1, pc, tabs.length);
  tabs.splice(at, 0, copy);
  return { state: { ...state, tabs }, tabId: copy.id };
}

/** Reopens a closed tab (newest when `closedId` is omitted) at its old index, keeping its ids. */
export function restoreClosed(
  state: TabsSnapshot,
  closedId: string | undefined,
  ids: IdGen,
): { state: TabsSnapshot; tabId: TabId } | null {
  const recordIndex = closedId === undefined ? 0 : state.closed.findIndex((record) => record.id === closedId);
  const record = state.closed[recordIndex];
  if (!record) return null;
  const openIds = new Set(state.tabs.map((tab) => tab.id));
  const openKeys = new Set(state.tabs.flatMap((tab) => tab.history.entries.map((entry) => entry.key)));
  const tabIdTaken = openIds.has(record.tab.id);
  const restored: BrowserTab = {
    ...record.tab,
    id: tabIdTaken ? ids.tab() : record.tab.id,
    openerTabId: record.tab.openerTabId && openIds.has(record.tab.openerTabId) ? record.tab.openerTabId : null,
    history: {
      entries: record.tab.history.entries.map((entry) => (openKeys.has(entry.key) ? { ...entry, key: ids.entry() } : entry)),
      index: record.tab.history.index,
    },
  };
  const tabs = state.tabs.slice();
  const pc = pinnedCount(tabs);
  const at = restored.pinned ? clamp(record.index, 0, pc) : clamp(record.index, pc, tabs.length);
  tabs.splice(at, 0, restored);
  const closed = state.closed.filter((_, i) => i !== recordIndex);
  return { state: { ...state, tabs, closed }, tabId: restored.id };
}

// ─── Entry fields ────────────────────────────────────────────────────────────

export function findByEntryKey(state: TabsSnapshot, key: EntryKey): { tab: BrowserTab; index: number } | null {
  for (const tab of state.tabs) {
    const index = tab.history.entries.findIndex((entry) => entry.key === key);
    if (index >= 0) return { tab, index };
  }
  return null;
}

/** First tab whose CURRENT entry has this UrlKey; the New Tab page is never matched. */
export function findByUrlKey(state: TabsSnapshot, key: UrlKey): BrowserTab | null {
  if (pathnameOf(key) === NEW_TAB_URL) return null;
  return state.tabs.find((tab) => urlKeyOf(currentEntry(tab).url) === key) ?? null;
}

function mapEntry(state: TabsSnapshot, entryKey: EntryKey, fn: (entry: HistoryEntry) => HistoryEntry): TabsSnapshot {
  const hit = findByEntryKey(state, entryKey);
  if (!hit) return state;
  const prev = hit.tab.history.entries[hit.index];
  const next = fn(prev);
  if (next === prev) return state;
  return mapTab(state, hit.tab.id, (tab) => {
    const entries = tab.history.entries.slice();
    entries[hit.index] = next;
    return { ...tab, history: { entries, index: tab.history.index } };
  });
}

export function setEntryScroll(state: TabsSnapshot, entryKey: EntryKey, y: number | undefined): TabsSnapshot {
  const value = y === undefined || !Number.isFinite(y) || y <= 0 ? undefined : Math.round(y);
  return mapEntry(state, entryKey, (entry) => {
    if (entry.scrollY === value) return entry;
    const next: HistoryEntry = { key: entry.key, url: entry.url, at: entry.at };
    return withOptional(next, entry.title, value);
  });
}

export function setEntryTitle(state: TabsSnapshot, entryKey: EntryKey, title: string | null): TabsSnapshot {
  const value = title === null ? undefined : cleanTitle(title) || undefined;
  return mapEntry(state, entryKey, (entry) => {
    if (entry.title === value) return entry;
    const next: HistoryEntry = { key: entry.key, url: entry.url, at: entry.at };
    return withOptional(next, value, entry.scrollY);
  });
}

function withOptional(entry: HistoryEntry, title: string | undefined, scrollY: number | undefined): HistoryEntry {
  if (title === undefined && scrollY === undefined) return entry;
  if (title === undefined) return { ...entry, scrollY };
  if (scrollY === undefined) return { ...entry, title };
  return { ...entry, title, scrollY };
}

// ─── Access validation (tab-state §9.3) ──────────────────────────────────────

function isRemovable(access: RouteAccess): boolean {
  return access === "forbidden" || access === "unknownRoute" || access === "notTabbable";
}

/**
 * Filters entries that became forbidden / unknown. featureOff entries are kept (PermissionGuard
 * shows the install notice). The committed active tab's current entry and `protectEntryKey`
 * are never removed: PermissionGuard owns that redirect. A tab left without entries is removed
 * without a closed record; closed records without allowed entries are dropped too.
 */
export function applyAccess(
  state: TabsSnapshot,
  accessOf: (url: TabUrl) => RouteAccess,
  opts: { protectEntryKey?: EntryKey | null } = {},
): TabsSnapshot {
  const cache = new Map<TabUrl, RouteAccess>();
  const access = (url: TabUrl): RouteAccess => {
    let value = cache.get(url);
    if (value === undefined) {
      value = accessOf(url);
      cache.set(url, value);
    }
    return value;
  };
  const activeKey = (() => {
    const active = findTab(state, state.activeTabId);
    return active ? currentEntry(active).key : null;
  })();

  const filterHistory = (tab: BrowserTab, protect: ReadonlySet<EntryKey>): BrowserTab | null => {
    const { entries, index } = tab.history;
    const kept: HistoryEntry[] = [];
    let nextIndex = -1;
    entries.forEach((entry, i) => {
      if (protect.has(entry.key) || !isRemovable(access(entry.url))) {
        kept.push(entry);
        if (i <= index) nextIndex = kept.length - 1;
      }
    });
    if (kept.length === 0) return null;
    if (kept.length === entries.length) return tab;
    return { ...tab, history: { entries: kept, index: nextIndex < 0 ? 0 : nextIndex } };
  };

  const protect = new Set<EntryKey>();
  if (activeKey) protect.add(activeKey);
  if (opts.protectEntryKey) protect.add(opts.protectEntryKey);

  let changed = false;
  const tabs: BrowserTab[] = [];
  for (const tab of state.tabs) {
    const next = filterHistory(tab, protect);
    if (next !== tab) changed = true;
    if (next) tabs.push(next);
  }
  const closed: ClosedTabRecord[] = [];
  for (const record of state.closed) {
    const next = filterHistory(record.tab, protect);
    if (next !== record.tab) changed = true;
    if (next) closed.push(next === record.tab ? record : { ...record, tab: next });
  }
  if (!changed) return state;

  const alive = new Set(tabs.map((tab) => tab.id));
  const cleaned = tabs.map((tab) => (tab.openerTabId && !alive.has(tab.openerTabId) ? { ...tab, openerTabId: null } : tab));
  const activeTabId = state.activeTabId && alive.has(state.activeTabId) ? state.activeTabId : null;
  return {
    ...state,
    tabs: cleaned,
    closed,
    activeTabId,
    requestedTabId: state.requestedTabId && alive.has(state.requestedTabId) ? state.requestedTabId : activeTabId,
    pendingTabIds: state.pendingTabIds.filter((id) => alive.has(id)),
    gate: state.gate && alive.has(state.gate.tabId) ? state.gate : null,
  };
}
