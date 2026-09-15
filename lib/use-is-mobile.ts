"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Single source of truth for JS-side responsive branching.
 *
 * The personnel hub (and anything else that forks layout in JS rather than
 * CSS) must use this hook with the same breakpoint its CSS classes use —
 * mixing `md:` classes with a 1024px matchMedia is how the 768–1023px
 * "third layout" dead zone happened.
 *
 * Reads the media query synchronously on client renders so components that
 * mount after hydration (e.g. behind auth) paint the right branch on their
 * first frame instead of flashing the desktop layout. During SSR/hydration it
 * reports `false` (the server snapshot) and corrects right after.
 */
export const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;

  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
