"use client";

import { useEffect, useState } from "react";

/**
 * Single source of truth for JS-side responsive branching.
 *
 * The personnel hub (and anything else that forks layout in JS rather than
 * CSS) must use this hook with the same breakpoint its CSS classes use —
 * mixing `md:` classes with a 1024px matchMedia is how the 768–1023px
 * "third layout" dead zone happened.
 */
export const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}
