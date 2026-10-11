/*
 * Keeping the browser's own back / forward swipe off the app surfaces. Browsers give pages no
 * real switch for it, so this is two best-effort measures:
 *   - `overscroll-behavior-x: none` on <html> stops the trackpad two-finger swipe (macOS) and
 *     Chromium's overscroll navigation; iOS Safari's edge swipe ignores it.
 *   - a non-passive touchstart in Safari's edge band (SAFARI_EDGE_PX, the band the phone shell's
 *     own page swipe already leaves to Safari) is prevented, which stops iOS Safari's edge swipe
 *     on some versions and not on others. Preventing a touchstart also drops its click and its
 *     scroll, so an interactive element under the finger keeps its touch (and the native swipe).
 */

import { inSafariEdge } from "@/lib/browser-shell/mobile-app/drawer";
import type { AppMode } from "@/lib/app-mode";

/** Elements whose touch must stay intact even at the screen edge. */
export const NATIVE_BACK_INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="slider"], [contenteditable=""], [contenteditable="true"]';

/** Device surfaces and the back office; the public marketing pages keep normal browser back. */
export function nativeBackGuardedPath(pathname: string): boolean {
  return ["/manager", "/store", "/personal", "/choose"].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/** A personal-mode phone is the employee's app on every route, so it never takes the native swipe. */
export function nativeBackGuarded(pathname: string, mode: AppMode | null): boolean {
  return mode === "personal" || nativeBackGuardedPath(pathname);
}

interface ClosestTarget {
  closest(selector: string): unknown;
}

/** Whether a single-finger touchstart at `x` should be prevented to block the native swipe. */
export function shouldBlockNativeBack(
  touches: number,
  x: number,
  width: number,
  target: ClosestTarget | null,
): boolean {
  if (touches !== 1 || !inSafariEdge(x, width)) return false;
  return !target?.closest(NATIVE_BACK_INTERACTIVE_SELECTOR);
}
