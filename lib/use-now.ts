"use client";

import { useEffect, useState } from "react";

/**
 * Re-renders every `ms` (default 1s) and returns the current Date.
 *
 * Reading the clock during render is impure — the value changes without a
 * re-render to show it, and React may render twice and get two answers. This
 * hook is the shared way to read "now": the clock advances in an effect, so
 * render stays pure and anything derived from it stays live.
 *
 * `components/device/time.ts` re-exports it for the device surfaces.
 */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
