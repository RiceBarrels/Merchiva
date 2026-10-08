import { useEffect, type RefObject } from "react";
import type { EntryKey, TabId } from "./types";

/*
 * Per-entry scroll capture and restore (tab-state spec §7.8, plan D14). A page that mounts
 * (a new route in a tab, a tab whose keep-alive slot was evicted, a reload) gets the offset its
 * history entry was left at, once its scroll root is tall enough.
 *
 * Offsets live in memory while the shell runs (no snapshot churn while scrolling); the store
 * folds them into entries when an entry is left and when it persists.
 *
 * Keep-alive (TabPageOutlet): every mounted tab page sits in its own slot,
 * `[data-tab-slot="<tabId>"][data-tab-active="true"|"false"]`, and only the active slot is
 * displayed. Every scroll-root lookup is scoped to the active slot (or, for a restore, to the
 * slot of the entry's tab). A hidden slot is `display: none`, which drops the scroll offsets of
 * its scrollers, so each slot remembers them itself (installSlotScrollMemory) and puts them back
 * when it is shown again.
 */

const ROOT_SELECTOR = "[data-tab-scroll-root]";
const CONTENT_SELECTOR = "#desktop-content, #mobile-content";
const SLOT_SELECTOR = "[data-tab-slot]";
const ANY_SLOT_SELECTOR = "#desktop-content [data-tab-slot], #mobile-content [data-tab-slot]";
const ACTIVE_SLOT_SELECTOR =
  '#desktop-content [data-tab-slot][data-tab-active="true"], #mobile-content [data-tab-slot][data-tab-active="true"]';
/** Tab ids are `t_` + base36; anything else never reaches a selector. */
const SAFE_TAB_ID = /^[\w-]+$/;
const RESTORE_TIMEOUT_MS = 2000;
const RESTORE_TOLERANCE_PX = 4;
/** Reload / deep-link boot: the page's data is often still loading when the shell binds. */
export const BOOT_RESTORE_TIMEOUT_MS = 5000;

export interface ScrollRestoreOptions {
  /** How long to wait for the scroll root to become tall enough (default 2 s). */
  readonly timeoutMs?: number;
  /** The entry's tab: the restore only touches that tab's slot, once it is displayed. */
  readonly tabId?: TabId;
}

let resolveEntryKey: () => EntryKey | null = () => null;
const offsets = new Map<EntryKey, number>();
let currentHost: HTMLElement | null = null;
let cancelRestore: (() => void) | null = null;
/** The restore whose loop is running (cancelRestore), so a revealed slot can resume it. */
let pendingRestore: { readonly y: number; readonly tabId?: TabId; readonly timeoutMs: number } | null = null;

/** Core-internal: tells the tracker which entry is rendered. `null` resets (shell teardown). */
export function configureScrollTracking(resolver: (() => EntryKey | null) | null): void {
  resolveEntryKey = resolver ?? (() => null);
  if (!resolver) offsets.clear();
}

/** Last tracked offset of an entry in this session, if it was ever scrolled. */
export function trackedScrollOf(entryKey: EntryKey): number | undefined {
  return offsets.get(entryKey);
}

function isVisible(el: HTMLElement): boolean {
  return el.isConnected && el.getClientRects().length > 0;
}

function contentElement(): HTMLElement | null {
  return currentHost?.isConnected ? currentHost : document.querySelector<HTMLElement>(CONTENT_SELECTOR);
}

/**
 * The active keep-alive slot of the browser shell (the displayed tab page), or null outside the
 * browser shell. Page-level DOM lookups (presence anchors, scroll roots) scope to it: hidden
 * slots stay in the document.
 */
export function activeTabRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(ACTIVE_SLOT_SELECTOR);
}

/** The slot of `tabId`; null while it is not mounted. */
function tabSlotRoot(tabId: TabId): HTMLElement | null {
  if (!SAFE_TAB_ID.test(tabId)) return null;
  return document.querySelector<HTMLElement>(
    `#desktop-content [data-tab-slot="${tabId}"], #mobile-content [data-tab-slot="${tabId}"]`,
  );
}

/** Where a restore for `tabId` looks: its slot, nothing while the slot is not mounted yet. */
function restoreScope(tabId: TabId | undefined): HTMLElement | null {
  if (tabId !== undefined) {
    const slot = tabSlotRoot(tabId);
    if (slot) return slot;
    if (document.querySelector(ANY_SLOT_SELECTOR)) return null;
  }
  return activeTabRoot() ?? contentElement();
}

/**
 * The last visible, connected `[data-tab-scroll-root]` inside the active slot (the content
 * element outside a keep-alive outlet), preferring one that actually overflows. Roots: the
 * slot's <main>, PageTransition's motion.div and any page scroller that opts in with the attribute.
 */
export function findScrollRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return scrollRootIn(activeTabRoot() ?? contentElement());
}

function scrollRootIn(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null;
  const roots = Array.from(container.querySelectorAll<HTMLElement>(ROOT_SELECTOR));
  if (container.matches(ROOT_SELECTOR)) roots.unshift(container);
  let fallback: HTMLElement | null = null;
  for (let i = roots.length - 1; i >= 0; i--) {
    const el = roots[i];
    if (!isVisible(el)) continue;
    if (el.scrollHeight > el.clientHeight) return el;
    fallback ??= el;
  }
  return fallback;
}

export function cancelScrollRestore(): void {
  cancelRestore?.();
  cancelRestore = null;
  pendingRestore = null;
}

/**
 * Restores `y` on the page that is mounting. With `reuseRoot` the scroll root that exists now may
 * be the page's own root (same page with a different search, or the page that mounted together
 * with the shell at boot), so it is accepted as soon as it is tall enough; otherwise the loop waits
 * for a new root (AnimatePresence keeps the exiting one for a moment). Gives up after 2 s (or
 * `timeoutMs`) and stops as soon as the user scrolls, touches, clicks or types inside the content.
 * With `tabId` only that tab's slot is considered, and only while it is displayed. A kept-alive
 * slot that is shown again with the page it was hidden with restores its own scrollers and
 * cancels this restore; one whose route moved to this entry while it was hidden resumes it
 * (SlotScrollMemory.restore).
 */
export function scheduleScrollRestore(y: number | undefined, reuseRoot: boolean, opts?: ScrollRestoreOptions): void {
  cancelScrollRestore();
  if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") return;
  const target = y !== undefined && Number.isFinite(y) && y > 0 ? Math.round(y) : 0;
  const tabId = opts?.tabId;
  const currentRoot = () => scrollRootIn(restoreScope(tabId));
  const previousRoot = currentRoot();
  if (target === 0) {
    if (reuseRoot && previousRoot && previousRoot.scrollTop !== 0) previousRoot.scrollTop = 0;
    return;
  }
  const timeoutMs = opts?.timeoutMs ?? RESTORE_TIMEOUT_MS;
  const started = Date.now();
  let frame = 0;
  let cancelled = false;
  const finish = () => {
    cancelRestore = null;
    pendingRestore = null;
  };
  const tick = () => {
    if (cancelled) return;
    const el = currentRoot();
    if (el && (el !== previousRoot || reuseRoot) && el.scrollHeight - el.clientHeight >= target - RESTORE_TOLERANCE_PX) {
      el.scrollTop = target;
      finish();
      return;
    }
    if (Date.now() - started >= timeoutMs) {
      finish();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  cancelRestore = () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
  pendingRestore = { y: target, tabId, timeoutMs };
}

/**
 * Starts the pending restore of `tabId`'s entry over, against its slot as it is displayed now.
 * A restore scheduled while the slot was hidden could not tell whether the slot's page stays
 * (`reuseRoot`: only the search changed) or is replaced, and saw no root to wait past; the
 * history bridge decided `reuseRoot` against the tab that was on screen, not this slot's page.
 * False when no restore of that tab is pending.
 */
function resumeScrollRestore(tabId: TabId, reuseRoot: boolean): boolean {
  const pending = pendingRestore;
  if (!pending || pending.tabId !== tabId) return false;
  scheduleScrollRestore(pending.y, reuseRoot, { tabId, timeoutMs: pending.timeoutMs });
  return true;
}

/** Capture-phase passive scroll tracker on the chrome's content element; returns uninstall. */
export function installScrollTracker(host: HTMLElement): () => void {
  currentHost = host;
  const onScroll = (event: Event) => {
    const target = event.target;
    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement) || !target.matches(ROOT_SELECTOR)) return;
    // Offsets are recorded for the rendered entry: a late event from a slot that was just hidden
    // belongs to another tab.
    if (target.closest(SLOT_SELECTOR)?.getAttribute("data-tab-active") === "false") return;
    const key = resolveEntryKey();
    if (key) offsets.set(key, target.scrollTop);
  };
  const onUserInput = () => cancelScrollRestore();
  host.addEventListener("scroll", onScroll, { capture: true, passive: true });
  host.addEventListener("wheel", onUserInput, { passive: true });
  host.addEventListener("touchstart", onUserInput, { passive: true });
  host.addEventListener("pointerdown", onUserInput, { passive: true });
  host.addEventListener("keydown", onUserInput);
  return () => {
    host.removeEventListener("scroll", onScroll, { capture: true });
    host.removeEventListener("wheel", onUserInput);
    host.removeEventListener("touchstart", onUserInput);
    host.removeEventListener("pointerdown", onUserInput);
    host.removeEventListener("keydown", onUserInput);
    if (currentHost === host) currentHost = null;
  };
}

/** A slot shown again whose route moved to another entry of its tab while it was hidden. */
export interface SlotNavigation {
  readonly tabId: TabId;
  /** Only the search changed: the slot's page, and its scroll root, stay mounted. */
  readonly samePathname: boolean;
}

export interface SlotScrollMemory {
  /**
   * The slot is displayed again. Puts every remembered scroller back where it was and cancels any
   * pending restore: the page never unmounted. With `navigated` the tab scroll roots belong to the
   * new entry instead: they are left alone and its pending restore resumes against this slot.
   */
  restore(navigated?: SlotNavigation): void;
  uninstall(): void;
}

interface RememberedScroll {
  readonly ref: WeakRef<Element>;
  top: number;
  left: number;
}

/**
 * Remembers the offsets of every scroller inside a keep-alive slot (capture-phase scroll events
 * reach the slot from any descendant). Hiding the slot (`display: none`) resets them in the
 * browser; `restore` runs when the slot is displayed again, before paint. Only scrollers that
 * are away from the start are kept. They are held weakly and swept whenever another one is
 * remembered: every in-tab navigation or reload replaces the page, and the memory must not keep
 * the old page's DOM alive until the slot is next hidden.
 */
export function installSlotScrollMemory(slot: HTMLElement): SlotScrollMemory {
  const byElement = new WeakMap<Element, RememberedScroll>();
  const remembered = new Set<RememberedScroll>();
  const forget = (entry: RememberedScroll, el: Element | undefined) => {
    remembered.delete(entry);
    if (el) byElement.delete(el);
  };
  /** The entry's scroller, or undefined (and forgotten) once it was collected or left the slot. */
  const live = (entry: RememberedScroll): Element | undefined => {
    const el = entry.ref.deref();
    if (el && el.isConnected && slot.contains(el)) return el;
    forget(entry, el);
    return undefined;
  };
  const onScroll = (event: Event) => {
    const target = event.target;
    if (typeof Element === "undefined" || !(target instanceof Element)) return;
    const known = byElement.get(target);
    if (target.scrollTop === 0 && target.scrollLeft === 0) {
      if (known) forget(known, target);
    } else if (known) {
      known.top = target.scrollTop;
      known.left = target.scrollLeft;
    } else {
      for (const entry of remembered) live(entry);
      const entry: RememberedScroll = { ref: new WeakRef(target), top: target.scrollTop, left: target.scrollLeft };
      remembered.add(entry);
      byElement.set(target, entry);
    }
  };
  slot.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return {
    restore(navigated) {
      for (const entry of remembered) {
        const el = live(entry);
        if (!el) continue;
        if (navigated && el.matches(ROOT_SELECTOR)) {
          forget(entry, el);
          continue;
        }
        if (el.scrollTop !== entry.top) el.scrollTop = entry.top;
        if (el.scrollLeft !== entry.left) el.scrollLeft = entry.left;
      }
      if (!navigated || !resumeScrollRestore(navigated.tabId, navigated.samePathname)) cancelScrollRestore();
    },
    uninstall() {
      slot.removeEventListener("scroll", onScroll, { capture: true });
      remembered.clear();
    },
  };
}

/** Chromes call this on their content element (`#desktop-content` / `#mobile-content`). */
export function useTabContentHost(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    return installScrollTracker(host);
  }, [ref]);
}
