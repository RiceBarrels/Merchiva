import { urlKeyOf } from "./model";
import { currentEntry, type ShellLayout, type TabId, type TabsSnapshot, type UrlKey } from "./types";

/*
 * Per-tab keep-alive bookkeeping for TabPageOutlet (pure: no React, no DOM).
 *
 * Every tab whose page has been shown owns a slot. The slot that renders the live router state is
 * visible; the others stay mounted inside a hidden <Activity> with the navigation they last showed,
 * so switching back to a tab reveals its page instead of remounting it. Slots are kept in mount
 * order and never reordered (moving a slot would move its DOM), and at most `limit` stay mounted:
 * the least recently shown tab is evicted first and remounts when it is activated again.
 *
 * Which slot renders the live route follows the history bridge's own attribution rules, so the
 * page a slot shows always belongs to that slot's tab:
 *   1. the highlighted (requested) tab, once the live route is that tab's current entry;
 *   2. otherwise the slot that already had it, while the route is unchanged (a tab activation
 *      still waiting for its router.push, a popstate before Next renders it, a refresh);
 *   3. otherwise, a new route belongs to the rendered tab (in-tab links, back/forward, redirects),
 *      exactly as the bridge records it.
 */

/** Desktop windows have memory to spare and up to MAX_TABS tabs: eight pages stay alive. */
export const DESKTOP_KEEP_ALIVE = 8;
/**
 * The phone layout shows one tab (single-tab.ts): only the visible page stays mounted. Tabs left
 * hidden by a restored session or a wider window would otherwise cost memory the phone reclaims
 * aggressively, and re-render at low priority whenever a shared context changes; they remount
 * when the desktop chrome shows them again.
 */
export const MOBILE_KEEP_ALIVE = 1;

export function keepAliveLimit(layout: ShellLayout): number {
  return layout === "mobile" ? MOBILE_KEEP_ALIVE : DESKTOP_KEEP_ALIVE;
}

export interface KeepAliveSlot {
  /** React key: fixed for the slot's lifetime, so a slot never remounts while it exists. */
  readonly key: string;
  /** The tab whose page the slot holds; null only for the boot slot, before the tab store binds. */
  readonly tabId: TabId | null;
  /** Soft reloads of this tab. Part of the page key, so a reload remounts only this slot's page. */
  readonly reloads: number;
  /** Clock value of the last time this slot became the live one (LRU order). */
  readonly usedAt: number;
}

export interface KeepAliveState {
  /** Mount order. Never reordered. */
  readonly slots: readonly KeepAliveSlot[];
  /** Key of the slot that renders the live router state (the visible slot). */
  readonly liveSlot: string;
  /** UrlKey of the live route when the live slot was last resolved. */
  readonly liveKey: UrlKey | null;
  /** Last tab-store mount nonce seen; an increase is a soft reload of the rendered tab. */
  readonly nonce: number;
  /** Number of the next slot key (`s<n>`). */
  readonly nextSlot: number;
  /** LRU clock: bumped whenever another slot becomes the live one. */
  readonly clock: number;
}

export interface KeepAliveInput {
  /** The tab store is bound (`status === "ready"`). Until then nothing is adopted or dropped. */
  readonly ready: boolean;
  /** Ids of the open tabs. */
  readonly tabIds: readonly TabId[];
  /** The tab whose page the model says is rendered (null while DETACHED). */
  readonly activeTabId: TabId | null;
  /** The highlighted tab (`requestedTabId ?? activeTabId`). */
  readonly requestedTabId: TabId | null;
  /** The live route is the requested tab's current entry (or its paywall gate). */
  readonly requestedShowsLive: boolean;
  readonly mountNonce: number;
  /** UrlKey of the live router location. */
  readonly liveKey: UrlKey | null;
  /** Most slots kept mounted, the live one included. */
  readonly limit: number;
}

/** Builds the reconcile input from a tab snapshot and the live route's UrlKey. */
export function keepAliveInputOf(snapshot: TabsSnapshot, liveKey: UrlKey | null, limit: number): KeepAliveInput {
  const requestedTabId = snapshot.requestedTabId ?? snapshot.activeTabId;
  const requested = requestedTabId ? snapshot.tabs.find((tab) => tab.id === requestedTabId) ?? null : null;
  let requestedShowsLive = false;
  if (requested && liveKey !== null) {
    const gateUrl = snapshot.gate?.tabId === requested.id ? snapshot.gate.url : null;
    requestedShowsLive = urlKeyOf(currentEntry(requested).url) === liveKey || (gateUrl !== null && urlKeyOf(gateUrl) === liveKey);
  }
  return {
    ready: snapshot.status === "ready",
    tabIds: snapshot.tabs.map((tab) => tab.id),
    activeTabId: snapshot.activeTabId,
    requestedTabId,
    requestedShowsLive,
    mountNonce: snapshot.mountNonce,
    liveKey,
    limit,
  };
}

/** One boot slot (not yet bound to a tab) holding the live route, reconciled against `input`. */
export function initialKeepAlive(input: KeepAliveInput): KeepAliveState {
  const boot: KeepAliveState = {
    slots: [{ key: "s0", tabId: null, reloads: 0, usedAt: 0 }],
    liveSlot: "s0",
    liveKey: input.liveKey,
    nonce: input.mountNonce,
    nextSlot: 1,
    clock: 1,
  };
  return reconcileKeepAlive(boot, input);
}

/** The tab that should render the live route; undefined keeps the current live slot. */
function resolveOwner(state: KeepAliveState, live: KeepAliveSlot | undefined, input: KeepAliveInput): TabId | undefined {
  if (!input.ready) return undefined;
  if (input.requestedTabId && input.requestedShowsLive) return input.requestedTabId;
  if (live && input.liveKey === state.liveKey) return undefined;
  return input.activeTabId ?? input.requestedTabId ?? undefined;
}

/**
 * Next keep-alive state for `input`. Returns `state` itself when nothing changed, so a component
 * can store the result during render (`if (next !== stored) setStored(next)`) without looping.
 */
export function reconcileKeepAlive(state: KeepAliveState, input: KeepAliveInput): KeepAliveState {
  let slots = state.slots;
  let liveSlot = state.liveSlot;
  let nextSlot = state.nextSlot;
  let clock = state.clock;
  let changed = false;
  const live = slots.find((slot) => slot.key === liveSlot);

  // 1. The slot that renders the live route: the owner tab's slot, adopting the boot slot or
  //    creating one when the tab has none.
  const owner = resolveOwner(state, live, input);
  if (owner !== undefined && live?.tabId !== owner) {
    const existing = slots.find((slot) => slot.tabId === owner);
    if (existing) {
      liveSlot = existing.key;
    } else if (live && live.tabId === null) {
      slots = slots.map((slot) => (slot === live ? { ...slot, tabId: owner } : slot));
    } else {
      const created: KeepAliveSlot = { key: `s${nextSlot}`, tabId: owner, reloads: 0, usedAt: clock };
      nextSlot++;
      slots = [...slots, created];
      liveSlot = created.key;
    }
    changed = true;
  }
  if (liveSlot !== state.liveSlot) {
    const stamp = clock++;
    slots = slots.map((slot) => (slot.key === liveSlot ? { ...slot, usedAt: stamp } : slot));
  }

  // 2. A soft reload (tab store mount nonce) remounts the rendered tab's page only.
  let nonce = state.nonce;
  if (input.mountNonce !== nonce) {
    if (input.ready && input.mountNonce > nonce && input.activeTabId) {
      const reloaded = input.activeTabId;
      slots = slots.map((slot) => (slot.tabId === reloaded ? { ...slot, reloads: slot.reloads + 1 } : slot));
    }
    nonce = input.mountNonce;
    changed = true;
  }

  // 3. Closed tabs lose their slot (the live one stays until the route moves on).
  if (input.ready) {
    const open = new Set(input.tabIds);
    const kept = slots.filter((slot) => slot.key === liveSlot || (slot.tabId !== null && open.has(slot.tabId)));
    if (kept.length !== slots.length) {
      slots = kept;
      changed = true;
    }
  }

  // 4. Least recently shown slots beyond the limit are evicted (never the live one, nor the
  //    requested tab's, which is about to be shown).
  const limit = Math.max(1, Math.floor(input.limit));
  if (slots.length > limit) {
    const protectedKeys = new Set([liveSlot]);
    const requested = input.requestedTabId ? slots.find((slot) => slot.tabId === input.requestedTabId) : undefined;
    if (requested) protectedKeys.add(requested.key);
    const evictable = slots.filter((slot) => !protectedKeys.has(slot.key)).sort((a, b) => a.usedAt - b.usedAt);
    const evicted = new Set(evictable.slice(0, slots.length - limit).map((slot) => slot.key));
    if (evicted.size > 0) {
      slots = slots.filter((slot) => !evicted.has(slot.key));
      changed = true;
    }
  }

  if (input.liveKey !== state.liveKey) changed = true;
  if (!changed && liveSlot === state.liveSlot) return state;
  return { slots, liveSlot, liveKey: input.liveKey, nonce, nextSlot, clock };
}

/** The part of a slot's navigation its reveal compares (TabSlot's TabNavigation). */
export interface ShownRoute {
  readonly urlKey: UrlKey | null;
  readonly pathname: string | null;
}

/**
 * What a kept-alive slot shows when it is displayed again, against what it was hidden with:
 * - "fresh": it never showed anything, so its page mounts now and restores its entry like any mount;
 * - "same": the page it was hidden with, whose own scrollers come back (SlotScrollMemory);
 * - "entry": another history entry of the same page (only the search changed): the page stays
 *   mounted, the entry's restore reuses its scroll root;
 * - "page": another page, which mounts now: the entry's restore waits for its scroll root.
 * The last two happen when a traversal or activation lands on another entry of the tab than the
 * one it was hidden on, or when the tab's paywall gate cleared.
 */
export type SlotReveal = "fresh" | "same" | "entry" | "page";

export function slotReveal(hiddenWith: ShownRoute | null, shown: ShownRoute): SlotReveal {
  if (!hiddenWith) return "fresh";
  if (hiddenWith.urlKey === shown.urlKey) return "same";
  return hiddenWith.pathname === shown.pathname ? "entry" : "page";
}
