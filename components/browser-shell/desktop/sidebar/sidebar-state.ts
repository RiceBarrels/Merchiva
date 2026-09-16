"use client";

import { useSyncExternalStore } from "react";

/*
 * Per-device state of the desktop sidebar: hidden (no panel at all) and collapsed (icon rail).
 * Kept in a tiny module — like bookmarks-bar-state.ts — so the toolbar toggle, the sidebar
 * itself and the resizable panel can all read and write it without importing each other.
 *
 * The expanded width is NOT stored here: the ResizablePanelGroup persists it through
 * react-resizable-panels' `useDefaultLayout` (SIDEBAR_LAYOUT_ID).
 *
 * Storage can throw (private mode, blocked site data); the last value set in this session is
 * then kept in memory. Reads are SSR-safe through `useSyncExternalStore`'s server snapshot.
 */

/** Versioned so a future shape change can't be read as this one. */
export const SIDEBAR_STATE_STORAGE_KEY = "merchiva_browser_sidebar:v1";

/** Layout id of the sidebar/content panel group (react-resizable-panels localStorage key). */
export const SIDEBAR_LAYOUT_ID = "merchiva-browser-sidebar:v1";

export const SIDEBAR_PANEL_ID = "browser-sidebar";
export const SIDEBAR_CONTENT_PANEL_ID = "browser-content";

/** DOM id of the sidebar element (the toolbar toggle's `aria-controls`). */
export const SIDEBAR_ELEMENT_ID = "browser-sidebar-nav";

/** DOM id of the toolbar toggle, so focus can return to it when the sidebar is hidden. */
export const SIDEBAR_TOGGLE_ID = "browser-sidebar-toggle";

const CHANGE_EVENT = "merchiva:sidebar-state-change";

export interface SidebarState {
  /** No sidebar panel at all; the toolbar toggle brings it back. */
  readonly hidden: boolean;
  /** Icon rail instead of the full-width panel (drag-to-collapse or the in-sidebar control). */
  readonly collapsed: boolean;
}

export const DEFAULT_SIDEBAR_STATE: SidebarState = Object.freeze({ hidden: false, collapsed: false });

/** Tolerant parse of a stored value: anything unexpected falls back to the default state. */
export function parseSidebarState(raw: string | null): SidebarState {
  if (raw === null) return DEFAULT_SIDEBAR_STATE;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_SIDEBAR_STATE;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_SIDEBAR_STATE;
  const record = value as Record<string, unknown>;
  if (record.v !== 1) return DEFAULT_SIDEBAR_STATE;
  const hidden = record.hidden === true;
  const collapsed = record.collapsed === true;
  if (!hidden && !collapsed) return DEFAULT_SIDEBAR_STATE;
  return Object.freeze({ hidden, collapsed });
}

export function serializeSidebarState(state: SidebarState): string {
  return JSON.stringify({ v: 1, hidden: state.hidden, collapsed: state.collapsed });
}

let memory: SidebarState = DEFAULT_SIDEBAR_STATE;
/** The raw string `memory` was parsed from, so repeated reads keep one object identity. */
let cachedRaw: string | null = null;
let storageOk = true;

function readState(): SidebarState {
  if (!storageOk) return memory;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY);
  } catch {
    storageOk = false;
    return memory;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    memory = parseSidebarState(raw);
  }
  return memory;
}

function readServerState(): SidebarState {
  return DEFAULT_SIDEBAR_STATE;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SIDEBAR_STATE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Merges `patch` into the stored state; a no-op change writes nothing and notifies nobody. */
export function setSidebarState(patch: Partial<SidebarState>): void {
  const current = readState();
  const next: SidebarState = Object.freeze({
    hidden: patch.hidden ?? current.hidden,
    collapsed: patch.collapsed ?? current.collapsed,
  });
  if (next.hidden === current.hidden && next.collapsed === current.collapsed) return;
  memory = next;
  if (storageOk) {
    const text = serializeSidebarState(next);
    try {
      window.localStorage.setItem(SIDEBAR_STATE_STORAGE_KEY, text);
      cachedRaw = text;
    } catch {
      // Kept in memory for this session.
      storageOk = false;
    }
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function setSidebarHidden(hidden: boolean): void {
  setSidebarState({ hidden });
}

/** Toolbar toggle and the `toggleSidebar` shell command. Showing it again keeps the rail state. */
export function toggleSidebarHidden(): void {
  setSidebarState({ hidden: !readState().hidden });
}

export function setSidebarCollapsed(collapsed: boolean): void {
  setSidebarState({ collapsed });
}

export function toggleSidebarCollapsed(): void {
  setSidebarState({ collapsed: !readState().collapsed });
}

/** Current sidebar state; re-renders every reader (and every window) on a change. */
export function useSidebarState(): SidebarState {
  return useSyncExternalStore(subscribe, readState, readServerState);
}

/** Test seam: forgets the cached snapshot so a fresh storage value is read. */
export function resetSidebarStateCache(): void {
  memory = DEFAULT_SIDEBAR_STATE;
  cachedRaw = null;
  storageOk = true;
}
