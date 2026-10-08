"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

/*
 * Whether the Mr. Merchiva dock is open, and how wide it is on desktop. It opens from ⌘⇧M, on
 * desktop the rail on the right edge, or on the phone layout a swipe toward the inline start
 * (dock-reveal.ts), and stays open — across tabs, navigation and reloads — until the user closes it
 * (the collapse or close button, the shortcut again, dragging it to the rail, or on the phone
 * swiping it away or Android back).
 *
 * The state is per window: it is read from localStorage once and written back on every change,
 * so a reload starts where it left off, but opening the dock in one window never opens it in
 * another. Storage can throw (private mode, blocked site data); the value then lives in memory
 * for this session.
 */

export const MERCHIVA_DOCK_STORAGE_KEY = "merchiva_assistant_dock";
export const MERCHIVA_DOCK_WIDTH_KEY = "merchiva_assistant_dock_width";

/** Desktop dock width limits, in pixels (the collapsed rail is RAIL_WIDTH in dock-panel.tsx). */
export const DOCK_MIN_WIDTH = 220;
export const DOCK_MAX_WIDTH = 680;
export const DOCK_DEFAULT_WIDTH = 420;

const listeners = new Set<() => void>();
let open: boolean | null = null;
/** Mounted in-flow slots (the desktop browser chrome); without one the dock overlays the page. */
let slots = 0;
/** Set when the user opens the dock, so the panel that mounts for it focuses the composer. */
let focusPending = false;
let returnFocus: HTMLElement | null = null;
let width: number | null = null;

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readOpen(): boolean {
  if (open === null) {
    try {
      open = window.localStorage.getItem(MERCHIVA_DOCK_STORAGE_KEY) === "1";
    } catch {
      open = false;
    }
  }
  return open;
}

function writeOpen(next: boolean): void {
  open = next;
  try {
    window.localStorage.setItem(MERCHIVA_DOCK_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Kept in memory for this session.
  }
  emit();
}

export function openMerchivaDock(): void {
  if (readOpen()) return;
  const active = document.activeElement;
  returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
  focusPending = true;
  writeOpen(true);
}

export function closeMerchivaDock(): void {
  if (!readOpen()) return;
  const target = returnFocus;
  returnFocus = null;
  focusPending = false;
  writeOpen(false);
  // Whatever had focus in the panel unmounts or goes inert; hand focus back to where it was.
  if (!target) return;
  window.requestAnimationFrame(() => {
    if (target.isConnected) target.focus({ preventScroll: true });
  });
}

/** Follows a drag of the desktop dock to or from the rail, or a swipe on the phone: no focus moves. */
export function setMerchivaDockOpen(next: boolean): void {
  if (readOpen() === next) return;
  if (!next) {
    returnFocus = null;
    focusPending = false;
  }
  writeOpen(next);
}

export function toggleMerchivaDock(): void {
  if (readOpen()) closeMerchivaDock();
  else openMerchivaDock();
}

export function isDockFocusPending(): boolean {
  return focusPending;
}

export function clearDockFocusPending(): void {
  focusPending = false;
}

export function readDockWidth(): number {
  if (width === null) {
    let stored = NaN;
    try {
      stored = Number(window.localStorage.getItem(MERCHIVA_DOCK_WIDTH_KEY));
    } catch {
      // Default below.
    }
    width = Number.isFinite(stored) && stored > 0 ? stored : DOCK_DEFAULT_WIDTH;
  }
  return Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, width));
}

export function writeDockWidth(next: number): void {
  width = Math.round(next);
  try {
    window.localStorage.setItem(MERCHIVA_DOCK_WIDTH_KEY, String(width));
  } catch {
    // Kept in memory for this session.
  }
}

/** Server snapshot: closed. */
export function useMerchivaDockOpen(): boolean {
  return useSyncExternalStore(subscribe, readOpen, () => false);
}

/** Claims the in-flow slot for as long as the caller is mounted. */
export function useClaimDockSlot(): void {
  useLayoutEffect(() => {
    slots += 1;
    emit();
    return () => {
      slots -= 1;
      emit();
    };
  }, []);
}

export function useHasDockSlot(): boolean {
  return useSyncExternalStore(subscribe, () => slots > 0, () => false);
}
