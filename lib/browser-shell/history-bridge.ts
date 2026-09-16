import {
  clearGate,
  commitActivation,
  findByEntryKey,
  findTab,
  pathnameOf,
  patchEntryUrl,
  pushEntry,
  replaceEntry,
  setGate,
  setIndex,
  setPending,
  setRequested,
  urlKeyOf,
  type IdGen,
} from "./model";
import { matchRoute } from "./routes";
import { canonicalizeUrl } from "./url";
import { INTENT_TTL_MS, currentEntry, type EntryKey, type TabId, type TabUrl, type TabsSnapshot, type UrlKey } from "./types";

/*
 * Router sync (tab-state spec §7, plan D7). Wraps history.pushState / replaceState and
 * listens to popstate so every URL change while the shell is bound is mapped onto the tab
 * model exactly (push vs replace), each browser entry is stamped with the tab entry it
 * belongs to, and a mirror of this window's browser history lets shell back/forward use
 * real `history.go` steps whenever they land on the intended entry.
 */

export const STAMP_FIELD = "__mvTab";
export const MIRROR_STORAGE_KEY = "merchiva_shell_hist:v1";
export const MIRROR_CAP = 200;
const TRAVERSAL_TIMEOUT_MS = 1000;
/** Times one activation's navigation is dispatched again after being superseded (no loops). */
const MAX_REDISPATCH = 2;

/** Stored in `history.state.__mvTab`: browser entry key, tab id, tab entry key. */
export interface Stamp {
  readonly k: string;
  readonly t: TabId;
  readonly e: EntryKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStamp(state: unknown): Stamp | null {
  if (!isRecord(state)) return null;
  const raw = state[STAMP_FIELD];
  if (!isRecord(raw)) return null;
  const { k, t, e } = raw;
  return typeof k === "string" && typeof t === "string" && typeof e === "string" ? { k, t, e } : null;
}

export function withStamp(data: unknown, stamp: Stamp): Record<string, unknown> {
  const base = isRecord(data) ? data : {};
  return { ...base, [STAMP_FIELD]: { k: stamp.k, t: stamp.t, e: stamp.e } };
}

// ─── Browser history mirror (§7.3) ───────────────────────────────────────────

export interface MirrorIO {
  load(): unknown;
  save(snapshot: { readonly items: readonly Stamp[]; readonly pos: number }): void;
}

/** sessionStorage-backed mirror storage; failures degrade to memory only. */
export function sessionMirrorIO(): MirrorIO {
  return {
    load() {
      try {
        const raw = window.sessionStorage.getItem(MIRROR_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        return null;
      }
    },
    save(snapshot) {
      try {
        window.sessionStorage.setItem(MIRROR_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // Memory only.
      }
    },
  };
}

export class BrowserHistoryMirror {
  private items: Stamp[] = [];
  private pos = -1;
  private readonly io: MirrorIO | null;

  constructor(io: MirrorIO | null = null) {
    this.io = io;
  }

  load(): void {
    const raw = this.io?.load();
    if (!isRecord(raw) || !Array.isArray(raw.items)) {
      this.items = [];
      this.pos = -1;
      return;
    }
    const items: Stamp[] = [];
    for (const value of raw.items) {
      const stamp = readStamp({ [STAMP_FIELD]: value });
      if (stamp) items.push(stamp);
    }
    this.items = items.slice(-MIRROR_CAP);
    const pos = typeof raw.pos === "number" && Number.isInteger(raw.pos) ? raw.pos - (items.length - this.items.length) : -1;
    this.pos = this.items.length === 0 ? -1 : Math.min(Math.max(pos, 0), this.items.length - 1);
  }

  snapshot(): { readonly items: readonly Stamp[]; readonly pos: number } {
    return { items: this.items.slice(), pos: this.pos };
  }

  current(): Stamp | null {
    return this.items[this.pos] ?? null;
  }

  private save(): void {
    this.io?.save({ items: this.items, pos: this.pos });
  }

  push(stamp: Stamp): void {
    this.items = this.items.slice(0, this.pos + 1);
    this.items.push(stamp);
    if (this.items.length > MIRROR_CAP) this.items = this.items.slice(this.items.length - MIRROR_CAP);
    this.pos = this.items.length - 1;
    this.save();
  }

  replace(stamp: Stamp): void {
    if (this.pos < 0) {
      this.reset(stamp);
      return;
    }
    this.items[this.pos] = stamp;
    this.save();
  }

  /** After a popstate: move to the stamp's position, or restart the mirror from it. */
  locate(stamp: Stamp): boolean {
    const index = this.items.findIndex((item) => item.k === stamp.k);
    if (index < 0) {
      this.reset(stamp);
      return false;
    }
    this.pos = index;
    this.items[index] = stamp;
    this.save();
    return true;
  }

  reset(stamp: Stamp): void {
    this.items = [stamp];
    this.pos = 0;
    this.save();
  }

  /** On bind: keep the mirror only when it still points at the current browser entry. */
  validate(currentBrowserKey: string | null, stamp: Stamp): void {
    if (currentBrowserKey !== null && this.current()?.k === currentBrowserKey) this.replace(stamp);
    else this.reset(stamp);
  }

  /**
   * Signed `history.go` distance from the current browser entry to the tab entry at the end of
   * `path` (entry keys in traversal order, nearest first), or 0 when real history can't get
   * there exactly. Duplicate browser entries of the same tab entry (`?dialogs=`, hash changes)
   * are skipped; going back lands on the earliest duplicate so dialogs don't reopen.
   */
  deltaTo(tabId: TabId, currentEntryKey: EntryKey, path: readonly EntryKey[], dir: -1 | 1): number {
    if (path.length === 0) return 0;
    const items = this.items;
    const n = items.length;
    const cur = items[this.pos];
    if (!cur || cur.t !== tabId || cur.e !== currentEntryKey) return 0;
    const same = (i: number, key: EntryKey) => i >= 0 && i < n && items[i].t === tabId && items[i].e === key;
    let i = this.pos;
    while (same(i + dir, currentEntryKey)) i += dir;
    i += dir;
    for (let step = 0; step < path.length; step++) {
      const key = path[step];
      if (!same(i, key)) return 0;
      const runStart = i;
      let runEnd = i;
      while (same(runEnd + dir, key)) runEnd += dir;
      if (step === path.length - 1) return (dir < 0 ? runEnd : runStart) - this.pos;
      i = runEnd + dir;
    }
    return 0;
  }
}

// ─── Bridge runtime (§7.4–7.7) ───────────────────────────────────────────────

interface NavIntentBase {
  readonly tabId: TabId;
  readonly entryKey: EntryKey;
  readonly key: UrlKey;
  readonly expiresAt: number;
  /** The router call that carries the navigation, used when it has to be dispatched again. */
  readonly nav: "push" | "replace";
  /** Re-dispatches so far (see `redispatch`). */
  readonly attempts?: number;
}

export type NavIntent =
  | (NavIntentBase & { readonly kind: "activate" })
  | (NavIntentBase & { readonly kind: "traverse"; readonly toIndex: number });

export interface BridgeHost {
  getState(): TabsSnapshot;
  /** Replaces the snapshot synchronously (subscribers are notified later). */
  setState(next: TabsSnapshot): void;
  now(): number;
  readonly ids: IdGen;
  /** Folds the tracked scroll offset of the rendered entry into the snapshot. */
  captureScroll(): void;
  restoreScroll(entryKey: EntryKey, samePathname: boolean): void;
  skipTransition(): void;
  /** A URL change was committed to `entryKey` (browsing history). */
  onCommittedEntry(tabId: TabId, entryKey: EntryKey): void;
  runQueuedTraversal(dir: -1 | 1): void;
  /** Dispatches a router navigation again (a superseded intent); must not change the intent. */
  renavigate(url: TabUrl, mode: "push" | "replace"): void;
  warn(message: string): void;
}

export interface HistoryBridge {
  /** Ref-counted install; returns a once-only release. */
  install(): () => void;
  isInstalled(): boolean;
  readonly mirror: BrowserHistoryMirror;
  getIntent(): NavIntent | null;
  setIntent(intent: NavIntent | null): void;
  /** Stamps the current browser entry (replaceState without a URL: no router dispatch). */
  stampCurrentEntry(tabId: TabId, entryKey: EntryKey, opts?: { validateMirror?: boolean }): void;
  go(delta: number): void;
  isTraversalInFlight(): boolean;
  queueTraversal(dir: -1 | 1): void;
  assertInSync(href: string): void;
}

type HistoryWrite = (data: unknown, unused: string, url?: string | URL | null) => void;

/** Next's app router entries carry `__NA`; a popstate onto state without it forces a reload. */
function canStamp(state: unknown): boolean {
  return isRecord(state) && state.__NA === true;
}

/**
 * Whether a history write that keeps the current URL ends a router navigation still in flight.
 * Next's patched pushState / replaceState dispatch ACTION_RESTORE for a foreign write with a URL,
 * and dispatching a RESTORE (or NAVIGATE) discards the pending navigation (app-router.js,
 * app-router-instance.js dispatchAction). An `__NA` write is Next committing a newer navigation to
 * this URL, which superseded the pending one the same way. `_N` data and URL-less writes pass
 * through Next untouched.
 */
function endsPendingNavigation(data: unknown, url: string | URL | null | undefined): boolean {
  if (isRecord(data) && data.__NA) return true;
  if (isRecord(data) && data._N) return false;
  return url != null && String(url) !== "";
}

export function createHistoryBridge(host: BridgeHost): HistoryBridge {
  const mirror = new BrowserHistoryMirror(typeof window === "undefined" ? null : sessionMirrorIO());
  let intent: NavIntent | null = null;
  let traversalInFlight = false;
  let traversalTimer: ReturnType<typeof setTimeout> | undefined;
  let queued: -1 | 1 | null = null;
  let internalWrites = 0;
  let installation: { uninstall(): void } | null = null;
  let refCount = 0;

  function endTraversal(): void {
    traversalInFlight = false;
    if (traversalTimer !== undefined) clearTimeout(traversalTimer);
    traversalTimer = undefined;
  }

  /** Drops an expired intent; the highlight reverts to the rendered tab. */
  function expireIntent(): void {
    if (!intent || host.now() < intent.expiresAt) return;
    intent = null;
    const st = host.getState();
    if (st.activeTabId) host.setState(setPending(setRequested(st, st.activeTabId), []));
  }

  function newStamp(kind: "push" | "replace", tabId: TabId, entryKey: EntryKey): Stamp {
    const reuse = kind === "replace" ? readStamp(window.history.state)?.k : undefined;
    return { k: reuse ?? host.ids.stamp(), t: tabId, e: entryKey };
  }

  function writeStamp(stamp: Stamp): void {
    if (!canStamp(window.history.state)) return;
    internalWrites++;
    try {
      window.history.replaceState(withStamp(window.history.state, stamp), "");
    } finally {
      internalWrites--;
    }
  }

  function stampCurrentEntry(tabId: TabId, entryKey: EntryKey, opts?: { validateMirror?: boolean }): void {
    if (typeof window === "undefined" || !canStamp(window.history.state)) return;
    const existing = readStamp(window.history.state);
    const stamp: Stamp = { k: existing?.k ?? host.ids.stamp(), t: tabId, e: entryKey };
    if (opts?.validateMirror) mirror.validate(existing?.k ?? null, stamp);
    else mirror.replace(stamp);
    writeStamp(stamp);
  }

  /** Commits the pending intent onto `nextUrl`; null when its tab or entry vanished. */
  function commitIntent(current: NavIntent, kind: "push" | "replace", nextUrl: TabUrl, samePathname: boolean): Stamp | null {
    let st = host.getState();
    const tab = findTab(st, current.tabId);
    const index = tab ? tab.history.entries.findIndex((entry) => entry.key === current.entryKey) : -1;
    intent = null;
    if (!tab || index < 0) return null;
    const entry = tab.history.entries[index];
    st = setIndex(st, tab.id, index);
    if (entry.url !== nextUrl) st = patchEntryUrl(st, entry.key, nextUrl);
    st = setPending(commitActivation(st, tab.id, host.now()), []);
    host.setState(st);
    host.onCommittedEntry(tab.id, entry.key);
    host.restoreScroll(entry.key, samePathname);
    return newStamp(kind, tab.id, entry.key);
  }

  /**
   * The navigation carrying `superseded` was discarded by a same-URL write (a dialog's `?dialogs=`
   * sync, a page's same-URL router.replace) and will never commit, which would leave the highlight
   * and spinner on a tab that is not rendered. Dispatch it again once that write has settled.
   */
  function redispatch(superseded: NavIntent): void {
    const attempts = (superseded.attempts ?? 0) + 1;
    if (attempts > MAX_REDISPATCH) return;
    const retry: NavIntent = { ...superseded, attempts, expiresAt: host.now() + INTENT_TTL_MS };
    intent = retry;
    queueMicrotask(() => {
      if (intent !== retry || !installation) return;
      const tab = findTab(host.getState(), retry.tabId);
      const entry = tab?.history.entries.find((candidate) => candidate.key === retry.entryKey);
      if (entry) host.renavigate(entry.url, retry.nav);
    });
  }

  function onWrite(
    kind: "push" | "replace",
    data: unknown,
    unused: string,
    url: string | URL | null | undefined,
    orig: HistoryWrite,
    token: { active: boolean },
  ): void {
    const call = (payload: unknown) => orig.call(window.history, payload, unused, url);
    if (!token.active || internalWrites > 0) return call(data);
    const state = host.getState();
    if (state.status !== "ready") return call(data);
    const cur = canonicalizeUrl(window.location.href);
    const next = canonicalizeUrl(url == null ? window.location.href : String(url));
    // /choose, /store, /login…: the shell is about to unmount; leave the model alone.
    if (!next || !next.tabbable) return call(data);
    expireIntent();

    // A) Same UrlKey: ?dialogs=, hash, router.refresh, a same-URL push Next turned into a replace.
    if (cur && next.key === cur.key) {
      let stamp: Stamp | null = null;
      let superseded: NavIntent | null = null;
      if (intent && intent.key === next.key) stamp = commitIntent(intent, kind, next.url, true);
      else if (intent && endsPendingNavigation(data, url)) superseded = intent;
      if (!stamp) {
        let st = host.getState();
        const active = findTab(st, st.activeTabId);
        if (!intent && st.pendingTabIds.length > 0) {
          st = setPending(st, []);
          host.setState(st);
        }
        if (active) stamp = newStamp(kind, active.id, currentEntry(active).key);
      }
      if (stamp) {
        if (kind === "push") mirror.push(stamp);
        else mirror.replace(stamp);
      }
      call(stamp ? withStamp(data, stamp) : data);
      if (superseded) redispatch(superseded);
      return;
    }

    // B) Real URL change.
    host.captureScroll();
    const samePathname = cur?.pathname === next.pathname;
    let stamp: Stamp | null = null;
    if (intent && intent.key === next.key) stamp = commitIntent(intent, kind, next.url, samePathname);
    if (!stamp) {
      let st = host.getState();
      const tabId = st.activeTabId;
      // DETACHED: the dying page wrote this; the successor's intent stays armed.
      if (!tabId) return call(data);
      intent = null;
      const route = matchRoute(next.pathname);
      let entryKey: EntryKey;
      if (kind === "replace" && route?.kind === "gate") {
        st = setGate(st, tabId, next.url);
        entryKey = currentEntry(findTab(st, tabId) as NonNullable<ReturnType<typeof findTab>>).key;
      } else {
        st = clearGate(st);
        const result = kind === "push"
          ? pushEntry(st, tabId, next.url, host.now(), host.ids)
          : replaceEntry(st, tabId, next.url, host.now(), host.ids);
        st = result.state;
        const tab = findTab(st, tabId);
        entryKey = result.entry?.key ?? (tab ? currentEntry(tab).key : "");
      }
      st = setPending(setRequested(st, tabId), []);
      host.setState(st);
      if (entryKey) host.onCommittedEntry(tabId, entryKey);
      stamp = newStamp(kind, tabId, entryKey);
    }
    if (kind === "push") mirror.push(stamp);
    else mirror.replace(stamp);
    return call(withStamp(data, stamp));
  }

  function onPopState(event: PopStateEvent): void {
    let st = host.getState();
    if (st.status !== "ready") return;
    const loc = canonicalizeUrl(window.location.href);
    if (!loc || !loc.tabbable) return;
    intent = null;
    endTraversal();
    const now = host.now();
    const prev = findTab(st, st.activeTabId);
    const prevUrl = prev ? (st.gate?.tabId === prev.id ? st.gate.url : currentEntry(prev).url) : null;
    const urlChanged = prevUrl === null || urlKeyOf(prevUrl) !== loc.key;
    const samePathname = prevUrl !== null && pathnameOf(prevUrl) === loc.pathname;
    const stamp = readStamp(event.state);
    const hit = stamp ? findByEntryKey(st, stamp.e) : null;

    if (stamp && hit && hit.tab.id === stamp.t) {
      mirror.locate(stamp);
      if (urlChanged) host.captureScroll();
      st = host.getState();
      const entry = hit.tab.history.entries[hit.index];
      if (entry.url !== loc.url && urlKeyOf(entry.url) === loc.key) st = patchEntryUrl(st, entry.key, loc.url);
      const tabChanged = st.activeTabId !== hit.tab.id;
      st = setIndex(clearGate(st), hit.tab.id, hit.index);
      if (matchRoute(loc.pathname)?.kind === "gate" && urlKeyOf(entry.url) !== loc.key) st = setGate(commitActivation(st, hit.tab.id, now), hit.tab.id, loc.url);
      else st = commitActivation(st, hit.tab.id, now);
      st = setPending(st, urlChanged ? [hit.tab.id] : []);
      if (tabChanged) host.skipTransition();
      host.setState(st);
      if (urlChanged) {
        host.onCommittedEntry(hit.tab.id, entry.key);
        host.restoreScroll(entry.key, samePathname);
      }
    } else {
      // An entry from before the shell, from a closed tab, or unknown: adopt it into the active tab.
      const tabId = st.activeTabId ?? st.requestedTabId ?? st.tabs[0]?.id;
      if (!tabId) return;
      if (urlChanged) host.captureScroll();
      st = commitActivation(clearGate(host.getState()), tabId, now);
      const tab = findTab(st, tabId);
      if (!tab) return;
      let entryKey = currentEntry(tab).key;
      if (urlKeyOf(currentEntry(tab).url) === loc.key) {
        st = patchEntryUrl(st, entryKey, loc.url);
      } else if (matchRoute(loc.pathname)?.kind === "gate") {
        st = setGate(st, tabId, loc.url);
      } else {
        const result = pushEntry(st, tabId, loc.url, now, host.ids);
        st = result.state;
        entryKey = result.entry?.key ?? entryKey;
      }
      st = setPending(st, urlChanged ? [tabId] : []);
      host.setState(st);
      const adopted: Stamp = { k: host.ids.stamp(), t: tabId, e: entryKey };
      mirror.reset(adopted);
      writeStamp(adopted);
      if (urlChanged) host.onCommittedEntry(tabId, entryKey);
    }

    if (queued !== null) {
      const dir = queued;
      queued = null;
      host.runQueuedTraversal(dir);
    }
  }

  function install(): () => void {
    refCount++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      refCount = Math.max(0, refCount - 1);
      if (refCount === 0 && installation) {
        installation.uninstall();
        installation = null;
      }
    };
    if (installation || typeof window === "undefined") return release;

    const h = window.history;
    const origPush = h.pushState as HistoryWrite;
    const origReplace = h.replaceState as HistoryWrite;
    const token = { active: true };
    const pushWrapper = function pushState(data: unknown, unused: string, url?: string | URL | null) {
      onWrite("push", data, unused, url, origPush, token);
    };
    const replaceWrapper = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
      onWrite("replace", data, unused, url, origReplace, token);
    };
    h.pushState = pushWrapper;
    h.replaceState = replaceWrapper;
    // Registered after Next's own listener, so Next's traverse is already dispatched.
    const onPop = (event: PopStateEvent) => {
      if (token.active) onPopState(event);
    };
    window.addEventListener("popstate", onPop);
    let previousRestoration: ScrollRestoration = "auto";
    try {
      previousRestoration = h.scrollRestoration;
      h.scrollRestoration = "manual";
    } catch {
      // Not supported: the shell's own restore still runs.
    }
    mirror.load();

    installation = {
      uninstall() {
        // Restore the originals when ours are still the globals; otherwise a later wrapper
        // captured ours, so ours only passes through from now on.
        token.active = false;
        if (h.pushState === pushWrapper) h.pushState = origPush;
        if (h.replaceState === replaceWrapper) h.replaceState = origReplace;
        window.removeEventListener("popstate", onPop);
        try {
          h.scrollRestoration = previousRestoration;
        } catch {
          // Ignore.
        }
        intent = null;
        queued = null;
        endTraversal();
      },
    };
    return release;
  }

  function assertInSync(href: string): void {
    if (!installation) return;
    let st = host.getState();
    if (st.status !== "ready" || traversalInFlight) return;
    if (intent) {
      if (host.now() < intent.expiresAt) return;
      expireIntent();
      st = host.getState();
    }
    const loc = canonicalizeUrl(href);
    if (!loc || !loc.tabbable) return;
    const now = host.now();
    let tab = findTab(st, st.activeTabId);
    if (!tab) {
      // DETACHED without a live intent: settle on the highlighted tab.
      const target = findTab(st, st.requestedTabId) ?? st.tabs[0];
      if (!target) return;
      st = commitActivation(st, target.id, now);
      tab = findTab(st, target.id);
      if (!tab) return;
    }
    const entry = currentEntry(tab);
    const inSync = urlKeyOf(entry.url) === loc.key || (st.gate?.tabId === tab.id && urlKeyOf(st.gate.url) === loc.key);
    if (inSync) {
      if (st !== host.getState()) host.setState(st);
      return;
    }
    host.warn(`[browser-shell] URL drifted from the tab model; recording ${loc.url} as a replace`);
    let entryKey = entry.key;
    if (matchRoute(loc.pathname)?.kind === "gate") {
      st = setGate(st, tab.id, loc.url);
    } else {
      st = clearGate(st);
      const result = replaceEntry(st, tab.id, loc.url, now, host.ids);
      st = result.state;
      entryKey = result.entry?.key ?? entryKey;
    }
    st = setPending(setRequested(st, tab.id), []);
    host.setState(st);
    stampCurrentEntry(tab.id, entryKey);
    host.onCommittedEntry(tab.id, entryKey);
  }

  return {
    install,
    isInstalled: () => installation !== null,
    mirror,
    getIntent: () => intent,
    setIntent(next) {
      intent = next;
    },
    stampCurrentEntry,
    go(delta) {
      if (delta === 0 || typeof window === "undefined") return;
      traversalInFlight = true;
      if (traversalTimer !== undefined) clearTimeout(traversalTimer);
      traversalTimer = setTimeout(() => {
        traversalInFlight = false;
        traversalTimer = undefined;
        queued = null;
      }, TRAVERSAL_TIMEOUT_MS);
      window.history.go(delta);
    },
    isTraversalInFlight: () => traversalInFlight,
    queueTraversal(dir) {
      queued = dir;
    },
    assertInSync,
  };
}
