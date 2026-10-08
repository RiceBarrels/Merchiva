"use client";

// Whether the page is drawn dark right now: the `dark` class on <html>, which the boot script in app/layout.tsx and
// applyThemeMode (lib/theme.ts) set from the chosen mode ("system" follows the OS). Components that paint outside
// Tailwind (the spreadsheet canvas) follow it through this hook instead of re-deriving the mode.

import { useSyncExternalStore } from "react";

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** The server cannot see the class: light until hydrated. */
const getServerSnapshot = (): boolean => false;

/** True while <html> carries the `dark` class; re-renders when it changes. */
export function useResolvedDark(): boolean {
  return useSyncExternalStore(subscribe, isDark, getServerSnapshot);
}
