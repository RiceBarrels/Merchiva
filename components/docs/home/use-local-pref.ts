"use client";

// Per-viewer UI preferences for the docs home (grid/list, templates collapsed).
// localStorage when available, in-memory otherwise (private windows, blocked
// site data), so toggles still work for the session.

import { useCallback, useSyncExternalStore } from "react";

const PREF_EVENT = "merchiva:docs-home-pref";
const memory = new Map<string, string>();

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function subscribePref(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(PREF_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PREF_EVENT, onChange);
  };
}

const getServerPref = (): string | null => null;

export function useLocalPref(key: string): [string | null, (value: string | null) => void] {
  const getSnapshot = useCallback(() => readPref(key), [key]);
  const value = useSyncExternalStore(subscribePref, getSnapshot, getServerPref);
  const setValue = useCallback(
    (next: string | null) => {
      try {
        if (next === null) localStorage.removeItem(key);
        else localStorage.setItem(key, next);
      } catch {
        if (next === null) memory.delete(key);
        else memory.set(key, next);
      }
      window.dispatchEvent(new Event(PREF_EVENT));
    },
    [key],
  );
  return [value, setValue];
}
