"use client";

import { useSyncExternalStore } from "react";

/*
 * Per-device visibility of the desktop bookmarks bar (desktop spec §3.4). Kept in a tiny
 * module so the Settings page can toggle it without importing the chrome.
 * Default: visible. Storage can throw (private mode, blocked site data); the last value
 * set in this session is then kept in memory.
 */

export const BOOKMARKS_BAR_STORAGE_KEY = "merchiva_browser_bookmarks_bar";
const CHANGE_EVENT = "merchiva:bookmarks-bar-change";

let memoryValue = true;

function readVisible(): boolean {
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_BAR_STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // Storage unavailable: fall back to the in-memory value.
  }
  return memoryValue;
}

function readServer(): boolean {
  return true;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === BOOKMARKS_BAR_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function setBookmarksBarVisible(visible: boolean): void {
  memoryValue = visible;
  try {
    window.localStorage.setItem(BOOKMARKS_BAR_STORAGE_KEY, visible ? "1" : "0");
  } catch {
    // Kept in memory for this session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** `[visible, setVisible]` for the desktop bookmarks bar. Server snapshot: visible. */
export function useBookmarksBarVisible(): [boolean, (visible: boolean) => void] {
  const visible = useSyncExternalStore(subscribe, readVisible, readServer);
  return [visible, setBookmarksBarVisible];
}
