import { useCallback, useSyncExternalStore } from "react";
import { getSafeAreaInsets } from "@/lib/safe-area";

/** Delays after mount at which the native safe-area plugin (async) has usually answered. */
const PLUGIN_SETTLE_DELAYS_MS = [250, 1000, 2500] as const;

/**
 * Bottom safe-area inset in CSS pixels: the larger of the `env(safe-area-inset-bottom)` probe
 * element (web / PWA, where the plugin reports 0) and the Capacitor plugin value (native).
 * Mobile-safari spec §6.1. `probe` is a fixed element whose height is the env() value.
 */
export function useBottomSafeInset(probe: HTMLElement | null): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const observer = typeof ResizeObserver !== "undefined" && probe ? new ResizeObserver(onChange) : null;
      if (observer && probe) observer.observe(probe);
      window.addEventListener("resize", onChange);
      window.addEventListener("orientationchange", onChange);
      const timers = PLUGIN_SETTLE_DELAYS_MS.map((ms) => window.setTimeout(onChange, ms));
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", onChange);
        window.removeEventListener("orientationchange", onChange);
        for (const timer of timers) window.clearTimeout(timer);
      };
    },
    [probe],
  );

  const getSnapshot = useCallback(() => {
    const fromProbe = probe ? probe.offsetHeight : 0;
    const fromPlugin = getSafeAreaInsets().bottom || 0;
    return Math.max(0, Math.round(Math.max(fromProbe, fromPlugin)));
  }, [probe]);

  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
