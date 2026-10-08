import type { Transition } from "motion/react";
import { shouldCommit, type SwipeDirection } from "@/lib/gestures/page-swipe";

/*
 * Geometry and decisions for the /manager phone chrome (components/browser-shell/mobile-app):
 * the sidebar drawer at the inline start, which the menu button or a swipe toward the inline end
 * opens by pushing the page aside, and the routing of a page swipe between that drawer and
 * Mr. Merchiva, whom a swipe toward the inline start pulls in from the end edge. Also how much of
 * the viewport bottom the page leaves free, and which pages own the menu button's corner.
 *
 * "Progress" is the drawer's reveal: 0 closed, 1 open. Pure values only: nothing here touches
 * `window`, so the math is testable. The swipe rules themselves live in lib/gestures/page-swipe.ts.
 */

/** The drawer is 85% of the frame, at most 300px. */
export const DRAWER_MAX_WIDTH = 300;
export const DRAWER_FRAME_SHARE = 0.85;

/** Settle when no finger drives the drawer (menu button, release, close). */
export const DRAWER_SETTLE: Transition = { duration: 0.24, ease: [0.4, 0, 0.2, 1] };
export const DRAWER_INSTANT: Transition = { duration: 0 };

/** The pushed page's leading corners, its shadow and the scrim, at full reveal. */
export const DRAWER_CONTENT_RADIUS = 16;
export const DRAWER_SHADOW_ALPHA = 0.18;
/** The sidebar beneath grows from this scale as it fades in. */
export const DRAWER_SIDEBAR_MIN_SCALE = 0.94;

/** In a plain iOS Safari tab, touches this close to either screen edge are Safari's own swipes. */
export const SAFARI_EDGE_PX = 24;

/**
 * Routes whose page draws its own control in the top start corner — the Docs, Sheets and Slides
 * editors' Back (Done while editing) — so the menu button stands aside there.
 */
export const OWN_CORNER_ROUTES: readonly string[] = ["/manager/docs/edit", "/manager/drive/sheet", "/manager/drive/slides"];

export function pageOwnsCorner(pathname: string): boolean {
  return OWN_CORNER_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Viewport pixels the page leaves free at the bottom (lib/browser-shell/mobile/use-reserve-bottom.ts
 * turns this into an offset from real rects, since the 100dvh frame overflows the padded body):
 *   immersive            0 — the page takes the whole viewport and handles the keyboard itself
 *   docked, typing       the keyboard: docked routes (the editors, personnel, channel) end at its
 *                        top, as they did above the old bottom chrome. `keyboardInset` is
 *                        useVirtualKeyboard().inset: 0 where the webview resizes (Android native),
 *                        the keyboard height where it doesn't (iOS, the web)
 *   otherwise            the bottom safe-area inset, so the page ends above the home indicator and
 *                        nothing jumps while typing
 */
export function pageFootprint(state: {
  readonly immersive: boolean;
  readonly docked: boolean;
  readonly keyboardOpen: boolean;
  readonly keyboardInset: number;
  readonly bottomInset: number;
}): number {
  if (state.immersive) return 0;
  if (state.docked && state.keyboardOpen) return Math.max(0, state.keyboardInset);
  return Math.max(0, state.bottomInset);
}

export function drawerWidth(frameWidth: number): number {
  if (!(frameWidth > 0)) return DRAWER_MAX_WIDTH;
  return Math.round(Math.min(DRAWER_MAX_WIDTH, frameWidth * DRAWER_FRAME_SHARE));
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

/** A horizontal distance (or velocity) measured toward the inline end: rightward in LTR, leftward in RTL. */
export function towardEnd(dx: number, dir: "ltr" | "rtl"): number {
  return dir === "rtl" ? -dx : dx;
}

/** The drawer's progress while a finger that grabbed it at `base` has moved `dx`. */
export function drawerProgressAt(base: number, dx: number, width: number, dir: "ltr" | "rtl"): number {
  if (!(width > 0)) return clampProgress(base);
  return clampProgress(base + towardEnd(dx, dir) / width);
}

/** The pushed page's x offset in px: toward the inline end by the drawer width × progress. */
export function contentOffset(progress: number, width: number, dir: "ltr" | "rtl"): number {
  const offset = width * clampProgress(progress);
  return dir === "rtl" ? -offset : offset;
}

/** `border-radius` of the pushed page: its leading (inline-start) corners round as it moves. */
export function contentRadius(progress: number, dir: "ltr" | "rtl"): string {
  const r = Math.round(DRAWER_CONTENT_RADIUS * clampProgress(progress) * 10) / 10;
  return dir === "rtl" ? `0px ${r}px ${r}px 0px` : `${r}px 0px 0px ${r}px`;
}

/** `box-shadow` of the pushed page, cast over the drawer; none at rest. */
export function contentShadow(progress: number, dir: "ltr" | "rtl"): string {
  const p = clampProgress(progress);
  if (p === 0) return "none";
  const alpha = Math.round(DRAWER_SHADOW_ALPHA * p * 1000) / 1000;
  return `${dir === "rtl" ? 4 : -4}px 0px 16px rgba(0, 0, 0, ${alpha})`;
}

export function sidebarScale(progress: number): number {
  return DRAWER_SIDEBAR_MIN_SCALE + (1 - DRAWER_SIDEBAR_MIN_SCALE) * clampProgress(progress);
}

export function inSafariEdge(clientX: number, viewportWidth: number): boolean {
  return clientX < SAFARI_EDGE_PX || clientX > viewportWidth - SAFARI_EDGE_PX;
}

export type PageSwipeAction = "openDrawer" | "closeDrawer" | "merchiva" | "none";

/**
 * What a locked horizontal swipe does. With the drawer open, toward the start closes it (never
 * Mr. Merchiva) and toward the end does nothing; closed, toward the end opens it and toward the
 * start pulls Mr. Merchiva in when he is available.
 */
export function pageSwipeAction(state: {
  readonly drawerOpen: boolean;
  readonly direction: SwipeDirection;
  readonly merchivaAvailable: boolean;
}): PageSwipeAction {
  if (state.drawerOpen) return state.direction === "toStart" ? "closeDrawer" : "none";
  if (state.direction === "toEnd") return "openDrawer";
  return state.merchivaAvailable ? "merchiva" : "none";
}

/**
 * Whether the drawer ends open after a drag. `progress` is where the finger left it and
 * `velocity` the signed horizontal release speed in px/ms. Opening commits past
 * lib/gestures/page-swipe.ts `shouldCommit`; closing commits by the same rule toward closed.
 */
export function drawerReleaseOpen(
  action: "openDrawer" | "closeDrawer",
  progress: number,
  velocity: number,
  dir: "ltr" | "rtl",
): boolean {
  const v = towardEnd(velocity, dir);
  const p = clampProgress(progress);
  return action === "openDrawer" ? shouldCommit(p, v) : !shouldCommit(1 - p, -v);
}

/** Mr. Merchiva's reveal while a finger has moved `dx`: his panel follows it in from the end edge. */
export function merchivaProgressAt(dx: number, panelWidth: number, dir: "ltr" | "rtl"): number {
  if (!(panelWidth > 0)) return 0;
  return clampProgress(-towardEnd(dx, dir) / panelWidth);
}

export function merchivaReleaseCommit(progress: number, velocity: number, dir: "ltr" | "rtl"): boolean {
  return shouldCommit(clampProgress(progress), -towardEnd(velocity, dir));
}
