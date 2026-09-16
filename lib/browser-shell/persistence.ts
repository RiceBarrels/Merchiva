import { MIRROR_STORAGE_KEY } from "./history-bridge";
import {
  CLOSED_ID_RE,
  ENTRY_KEY_RE,
  MAX_TITLE_LEN,
  TAB_ID_RE,
  cleanTitle,
  pathnameOf,
  type IdGen,
} from "./model";
import { matchRoute, resolveLegacyRedirect } from "./routes";
import { canonicalizeUrl, stripVolatileParams } from "./url";
import {
  MAX_CLOSED,
  MAX_ENTRIES_PER_TAB,
  MAX_TABS,
  currentEntry,
  type BrowserTab,
  type ClosedTabRecord,
  type EntryKey,
  type HistoryEntry,
  type TabId,
  type TabUrl,
  type TabsSnapshot,
} from "./types";

/*
 * Tab state persistence (tab-state spec §8, plan D9).
 *   sessionStorage merchiva_tabs:v1:${userId}:${orgId}      live state of this browser window
 *   localStorage   merchiva_tabs_last:v1:${userId}:${orgId} last-writer-wins seed for cold starts
 *   sessionStorage merchiva_shell_boot_intent               one-shot org-switch intent (60 s)
 * Every storage access is wrapped: Safari private mode, quota and blocked site data all throw.
 */

export interface TabsScope {
  readonly userId: string;
  readonly organizationId: string;
}

export const BOOT_INTENT_KEY = "merchiva_shell_boot_intent";
export const BOOT_INTENT_TTL_MS = 60_000;

export function sessionTabsKey(scope: TabsScope): string {
  return `merchiva_tabs:v1:${scope.userId}:${scope.organizationId}`;
}

export function localTabsKey(scope: TabsScope): string {
  return `merchiva_tabs_last:v1:${scope.userId}:${scope.organizationId}`;
}

export interface PersistedEntryV1 { k: string; u: string; t?: string; y?: number; at: number }
export interface PersistedTabV1 { id: string; p?: 1; o?: string; c: number; la: number; i: number; e: PersistedEntryV1[] }
export interface PersistedClosedV1 { id: string; tab: PersistedTabV1; index: number; at: number }
export interface PersistedTabsV1 {
  v: 1;
  savedAt: number;
  active: string;
  tabs: PersistedTabV1[];
  closed: PersistedClosedV1[];
}

// ─── Serialize ───────────────────────────────────────────────────────────────

export interface ToPersistedOptions {
  /** Include the closed-tab stack (dropped on the quota retry). */
  withClosed?: boolean;
  /** Include page titles (dropped on the quota retry). */
  withTitles?: boolean;
  /** Latest scroll offsets not yet folded into the snapshot. */
  scrollOf?: (entryKey: EntryKey) => number | undefined;
}

function routePersists(url: TabUrl): boolean {
  return matchRoute(pathnameOf(url))?.persist !== false;
}

function persistTab(tab: BrowserTab, opts: Required<Pick<ToPersistedOptions, "withTitles">> & ToPersistedOptions): PersistedTabV1 | null {
  const { entries, index } = tab.history;
  const e: PersistedEntryV1[] = [];
  let i = -1;
  entries.forEach((entry, position) => {
    if (!routePersists(entry.url)) return;
    const out: PersistedEntryV1 = { k: entry.key, u: stripVolatileParams(entry.url), at: entry.at };
    if (opts.withTitles && entry.title) out.t = entry.title.slice(0, MAX_TITLE_LEN);
    const y = opts.scrollOf?.(entry.key) ?? entry.scrollY;
    if (y !== undefined && Number.isFinite(y) && y > 0) out.y = Math.round(y);
    e.push(out);
    if (position <= index) i = e.length - 1;
  });
  if (e.length === 0) return null;
  const out: PersistedTabV1 = { id: tab.id, c: tab.createdAt, la: tab.lastActiveAt, i: i < 0 ? 0 : i, e };
  if (tab.pinned) out.p = 1;
  if (tab.openerTabId) out.o = tab.openerTabId;
  return out;
}

/** Snapshot → storage shape. Drops the gate, `persist:false` entries and volatile params. */
export function toPersisted(state: TabsSnapshot, now: number, opts: ToPersistedOptions = {}): PersistedTabsV1 {
  const options = { withClosed: opts.withClosed !== false, withTitles: opts.withTitles !== false, scrollOf: opts.scrollOf };
  const tabs: PersistedTabV1[] = [];
  for (const tab of state.tabs) {
    const persisted = persistTab(tab, options);
    if (persisted) tabs.push(persisted);
  }
  const closed: PersistedClosedV1[] = [];
  if (options.withClosed) {
    for (const record of state.closed) {
      const persisted = persistTab(record.tab, options);
      if (persisted) closed.push({ id: record.id, tab: persisted, index: record.index, at: record.closedAt });
    }
  }
  const preferred = state.activeTabId ?? state.requestedTabId;
  const active = tabs.some((tab) => tab.id === preferred) ? (preferred as string) : (tabs[0]?.id ?? "");
  return { v: 1, savedAt: now, active, tabs, closed };
}

// ─── Sanitize (tab-state §9.1) ───────────────────────────────────────────────

export interface SanitizedTabs {
  readonly tabs: readonly BrowserTab[];
  readonly activeTabId: TabId;
  readonly closed: readonly ClosedTabRecord[];
}

export interface SanitizeOptions {
  readonly ids: IdGen;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Canonical, redirected, tabbable, registered URL — or null. `resolveLegacyRedirect` also maps
 * the "/manager" alias onto the home page, so a stored entry never restores a tab onto it.
 */
function cleanUrl(raw: unknown): TabUrl | null {
  if (typeof raw !== "string") return null;
  const first = canonicalizeUrl(raw, "http://local/");
  if (!first) return null;
  const redirected = resolveLegacyRedirect(first.url);
  const final = redirected === first.url ? first : canonicalizeUrl(redirected, "http://local/");
  if (!final || !final.tabbable || !matchRoute(final.pathname)) return null;
  return final.url;
}

function sanitizeTab(
  raw: unknown,
  now: number,
  opts: SanitizeOptions,
  usedKeys: Set<EntryKey>,
): BrowserTab | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !TAB_ID_RE.test(raw.id)) return null;
  const rawEntries = Array.isArray(raw.e) ? raw.e : [];
  const rawIndex = Math.trunc(finiteOr(raw.i, rawEntries.length - 1));
  const entries: HistoryEntry[] = [];
  let index = -1;
  rawEntries.forEach((value, position) => {
    if (!isRecord(value)) return;
    const url = cleanUrl(value.u);
    if (!url) return;
    let key = typeof value.k === "string" && ENTRY_KEY_RE.test(value.k) ? value.k : opts.ids.entry();
    while (usedKeys.has(key)) key = opts.ids.entry();
    usedKeys.add(key);
    const entry: { key: EntryKey; url: TabUrl; at: number; title?: string; scrollY?: number } = {
      key,
      url,
      at: finiteOr(value.at, now),
    };
    if (typeof value.t === "string") {
      const title = cleanTitle(value.t);
      if (title) entry.title = title;
    }
    if (typeof value.y === "number" && Number.isFinite(value.y) && value.y > 0) entry.scrollY = Math.round(value.y);
    entries.push(entry);
    if (position <= rawIndex) index = entries.length - 1;
  });
  if (entries.length === 0) return null;
  let finalEntries = entries;
  let finalIndex = index < 0 ? 0 : Math.min(index, entries.length - 1);
  if (entries.length > MAX_ENTRIES_PER_TAB) {
    const drop = entries.length - MAX_ENTRIES_PER_TAB;
    finalEntries = entries.slice(drop);
    finalIndex = Math.max(0, finalIndex - drop);
  }
  const createdAt = finiteOr(raw.c, now);
  return {
    id: raw.id,
    pinned: raw.p === 1 || raw.p === true,
    openerTabId: typeof raw.o === "string" && TAB_ID_RE.test(raw.o) ? raw.o : null,
    createdAt,
    lastActiveAt: finiteOr(raw.la, createdAt),
    history: { entries: finalEntries, index: finalIndex },
  };
}

/**
 * Structural validation of persisted tab state, before access is known. Returns null for
 * anything unusable (wrong version, no valid tabs). Invalid tabs and entries are dropped,
 * duplicate ids removed, duplicate entry keys regenerated, sizes capped.
 */
export function sanitize(raw: unknown, now: number, opts: SanitizeOptions): SanitizedTabs | null {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.tabs)) return null;
  const usedKeys = new Set<EntryKey>();
  const seen = new Set<TabId>();
  const parsed: BrowserTab[] = [];
  for (const value of raw.tabs) {
    const tab = sanitizeTab(value, now, opts, usedKeys);
    if (!tab || seen.has(tab.id)) continue;
    seen.add(tab.id);
    parsed.push(tab);
  }
  if (parsed.length === 0) return null;

  // Keep at most MAX_TABS: pinned first, then the most recently active; original order kept.
  let kept = parsed;
  if (parsed.length > MAX_TABS) {
    const ranked = parsed
      .map((tab, order) => ({ tab, order }))
      .sort((a, b) => Number(b.tab.pinned) - Number(a.tab.pinned) || b.tab.lastActiveAt - a.tab.lastActiveAt);
    const allowed = new Set(ranked.slice(0, MAX_TABS).map((item) => item.tab.id));
    kept = parsed.filter((tab) => allowed.has(tab.id));
  }
  const ordered = [...kept.filter((tab) => tab.pinned), ...kept.filter((tab) => !tab.pinned)];
  const alive = new Set(ordered.map((tab) => tab.id));
  const tabs = ordered.map((tab) => (tab.openerTabId && (!alive.has(tab.openerTabId) || tab.openerTabId === tab.id) ? { ...tab, openerTabId: null } : tab));

  const closed: ClosedTabRecord[] = [];
  const closedIds = new Set<string>();
  if (Array.isArray(raw.closed)) {
    for (const value of raw.closed) {
      if (closed.length >= MAX_CLOSED) break;
      if (!isRecord(value)) continue;
      const tab = sanitizeTab(value.tab, now, opts, usedKeys);
      if (!tab || alive.has(tab.id)) continue;
      let id = typeof value.id === "string" && CLOSED_ID_RE.test(value.id) ? value.id : opts.ids.closed();
      while (closedIds.has(id)) id = opts.ids.closed();
      closedIds.add(id);
      closed.push({
        id,
        tab: tab.openerTabId && !alive.has(tab.openerTabId) ? { ...tab, openerTabId: null } : tab,
        index: Math.max(0, Math.trunc(finiteOr(value.index, tabs.length))),
        closedAt: finiteOr(value.at, now),
      });
    }
  }

  const activeTabId =
    typeof raw.active === "string" && alive.has(raw.active)
      ? raw.active
      : tabs.reduce((best, tab) => (tab.lastActiveAt > best.lastActiveAt ? tab : best), tabs[0]).id;
  return { tabs, activeTabId, closed };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function storage(kind: "session" | "local"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function readJson(kind: "session" | "local", key: string): unknown {
  const store = storage(kind);
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeText(kind: "session" | "local", key: string, text: string): boolean {
  const store = storage(kind);
  if (!store) return false;
  try {
    store.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

/** This window's live state, else the last snapshot of any window, else null. */
export function loadPersisted(scope: TabsScope): unknown {
  return readJson("session", sessionTabsKey(scope)) ?? readJson("local", localTabsKey(scope));
}

/**
 * Writes sessionStorage (and localStorage when `local`). On a storage error it retries once
 * without the closed stack and titles, then gives up (state stays in memory).
 */
export function savePersisted(
  scope: TabsScope,
  state: TabsSnapshot,
  opts: { local: boolean; now: number; scrollOf?: (entryKey: EntryKey) => number | undefined },
): void {
  if (state.status !== "ready" || state.tabs.length === 0) return;
  const full = JSON.stringify(toPersisted(state, opts.now, { scrollOf: opts.scrollOf }));
  let slim: string | null = null;
  const write = (kind: "session" | "local", key: string) => {
    if (writeText(kind, key, full)) return;
    slim ??= JSON.stringify(toPersisted(state, opts.now, { withClosed: false, withTitles: false, scrollOf: opts.scrollOf }));
    writeText(kind, key, slim);
  };
  write("session", sessionTabsKey(scope));
  if (opts.local) write("local", localTabsKey(scope));
}

/** lib/auth/context.tsx USER_KEY: set while a user is signed in on this device, wiped by sign-out. */
export const AUTH_USER_STORAGE_KEY = "workos_user";

/** Whether a signed-in user record exists; null when storage is unreadable. */
export function hasAuthUserRecord(): boolean | null {
  const store = storage("local");
  if (!store) return null;
  try {
    return store.getItem(AUTH_USER_STORAGE_KEY) !== null;
  } catch {
    return null;
  }
}

function removeMatching(kind: "session" | "local", matches: (key: string) => boolean): void {
  const store = storage(kind);
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null && matches(key)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

/**
 * Removes the tab state of `userId` in every org (both storages), the org-switch intent and the
 * browser history mirror (tab-state spec §16.7). `null` removes every user's tab state.
 */
export function purgeTabStateForUser(userId: string | null): void {
  const sessionPrefix = userId === null ? "merchiva_tabs:v1:" : `merchiva_tabs:v1:${userId}:`;
  const localPrefix = userId === null ? "merchiva_tabs_last:v1:" : `merchiva_tabs_last:v1:${userId}:`;
  removeMatching("session", (key) => key.startsWith(sessionPrefix) || key === BOOT_INTENT_KEY || key === MIRROR_STORAGE_KEY);
  removeMatching("local", (key) => key.startsWith(localPrefix));
}

// ─── Org-switch boot intent (tab-state §16.5) ────────────────────────────────

export function writeBootIntent(organizationId: string, now: number): void {
  writeText("session", BOOT_INTENT_KEY, JSON.stringify({ kind: "org-switch", orgId: organizationId, at: now }));
}

/** Reads and removes the intent; true when it targets `organizationId` and is fresh. */
export function consumeBootIntent(organizationId: string, now: number): boolean {
  const value = readJson("session", BOOT_INTENT_KEY);
  const store = storage("session");
  try {
    store?.removeItem(BOOT_INTENT_KEY);
  } catch {
    // Storage unavailable: the intent simply expires.
  }
  if (!isRecord(value) || value.kind !== "org-switch" || value.orgId !== organizationId) return false;
  const at = finiteOr(value.at, 0);
  return now - at >= 0 && now - at <= BOOT_INTENT_TTL_MS;
}

/** Test/diagnostic helper: the active tab's current URL of a sanitized state. */
export function activeUrlOf(sanitized: SanitizedTabs): TabUrl {
  const tab = sanitized.tabs.find((t) => t.id === sanitized.activeTabId) ?? sanitized.tabs[0];
  return currentEntry(tab).url;
}
