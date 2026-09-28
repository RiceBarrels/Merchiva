import { toast } from "sonner";
import { skipNextPageTransition } from "@/components/page-tabs";
import { getAppMode } from "@/lib/app-mode";
import { getRouteAccess } from "./access";
import { recordBrowsingVisit, updateBrowsingHistoryTitle } from "./browsing-history";
import { createHistoryBridge, readStamp } from "./history-bridge";
import {
  IDLE_SNAPSHOT,
  applyAccess,
  bumpMountNonce,
  commitActivation,
  createIdGen,
  createTab,
  duplicate,
  findByEntryKey,
  findByUrlKey,
  findTab,
  insertTab,
  patchEntryUrl,
  pathnameOf,
  removeTab,
  reorder,
  replaceEntry,
  restoreClosed,
  setEntryScroll,
  setEntryTitle,
  setGate,
  setIndex,
  setPending,
  setPinned,
  setRequested,
  urlKeyOf,
} from "./model";
import {
  consumeBootIntent,
  hasAuthUserRecord,
  loadPersisted,
  purgeTabStateForUser,
  sanitize,
  savePersisted,
  writeBootIntent,
  type SanitizedTabs,
  type TabsScope,
} from "./persistence";
import { matchRoute, resolveLegacyRedirect, titleForUrl } from "./routes";
import {
  BOOT_RESTORE_TIMEOUT_MS,
  cancelScrollRestore,
  configureScrollTracking,
  scheduleScrollRestore,
  trackedScrollOf,
  type ScrollRestoreOptions,
} from "./scroll";
import { closeTopDialog } from "./shell-dom";
import { canonicalizeUrl, stripVolatileParams, type CanonicalUrl } from "./url";
import {
  HOME_URL,
  INTENT_TTL_MS,
  LAUNCH_PATHS,
  MANAGER_ALIAS_PATH,
  MAX_TABS,
  NEW_TAB_URL,
  currentEntry,
  type AccessContext,
  type BrowserTab,
  type EntryKey,
  type HistoryEntry,
  type OpenDisposition,
  type OpenTabOptions,
  type OpenTabResult,
  type ShellCommand,
  type TabActions,
  type TabId,
  type TabUrl,
  type TabsSnapshot,
} from "./types";

/*
 * The tab store (tab-state spec §4, §7–9, §16). A module-level external store read through
 * useSyncExternalStore: the history bridge must read and update state synchronously inside
 * pushState / replaceState / popstate, and the link interceptor, shortcuts and Android back
 * run outside React. Snapshots are replaced synchronously; subscribers are notified in a
 * microtask (Next's HistoryUpdater writes history inside useInsertionEffect, where React
 * forbids scheduling updates).
 */

export interface ShellRouter {
  push(href: string, opts?: { scroll?: boolean }): void;
  replace(href: string, opts?: { scroll?: boolean }): void;
}

export interface BindInput {
  readonly scope: TabsScope;
  readonly router: ShellRouter;
}

interface Runtime {
  readonly scope: TabsScope;
  router: ShellRouter;
  refs: number;
  teardownTimer: ReturnType<typeof setTimeout> | undefined;
  releaseBridge: () => void;
  removeLifecycle: () => void;
}

const SAVE_DEBOUNCE_MS = 250;
const PENDING_TIMEOUT_MS = 10_000;

const NO_SHELL_RESULT: OpenTabResult = Object.freeze({ ok: false, reason: "noShell" });
const NOT_TABBABLE_RESULT: OpenTabResult = Object.freeze({ ok: false, reason: "notTabbable" });
const LIMIT_RESULT: OpenTabResult = Object.freeze({ ok: false, reason: "limit" });

let clock: () => number = () => Date.now();
const ids = createIdGen();
let state: TabsSnapshot = IDLE_SNAPSHOT;
const listeners = new Set<() => void>();
let notifyQueued = false;
let runtime: Runtime | null = null;
let accessContext: AccessContext | null = null;
let accessQueued = false;
let translate: (key: string) => string = (key) => key;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
/** The user signed out under the bound shell, or state was purged: nothing is written until a fresh bind. */
let persistenceBlocked = false;
/** A signed-in user record existed when this scope was bound (so its absence later means sign-out). */
let authUserAtBind = false;

// ─── State plumbing ──────────────────────────────────────────────────────────

function queueNotify(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const listener of Array.from(listeners)) listener();
  });
}

function syncPendingTimer(): void {
  if (pendingTimer !== undefined) {
    clearTimeout(pendingTimer);
    pendingTimer = undefined;
  }
  if (state.pendingTabIds.length === 0 || runtime === null) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = undefined;
    if (state.pendingTabIds.length > 0) commit(setPending(state, []), { save: false });
  }, PENDING_TIMEOUT_MS);
}

function commit(next: TabsSnapshot, opts?: { save?: boolean }): void {
  if (next === state) return;
  const pendingChanged = next.pendingTabIds !== state.pendingTabIds;
  state = next;
  if (pendingChanged) syncPendingTimer();
  queueNotify();
  if (opts?.save !== false) scheduleSave();
}

function isReady(): boolean {
  return runtime !== null && state.status === "ready";
}

/** The entry whose page is rendered (null while detached, idle or gated). */
function renderedEntry(): { tab: BrowserTab; entry: HistoryEntry } | null {
  const tab = findTab(state, state.activeTabId);
  if (!tab || state.gate?.tabId === tab.id) return null;
  return { tab, entry: currentEntry(tab) };
}

function captureScroll(): void {
  const rendered = renderedEntry();
  if (!rendered) return;
  const y = trackedScrollOf(rendered.entry.key);
  if (y === undefined) return;
  commit(setEntryScroll(state, rendered.entry.key, y));
}

function restoreScrollFor(entryKey: EntryKey, reuseRoot: boolean, opts?: ScrollRestoreOptions): void {
  const hit = findByEntryKey(state, entryKey);
  const stored = hit ? hit.tab.history.entries[hit.index].scrollY : undefined;
  scheduleScrollRestore(trackedScrollOf(entryKey) ?? stored, reuseRoot, { ...opts, tabId: hit?.tab.id });
}

function recordVisit(tabId: TabId, entryKey: EntryKey): void {
  const rt = runtime;
  if (!rt || state.gate?.tabId === tabId || !persistenceAllowed()) return;
  const hit = findByEntryKey(state, entryKey);
  if (!hit) return;
  const entry = hit.tab.history.entries[hit.index];
  const pathname = pathnameOf(entry.url);
  const route = matchRoute(pathname);
  if (pathname === NEW_TAB_URL || route?.persist === false || route?.kind === "gate") return;
  recordBrowsingVisit(rt.scope, stripVolatileParams(entry.url), titleForUrl(entry.url, entry.title, translate), clock());
}

function warn(message: string): void {
  if (process.env.NODE_ENV !== "production") console.warn(message);
}

const bridge = createHistoryBridge({
  getState: () => state,
  setState: (next) => commit(next),
  now: () => clock(),
  ids,
  captureScroll,
  restoreScroll: restoreScrollFor,
  skipTransition: () => skipNextPageTransition(),
  onCommittedEntry: recordVisit,
  runQueuedTraversal: (dir) => (dir < 0 ? goBack() : goForward()),
  renavigate: (url, mode) => {
    const rt = runtime;
    if (!rt) return;
    skipNextPageTransition();
    if (mode === "replace") rt.router.replace(url, { scroll: false });
    else rt.router.push(url, { scroll: false });
  },
  warn,
});

// ─── Persistence ─────────────────────────────────────────────────────────────

function documentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function blockPersistence(): void {
  persistenceBlocked = true;
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = undefined;
}

/**
 * False once the user signed out under the bound shell. Sign-out (lib/auth/context.tsx) wipes both
 * storages before the shell unmounts, so the teardown and pagehide flushes must not write the
 * previous user's tabs, titles and scroll offsets back on a shared device (§16.7, D26). The signal
 * is the auth user record that existed at bind being gone; purgeForSignOut blocks explicitly.
 */
function persistenceAllowed(): boolean {
  if (!runtime || persistenceBlocked) return false;
  if (authUserAtBind && hasAuthUserRecord() === false) {
    blockPersistence();
    return false;
  }
  return true;
}

function saveNow(local: boolean): void {
  const rt = runtime;
  if (!rt || !persistenceAllowed()) return;
  savePersisted(rt.scope, state, { local, now: clock(), scrollOf: trackedScrollOf });
}

function scheduleSave(): void {
  if (!runtime || persistenceBlocked || state.status !== "ready") return;
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    saveNow(documentVisible());
  }, SAVE_DEBOUNCE_MS);
}

function flushSave(): void {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  saveNow(true);
}

function installLifecycle(): () => void {
  const onPageHide = () => flushSave();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushSave();
  };
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

// ─── Access (tab-state §9.3) ─────────────────────────────────────────────────

function applyAccessNow(protectEntryKey: EntryKey | null): void {
  const ctx = accessContext;
  if (!ctx || !isReady()) return;
  commit(applyAccess(state, (url) => getRouteAccess(url, ctx), { protectEntryKey }));
}

function setAccess(ctx: AccessContext | null): void {
  if (ctx === accessContext) return;
  accessContext = ctx;
  if (!isReady() || accessQueued) return;
  accessQueued = true;
  queueMicrotask(() => {
    accessQueued = false;
    applyAccessNow(null);
  });
}

// ─── Boot (tab-state §9.2) ───────────────────────────────────────────────────

function navigationType(): string {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.type ?? "navigate";
  } catch {
    return "navigate";
  }
}

interface BootResult {
  readonly state: TabsSnapshot;
  /** Restore navigation (launch path, org switch): router.replace to this tab entry. */
  readonly navigate: { readonly tabId: TabId; readonly entry: HistoryEntry } | null;
  /** The boot URL's own entry is never removed by access validation. */
  readonly protectEntryKey: EntryKey | null;
}

function bootState(sanitized: SanitizedTabs | null, scope: TabsScope, now: number, orgIntent: boolean): BootResult {
  const base: TabsSnapshot = { ...IDLE_SNAPSHOT, status: "ready", scope: { userId: scope.userId, organizationId: scope.organizationId } };
  const boot = canonicalizeUrl(window.location.href);
  /** What the browser really shows; null when it is not a tab URL, so it matches no entry. */
  const locationKey = boot?.tabbable ? boot.key : null;
  const locationPathname = boot?.tabbable ? boot.pathname : null;
  // "/manager" is only an alias for the home page: resolving it here keeps it out of every tab
  // URL, entry and persisted key (routes.ts LEGACY_REDIRECTS, persistence.ts cleanUrl), whatever
  // the device's app mode is.
  const bootUrl: TabUrl = resolveLegacyRedirect(boot?.tabbable ? boot.url : NEW_TAB_URL);
  const bootKey = urlKeyOf(bootUrl);
  const bootPathname = pathnameOf(bootUrl);
  const bootIsGate = matchRoute(bootPathname)?.kind === "gate";
  const aliasBoot = locationPathname === MANAGER_ALIAS_PATH;
  // A store / personal device on the alias is about to be sent to its own surface by
  // app/manager/page.tsx: keep its tabs as they are and never navigate (two replaces racing would
  // drop the restored session).
  const leavingManager = aliasBoot && getAppMode() !== "admin";
  // App launch (LAUNCH_PATHS): the alias, or the bare home page — where /choose, "Switch to
  // manager mode" and every post-login redirect land. A launch restores the last session instead
  // of taking the deep-link path below, which would append one more home tab each time. A home
  // URL carrying a query (`?q=` from openNewTabPage) stays a deep link and opens its own tab.
  const launch = locationPathname !== null && LAUNCH_PATHS.has(locationPathname) && !leavingManager
    && (aliasBoot || bootUrl === HOME_URL);
  /** True when the browser already shows this entry, so no replace is needed. */
  const showsEntry = (entry: HistoryEntry): boolean => locationKey !== null && urlKeyOf(entry.url) === locationKey;

  if (!sanitized) {
    const tab = createTab(bootUrl, now, ids);
    const entry = tab.history.entries[0];
    return {
      state: { ...base, tabs: [tab], activeTabId: tab.id, requestedTabId: tab.id },
      navigate: leavingManager || showsEntry(entry) ? null : { tabId: tab.id, entry },
      protectEntryKey: entry.key,
    };
  }

  let st: TabsSnapshot = {
    ...base,
    tabs: sanitized.tabs,
    closed: sanitized.closed,
    activeTabId: sanitized.activeTabId,
    requestedTabId: sanitized.activeTabId,
  };
  const active = findTab(st, sanitized.activeTabId) ?? st.tabs[0];
  const stamp = readStamp(window.history.state);
  const hit = stamp ? findByEntryKey(st, stamp.e) : null;
  const stampHit = stamp !== null && hit !== null && hit.tab.id === stamp.t ? hit : null;

  // Reload / bfcache / back into the app: the browser entry says which tab entry it is.
  // The "/manager" alias skips this: no tab entry is ever that URL, so it is restored below.
  if (stampHit && !aliasBoot) {
    const entry = stampHit.tab.history.entries[stampHit.index];
    st = setIndex(st, stampHit.tab.id, stampHit.index);
    if (bootIsGate && urlKeyOf(entry.url) !== bootKey) st = setGate(commitActivation(st, stampHit.tab.id, now), stampHit.tab.id, bootUrl);
    else st = commitActivation(patchEntryUrl(st, entry.key, bootUrl), stampHit.tab.id, now);
    return { state: st, navigate: null, protectEntryKey: entry.key };
  }

  const activeEntry = currentEntry(active);
  if (bootIsGate) {
    st = setGate(commitActivation(st, active.id, now), active.id, bootUrl);
    return { state: st, navigate: null, protectEntryKey: activeEntry.key };
  }

  // Org switch: restore the target org's active tab.
  if (orgIntent) {
    st = commitActivation(st, active.id, now);
    return { state: st, navigate: showsEntry(activeEntry) ? null : { tabId: active.id, entry: activeEntry }, protectEntryKey: activeEntry.key };
  }

  if (navigationType() === "reload" && showsEntry(activeEntry)) {
    return { state: commitActivation(st, active.id, now), navigate: null, protectEntryKey: activeEntry.key };
  }

  // App launch → restore the session, replacing the launch URL with the active tab's entry
  // (skipped when the browser already shows it, e.g. the home tab was the active one).
  if (launch) {
    st = commitActivation(st, active.id, now);
    return { state: st, navigate: showsEntry(activeEntry) ? null : { tabId: active.id, entry: activeEntry }, protectEntryKey: activeEntry.key };
  }

  // Store / personal device on the alias: the index page owns the redirect, so touch nothing.
  if (leavingManager) {
    return { state: commitActivation(st, active.id, now), navigate: null, protectEntryKey: activeEntry.key };
  }

  // Deep link (bookmark, login ?next=, notification): reuse or add a tab.
  const existing = findByUrlKey(st, bootKey);
  if (existing) {
    const entry = currentEntry(existing);
    st = commitActivation(patchEntryUrl(st, entry.key, bootUrl), existing.id, now);
    return { state: st, navigate: null, protectEntryKey: entry.key };
  }
  if (st.tabs.length < MAX_TABS) {
    const tab = createTab(bootUrl, now, ids);
    st = commitActivation(insertTab(st, tab, "end", null), tab.id, now);
    return { state: st, navigate: null, protectEntryKey: tab.history.entries[0].key };
  }
  const replaced = replaceEntry(st, active.id, bootUrl, now, ids);
  st = commitActivation(replaced.state, active.id, now);
  return { state: st, navigate: null, protectEntryKey: replaced.entry?.key ?? null };
}

// ─── Bind / teardown ─────────────────────────────────────────────────────────

function sameScope(a: TabsScope, b: TabsScope): boolean {
  return a.userId === b.userId && a.organizationId === b.organizationId;
}

function teardown(): void {
  const rt = runtime;
  if (!rt) return;
  if (rt.teardownTimer !== undefined) clearTimeout(rt.teardownTimer);
  flushSave();
  rt.removeLifecycle();
  rt.releaseBridge();
  cancelScrollRestore();
  configureScrollTracking(null);
  if (pendingTimer !== undefined) clearTimeout(pendingTimer);
  pendingTimer = undefined;
  accessQueued = false;
  runtime = null;
  state = IDLE_SNAPSHOT;
  queueNotify();
}

function makeRelease(rt: Runtime): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    rt.refs = Math.max(0, rt.refs - 1);
    if (rt.refs > 0 || runtime !== rt) return;
    // Deferred so a StrictMode remount (or a re-render with a new router object) re-binds
    // without flushing, unwrapping history and re-hydrating.
    rt.teardownTimer = setTimeout(() => {
      rt.teardownTimer = undefined;
      if (runtime === rt && rt.refs === 0) teardown();
    }, 0);
  };
}

/**
 * Binds the store to a user + org scope and the Next router: hydrates, applies the boot policy,
 * installs the history bridge. Ref-counted per scope; a different scope flushes and re-binds.
 */
function bind(input: BindInput): () => void {
  if (typeof window === "undefined") return () => {};
  if (runtime && sameScope(runtime.scope, input.scope)) {
    runtime.refs++;
    runtime.router = input.router;
    if (runtime.teardownTimer !== undefined) {
      clearTimeout(runtime.teardownTimer);
      runtime.teardownTimer = undefined;
    }
    return makeRelease(runtime);
  }
  if (runtime) teardown();
  persistenceBlocked = false;
  authUserAtBind = hasAuthUserRecord() === true;

  const now = clock();
  const sanitized = sanitize(loadPersisted(input.scope), now, { ids });
  const orgIntent = consumeBootIntent(input.scope.organizationId, now);
  const rt: Runtime = {
    scope: input.scope,
    router: input.router,
    refs: 1,
    teardownTimer: undefined,
    releaseBridge: () => {},
    removeLifecycle: () => {},
  };
  runtime = rt;
  const boot = bootState(sanitized, input.scope, now, orgIntent);
  state = boot.state;
  configureScrollTracking(() => renderedEntry()?.entry.key ?? null);
  rt.releaseBridge = bridge.install();

  const active = findTab(state, state.activeTabId);
  if (active) bridge.stampCurrentEntry(active.id, currentEntry(active).key, { validateMirror: true });
  applyAccessNow(boot.protectEntryKey);
  rt.removeLifecycle = installLifecycle();
  queueNotify();
  scheduleSave();

  if (boot.navigate) {
    const { tabId, entry } = boot.navigate;
    bridge.setIntent({ kind: "activate", nav: "replace", tabId, entryKey: entry.key, key: urlKeyOf(entry.url), expiresAt: now + INTENT_TTL_MS });
    commit(setPending(state, [tabId]), { save: false });
    skipNextPageTransition();
    rt.router.replace(entry.url, { scroll: false });
  } else {
    const rendered = renderedEntry();
    if (rendered) {
      recordVisit(rendered.tab.id, rendered.entry.key);
      // The page mounted in the same commit as the shell, so the scroll root that exists now is
      // the page's own root: accept it once it is tall enough (data may still be loading).
      restoreScrollFor(rendered.entry.key, true, { timeoutMs: BOOT_RESTORE_TIMEOUT_MS });
    }
  }
  return makeRelease(rt);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function resolveTabUrl(url: string): CanonicalUrl | null {
  const first = canonicalizeUrl(url);
  if (!first) return null;
  const redirected = resolveLegacyRedirect(first.url);
  const final = redirected === first.url ? first : canonicalizeUrl(redirected);
  return final && final.tabbable ? final : null;
}

function activateTab(id: TabId): void {
  const rt = runtime;
  if (!rt || !isReady()) return;
  const tab = findTab(state, id);
  if (!tab) return;
  const intent = bridge.getIntent();
  if (!intent && id === state.activeTabId && id === state.requestedTabId) return;
  const entry = currentEntry(tab);
  const key = urlKeyOf(entry.url);
  const here = canonicalizeUrl(window.location.href);
  const now = clock();
  captureScroll();

  // Same URL and nothing in flight: commit now (two tabs can share a URL; each keeps its own page).
  if (!intent && here?.key === key) {
    commit(setPending(commitActivation(state, id, now), []));
    bridge.stampCurrentEntry(id, entry.key);
    skipNextPageTransition();
    restoreScrollFor(entry.key, false);
    recordVisit(id, entry.key);
    return;
  }
  // The highlight moves now; `activeTabId` follows when the matching history write commits.
  // A push also supersedes any navigation still in flight (Next discards the pending one).
  bridge.setIntent({ kind: "activate", nav: "push", tabId: id, entryKey: entry.key, key, expiresAt: now + INTENT_TTL_MS });
  commit(setPending(setRequested(state, id), [id]), { save: false });
  skipNextPageTransition();
  rt.router.push(entry.url, { scroll: false });
}

function activateRelative(delta: 1 | -1): void {
  if (!isReady() || state.tabs.length === 0) return;
  const current = state.requestedTabId ?? state.activeTabId;
  const index = Math.max(0, state.tabs.findIndex((tab) => tab.id === current));
  const next = (index + delta + state.tabs.length) % state.tabs.length;
  activateTab(state.tabs[next].id);
}

function activateIndex(index: number | "last"): void {
  if (!isReady() || state.tabs.length === 0) return;
  const target = index === "last" ? state.tabs.length - 1 : Math.trunc(index);
  if (target < 0 || target >= state.tabs.length) return;
  activateTab(state.tabs[target].id);
}

function openTab(url: string, opts: OpenTabOptions = {}): OpenTabResult {
  if (!isReady()) return NO_SHELL_RESULT;
  const target = resolveTabUrl(url);
  if (!target) return NOT_TABBABLE_RESULT;
  if (opts.dedupe === "activateExisting") {
    const existing = findByUrlKey(state, target.key);
    if (existing) {
      activateTab(existing.id);
      return { ok: true, tabId: existing.id, reused: true };
    }
  }
  if (state.tabs.length >= MAX_TABS) return LIMIT_RESULT;
  const activate = opts.activate !== false;
  const position = opts.position ?? (activate ? "end" : "afterOpenerGroup");
  const anchor = state.requestedTabId ?? state.activeTabId;
  const openerTabId = opts.openerTabId !== undefined ? opts.openerTabId : position === "end" ? null : anchor;
  const tab = createTab(target.url, clock(), ids, { pinned: opts.pinned, openerTabId });
  commit(insertTab(state, tab, position, openerTabId, anchor));
  if (activate) activateTab(tab.id);
  return { ok: true, tabId: tab.id, reused: false };
}

function openNewTabPage(opts?: { query?: string }): OpenTabResult {
  const query = opts?.query?.trim();
  return openTab(query ? `${NEW_TAB_URL}?q=${encodeURIComponent(query)}` : NEW_TAB_URL, { activate: true, position: "end" });
}

function toastIfLimit(result: OpenTabResult | null): void {
  if (result && !result.ok && result.reason === "limit") toast(translate("browser.tabLimit"));
}

function openUrl(url: string, disposition: OpenDisposition): void {
  if (disposition === "current") {
    navigateActive(url);
    return;
  }
  const opener = state.requestedTabId ?? state.activeTabId;
  const result =
    disposition === "new-foreground"
      ? openTab(url, { activate: true, position: "afterActive", openerTabId: opener })
      : openTab(url, { activate: false, position: "afterOpenerGroup", openerTabId: opener });
  toastIfLimit(result);
}

/** Closes tabs (recording them), then keeps the rendered / highlighted tab valid (plan D10, D11). */
function closeTabs(tabIds: readonly TabId[], preferSuccessor: TabId | null): void {
  if (!isReady()) return;
  const closing = tabIds.filter((id) => findTab(state, id) !== null);
  if (closing.length === 0) return;
  const rendered = state.activeTabId;
  const highlighted = state.requestedTabId ?? rendered;
  const now = clock();
  if (rendered && closing.includes(rendered)) captureScroll();

  let st = state;
  let successor: TabId | null = null;
  for (const id of closing) {
    const result = removeTab(st, id, now, ids, { recordClosed: true });
    if (id === highlighted) successor = result.successorId;
    st = result.state;
  }
  if (successor && !findTab(st, successor)) successor = null;
  // Rendered tab closed while another tab's activation is in flight: that tab is where the user was going.
  if (highlighted !== null && !closing.includes(highlighted) && findTab(st, highlighted)) successor = highlighted;
  if (preferSuccessor && findTab(st, preferSuccessor)) successor = preferSuccessor;

  if (st.tabs.length === 0) {
    const tab = createTab(NEW_TAB_URL, now, ids);
    commit({ ...st, tabs: [tab], activeTabId: null, requestedTabId: tab.id });
    activateTab(tab.id);
    return;
  }
  const highlightClosed = (highlighted !== null && closing.includes(highlighted)) || (rendered !== null && closing.includes(rendered));
  if (!highlightClosed) {
    commit(st);
    return;
  }
  const target = successor ?? st.tabs[0].id;
  if (rendered && closing.includes(rendered)) st = { ...st, activeTabId: null }; // DETACHED until the successor commits
  commit(setRequested(st, target));
  activateTab(target);
}

function closeTab(id: TabId, opts?: { source?: "pointer" | "keyboard" | "shortcut" | "menu" }): void {
  if (!isReady()) return;
  const tab = findTab(state, id);
  if (!tab) return;
  if (opts?.source === "shortcut" && tab.pinned) {
    // A shortcut never closes a pinned tab (Safari rule): move to the first unpinned tab instead.
    const firstUnpinned = state.tabs.find((candidate) => !candidate.pinned);
    if (firstUnpinned) activateTab(firstUnpinned.id);
    else toastIfLimit(openNewTabPage());
    return;
  }
  closeTabs([id], null);
}

function closeOtherTabs(id: TabId): void {
  if (!isReady() || !findTab(state, id)) return;
  closeTabs(state.tabs.filter((tab) => tab.id !== id && !tab.pinned).map((tab) => tab.id), id);
}

function closeTabsToRight(id: TabId): void {
  if (!isReady()) return;
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  closeTabs(state.tabs.slice(index + 1).filter((tab) => !tab.pinned).map((tab) => tab.id), id);
}

function closeAllTabs(): void {
  if (!isReady()) return;
  closeTabs(state.tabs.map((tab) => tab.id), null);
}

function reorderTab(id: TabId, toIndex: number): void {
  if (isReady()) commit(reorder(state, id, toIndex));
}

function pinTab(id: TabId, pinned: boolean): void {
  if (isReady()) commit(setPinned(state, id, pinned));
}

function duplicateTab(id: TabId): OpenTabResult {
  if (!isReady()) return NO_SHELL_RESULT;
  if (state.tabs.length >= MAX_TABS) return LIMIT_RESULT;
  const result = duplicate(state, id, clock(), ids);
  if (!result) return NOT_TABBABLE_RESULT;
  commit(result.state);
  activateTab(result.tabId);
  return { ok: true, tabId: result.tabId, reused: false };
}

function reopenClosedTab(closedId?: string): OpenTabResult | null {
  if (!isReady() || state.closed.length === 0) return null;
  if (closedId !== undefined && !state.closed.some((record) => record.id === closedId)) return null;
  if (state.tabs.length >= MAX_TABS) return LIMIT_RESULT;
  const result = restoreClosed(state, closedId, ids);
  if (!result) return null;
  commit(result.state);
  activateTab(result.tabId);
  return { ok: true, tabId: result.tabId, reused: false };
}

function navigateActive(url: string, opts?: { mode?: "push" | "replace" }): void {
  const rt = runtime;
  if (!rt || !isReady()) return;
  const target = resolveTabUrl(url);
  if (!target) return;
  const tab = findTab(state, state.activeTabId);
  const here = canonicalizeUrl(window.location.href);
  if (tab && here?.key !== target.key) commit(setPending(state, [tab.id]), { save: false });
  if (opts?.mode === "replace") rt.router.replace(target.url);
  else rt.router.push(target.url);
}

/** Moves the rendered tab to `toIndex`: real `history.go` when the mirror proves it lands exactly, else a push. */
function traverse(tab: BrowserTab, toIndex: number): void {
  const rt = runtime;
  if (!rt) return;
  const { entries, index } = tab.history;
  const target = entries[toIndex];
  const current = entries[index];
  if (!target || !current || toIndex === index) return;
  const dir: -1 | 1 = toIndex < index ? -1 : 1;
  const path = dir < 0
    ? entries.slice(toIndex, index).map((entry) => entry.key).reverse()
    : entries.slice(index + 1, toIndex + 1).map((entry) => entry.key);
  captureScroll();
  commit(setPending(state, [tab.id]), { save: false });
  const delta = bridge.mirror.deltaTo(tab.id, current.key, path, dir);
  if (delta !== 0) {
    bridge.go(delta);
    return;
  }
  bridge.setIntent({ kind: "traverse", nav: "push", tabId: tab.id, toIndex, entryKey: target.key, key: urlKeyOf(target.url), expiresAt: clock() + INTENT_TTL_MS });
  rt.router.push(target.url, { scroll: false });
}

function goBack(opts?: { closeToOpener?: boolean }): void {
  if (!isReady()) return;
  if (closeTopDialog()) return;
  if (bridge.isTraversalInFlight()) {
    bridge.queueTraversal(-1);
    return;
  }
  const tab = findTab(state, state.activeTabId);
  if (!tab) return;
  const index = tab.history.index;
  if (index <= 0) {
    if (opts?.closeToOpener && tab.openerTabId && findTab(state, tab.openerTabId)) closeTab(tab.id);
    return;
  }
  traverse(tab, index - 1);
}

function goForward(): void {
  if (!isReady()) return;
  if (bridge.isTraversalInFlight()) {
    bridge.queueTraversal(1);
    return;
  }
  const tab = findTab(state, state.activeTabId);
  if (!tab || tab.history.index >= tab.history.entries.length - 1) return;
  traverse(tab, tab.history.index + 1);
}

function goToEntry(tabId: TabId, index: number): void {
  if (!isReady() || bridge.isTraversalInFlight()) return;
  const tab = findTab(state, state.activeTabId);
  if (!tab || tab.id !== tabId) return;
  const target = Math.min(Math.max(Math.trunc(index), 0), tab.history.entries.length - 1);
  if (target === tab.history.index) return;
  traverse(tab, target);
}

function reload(opts?: { hard?: boolean }): void {
  if (!isReady()) return;
  if (opts?.hard) {
    flushSave();
    window.location.reload();
    return;
  }
  const rendered = renderedEntry();
  captureScroll();
  commit(bumpMountNonce(state), { save: false });
  if (rendered) restoreScrollFor(rendered.entry.key, false);
}

/** Home is the New Tab page, which needs no permission, so every member can reach it. */
function goHome(): void {
  navigateActive(HOME_URL);
}

function prepareOrgSwitch(targetOrgId: string): void {
  if (!runtime) return;
  flushSave();
  writeBootIntent(targetOrgId, clock());
}

/**
 * Sign-out on a shared device (tab-state spec §16.7): removes the signed-in user's tab state, the
 * org-switch intent and the history mirror, and stops every later write (debounced save, teardown
 * and pagehide flushes, browsing history) until the next fresh bind. Safe to call unbound.
 */
function purgeForSignOut(): void {
  blockPersistence();
  purgeTabStateForUser(runtime?.scope.userId ?? null);
}

const actions: TabActions = {
  openTab,
  openNewTabPage,
  openUrl,
  activateTab,
  activateRelative,
  activateIndex,
  closeTab,
  closeOtherTabs,
  closeTabsToRight,
  closeAllTabs,
  reorderTab,
  setPinned: pinTab,
  duplicateTab,
  reopenClosedTab,
  navigateActive,
  goBack,
  goForward,
  goToEntry,
  reload,
  goHome,
  prepareOrgSwitch,
};

// ─── Commands, titles, route commits ─────────────────────────────────────────

/** Shell commands core executes itself; the rest (omnibox, overview, bookmarks bar) go to the chrome. */
export const TAB_COMMANDS: readonly ShellCommand[] = [
  "newTab", "closeTab", "reopenClosedTab", "nextTab", "prevTab",
  "selectTab1", "selectTab2", "selectTab3", "selectTab4", "selectTab5", "selectTab6", "selectTab7", "selectTab8", "selectLastTab",
  "back", "forward", "reload", "hardReload", "home", "duplicateTab",
];

/** Runs a tab command; returns false for commands only a chrome can handle. */
export function executeShellCommand(cmd: ShellCommand): boolean {
  if (!isReady()) return false;
  const current = state.requestedTabId ?? state.activeTabId;
  switch (cmd) {
    case "newTab": toastIfLimit(openNewTabPage()); return true;
    case "closeTab": if (current) closeTab(current, { source: "shortcut" }); return true;
    case "reopenClosedTab": toastIfLimit(reopenClosedTab()); return true;
    case "nextTab": activateRelative(1); return true;
    case "prevTab": activateRelative(-1); return true;
    case "selectTab1": case "selectTab2": case "selectTab3": case "selectTab4":
    case "selectTab5": case "selectTab6": case "selectTab7": case "selectTab8":
      activateIndex(Number(cmd.slice("selectTab".length)) - 1);
      return true;
    case "selectLastTab": activateIndex("last"); return true;
    case "back": goBack(); return true;
    case "forward": goForward(); return true;
    case "reload": reload(); return true;
    case "hardReload": reload({ hard: true }); return true;
    case "home": goHome(); return true;
    case "duplicateTab": if (current) toastIfLimit(duplicateTab(current)); return true;
    default: return false;
  }
}

function setPageTitle(entryKey: EntryKey, title: string): void {
  if (!isReady()) return;
  const next = setEntryTitle(state, entryKey, title);
  if (next === state) return;
  commit(next);
  const hit = findByEntryKey(state, entryKey);
  if (runtime && hit && hit.index === hit.tab.history.index && persistenceAllowed()) {
    updateBrowsingHistoryTitle(runtime.scope, stripVolatileParams(hit.tab.history.entries[hit.index].url), title);
  }
}

/** Called after every committed pathname/search change (RouterInvariantGuard). */
function onRouteCommitted(href: string): void {
  if (!isReady()) return;
  if (!bridge.getIntent() && state.pendingTabIds.length > 0) commit(setPending(state, []), { save: false });
  const here = canonicalizeUrl(href);
  // A store / personal device on the "/manager" alias is about to be sent to its surface by the
  // index page. Only the alias: HOME_URL is a page such a device really sits on in manager mode.
  if (here && here.pathname === MANAGER_ALIAS_PATH && getAppMode() !== "admin") return;
  bridge.assertInSync(href);
}

/** A plain in-app link click (the tab shows a spinner until the navigation commits). */
function markPlainNavigation(url: TabUrl): void {
  if (!isReady()) return;
  const tab = findTab(state, state.activeTabId);
  if (tab && canonicalizeUrl(url)) commit(setPending(state, [tab.id]), { save: false });
}

export interface TabsStore {
  getState(): TabsSnapshot;
  subscribe(listener: () => void): () => void;
  isReady(): boolean;
  bind(input: BindInput): () => void;
  setAccess(ctx: AccessContext | null): void;
  setTranslator(t: (key: string) => string): void;
  onRouteCommitted(href: string): void;
  markPlainNavigation(url: TabUrl): void;
  /** The rendered tab entry (null while detached, idle or gated). */
  getRenderedEntry(): { tab: BrowserTab; entry: HistoryEntry } | null;
  setPageTitle(entryKey: EntryKey, title: string): void;
  /** Call before auth sign-out: purges this user's tab state and stops persisting it. */
  purgeForSignOut(): void;
  readonly actions: TabActions;
}

export const tabsStore: TabsStore = {
  getState: () => state,
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  isReady,
  bind,
  setAccess,
  setTranslator(t) {
    translate = t;
  },
  onRouteCommitted,
  markPlainNavigation,
  getRenderedEntry: renderedEntry,
  setPageTitle,
  purgeForSignOut,
  actions,
};

/** Test-only: tears everything down synchronously and resets module state. */
export function __resetTabsStoreForTests(opts?: { clock?: () => number }): void {
  if (runtime) teardown();
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = undefined;
  persistenceBlocked = false;
  authUserAtBind = false;
  accessContext = null;
  translate = (key) => key;
  clock = opts?.clock ?? (() => Date.now());
  state = IDLE_SNAPSHOT;
}
