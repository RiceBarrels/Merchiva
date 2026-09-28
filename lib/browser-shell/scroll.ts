import { useEffect, type RefObject } from "react";
import type { EntryKey } from "./types";

/*
 * Per-entry scroll capture and restore (tab-state spec §7.8, plan D14). Pages remount on
 * every tab switch (no keep-alive), so the shell remembers the scroll offset of each history
 * entry and restores it once the new page's scroll root is tall enough.
 *
 * Offsets live in memory while the shell runs (no snapshot churn while scrolling); the store
 * folds them into entries when an entry is left and when it persists.
 */

const ROOT_SELECTOR = "[data-tab-scroll-root]";
const CONTENT_SELECTOR = "#desktop-content, #mobile-content";
const ACTIVE_SLOT_SELECTOR =
  '#desktop-content [data-tab-slot][data-tab-active="true"], #mobile-content [data-tab-slot][data-tab-active="true"]';
const RESTORE_TIMEOUT_MS = 2000;
const RESTORE_TOLERANCE_PX = 4;
/** Reload / deep-link boot: the page's data is often still loading when the shell binds. */
export const BOOT_RESTORE_TIMEOUT_MS = 5000;

export interface ScrollRestoreOptions {
  /** How long to wait for the scroll root to become tall enough (default 2 s). */
  readonly timeoutMs?: number;
}

let resolveEntryKey: () => EntryKey | null = () => null;
const offsets = new Map<EntryKey, number>();
let currentHost: HTMLElement | null = null;
let cancelRestore: (() => void) | null = null;

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

/**
 * The active keep-alive slot of the browser shell (the displayed tab page), or null outside the
 * browser shell. Page-level DOM lookups (presence anchors, scroll roots) scope to it: hidden
 * slots stay in the document.
 */
export function activeTabRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(ACTIVE_SLOT_SELECTOR);
}

/**
 * The last visible, connected `[data-tab-scroll-root]` inside the content element, preferring
 * one that actually overflows. Roots: TabPageOutlet's <main>, PageTransition's motion.div and
 * any page scroller that opts in with the attribute.
 */
export function findScrollRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const container = currentHost?.isConnected ? currentHost : document.querySelector<HTMLElement>(CONTENT_SELECTOR);
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
}

/**
 * Restores `y` on the page that is mounting. With `reuseRoot` the scroll root that exists now may
 * be the page's own root (same page with a different search, or the page that mounted together
 * with the shell at boot), so it is accepted as soon as it is tall enough; otherwise the loop waits
 * for a new root (AnimatePresence keeps the exiting one for a moment). Gives up after 2 s (or
 * `timeoutMs`) and stops as soon as the user scrolls, touches, clicks or types inside the content.
 */
export function scheduleScrollRestore(y: number | undefined, reuseRoot: boolean, opts?: ScrollRestoreOptions): void {
  cancelScrollRestore();
  if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") return;
  const target = y !== undefined && Number.isFinite(y) && y > 0 ? Math.round(y) : 0;
  const previousRoot = findScrollRoot();
  if (target === 0) {
    if (reuseRoot && previousRoot && previousRoot.scrollTop !== 0) previousRoot.scrollTop = 0;
    return;
  }
  const timeoutMs = opts?.timeoutMs ?? RESTORE_TIMEOUT_MS;
  const started = Date.now();
  let frame = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    const el = findScrollRoot();
    if (el && (el !== previousRoot || reuseRoot) && el.scrollHeight - el.clientHeight >= target - RESTORE_TOLERANCE_PX) {
      el.scrollTop = target;
      cancelRestore = null;
      return;
    }
    if (Date.now() - started >= timeoutMs) {
      cancelRestore = null;
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  cancelRestore = () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

/** Capture-phase passive scroll tracker on the chrome's content element; returns uninstall. */
export function installScrollTracker(host: HTMLElement): () => void {
  currentHost = host;
  const onScroll = (event: Event) => {
    const target = event.target;
    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement) || !target.matches(ROOT_SELECTOR)) return;
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

/** Chromes call this on their content element (`#desktop-content` / `#mobile-content`). */
export function useTabContentHost(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    return installScrollTracker(host);
  }, [ref]);
}
