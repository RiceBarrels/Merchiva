import { useCallback, useSyncExternalStore } from "react";

/**
 * Bottom offset for `#mobile-content` so the page box ends exactly `footprintPx` above the
 * viewport bottom. Measured from real rects, so it stays correct with the root wrapper's
 * `--merchiva-chrome-height`, the body's env() padding and a `100dvh` frame that overflows the
 * padded body (mobile-safari spec §9, plan R11).
 *
 *   reserve = max(0, frame.bottom − (viewportHeight − footprint))
 *
 * Recomputed on frame resize, window resize, orientation change and visualViewport resize.
 */
export function useReserveBottom(frame: HTMLElement | null, footprintPx: number): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !frame) return () => {};
      const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onChange) : null;
      observer?.observe(frame);
      const viewport = window.visualViewport ?? null;
      window.addEventListener("resize", onChange);
      window.addEventListener("orientationchange", onChange);
      viewport?.addEventListener("resize", onChange);
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", onChange);
        window.removeEventListener("orientationchange", onChange);
        viewport?.removeEventListener("resize", onChange);
      };
    },
    [frame],
  );

  const getSnapshot = useCallback(() => {
    if (!frame) return Math.max(0, Math.round(footprintPx));
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const bottom = frame.getBoundingClientRect().bottom;
    return Math.max(0, Math.round(bottom - (viewportHeight - footprintPx)));
  }, [frame, footprintPx]);

  const getServerSnapshot = useCallback(() => Math.max(0, Math.round(footprintPx)), [footprintPx]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
