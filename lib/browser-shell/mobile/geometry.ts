import type { Transition } from "motion/react";

/*
 * Geometry and motion constants for the mobile (iOS Safari-style) chrome.
 * Mobile-safari spec §6.1 and §22. Pure values only: nothing here touches `window`.
 */

export const CHROME = {
  /** Space above the address row. */
  padTop: 6,
  /** Address row (store menu, title, reload). */
  pillH: 42,
  /** Gap between the address row and the toolbar. */
  rowGap: 2,
  /** Toolbar row (back, forward, share, bookmarks, tabs). 44px touch targets. */
  toolbarH: 44,
  /** Minimized title strip. */
  miniH: 28,
  /** Bottom padding when the device reports no safe-area inset. */
  minBottomPad: 4,
} as const;

/** Height of the expanded chrome above the bottom inset: 6 + 42 + 2 + 44 = 94. */
export const BODY_EXPANDED = CHROME.padTop + CHROME.pillH + CHROME.rowGap + CHROME.toolbarH;

export function bottomPad(inset: number): number {
  return Math.max(inset, CHROME.minBottomPad);
}

/** Viewport pixels the expanded chrome covers. */
export function expandedFootprint(inset: number): number {
  return BODY_EXPANDED + bottomPad(inset);
}

/** Viewport pixels the minimized chrome covers. */
export function minimizedFootprint(inset: number): number {
  return CHROME.miniH + bottomPad(inset);
}

export interface FootprintInputs {
  readonly immersive: boolean;
  readonly docked: boolean;
  readonly keyboardOpen: boolean;
  /** `useVirtualKeyboard().inset`: 0 where the webview resizes, the keyboard height where it doesn't. */
  readonly keyboardInset: number;
  readonly bottomInset: number;
}

/**
 * Viewport pixels `#mobile-content` leaves free at the bottom (spec §9). Overlay routes keep the
 * minimized reserve while typing, so nothing jumps. Docked routes end at the top of the keyboard.
 * On Android native the webview resizes, so the inset is 0. On iOS native (Keyboard resize "body")
 * and on the web (visualViewport) the viewport keeps its height, so the inset is the keyboard height.
 */
export function contentFootprint({ immersive, docked, keyboardOpen, keyboardInset, bottomInset }: FootprintInputs): number {
  if (immersive) return 0;
  if (!docked) return minimizedFootprint(bottomInset);
  return keyboardOpen ? Math.max(0, keyboardInset) : expandedFootprint(bottomInset);
}

export interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** CSS layout box of an element, which ignores transforms (`offset*` on an HTMLElement). */
export interface LayoutBox {
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
}

/**
 * Viewport rect of a box positioned inside `origin` (its offsetParent's padding-box corner in
 * viewport coordinates), ignoring the box's own transform. A DynamicUIElement page pushes
 * `#mobile-content` with translate + scale, so getBoundingClientRect would be displaced.
 * Null when the box has no size.
 */
export function untransformedRect(origin: { readonly left: number; readonly top: number }, box: LayoutBox): ViewportRect | null {
  if (!(box.offsetWidth > 0) || !(box.offsetHeight > 0)) return null;
  return {
    left: origin.left + box.offsetLeft,
    top: origin.top + box.offsetTop,
    width: box.offsetWidth,
    height: box.offsetHeight,
  };
}

/** How far the translucent surface slides down when the chrome minimizes (94 - 28 = 66). */
export const COLLAPSE_SURFACE_DY = BODY_EXPANDED - CHROME.miniH;

/** How far the address row travels so its centre lands in the middle of the minimized strip (53). */
export const COLLAPSE_ROW_DY = COLLAPSE_SURFACE_DY + CHROME.miniH / 2 - (CHROME.padTop + CHROME.pillH / 2);

/** Toolbar drop while collapsing (it fades out at the same time). */
export const COLLAPSE_TOOLBAR_DY = 24;

/** Title scale at full collapse. */
export const COLLAPSED_TITLE_SCALE = 0.88;

// ─── Stacking (spec §5 z-index table, plan D28) ─────────────────────────────

export const Z = {
  edgeIndicator: 46,
  chrome: 48,
  /** Chrome z-index while N DynamicUIElement pages are open: 50 + N. */
  chromeOverDialogBase: 50,
  overview: 80,
  overviewBar: 81,
  searchSheet: 80,
  shellDrawerOverlay: 89,
  shellDrawer: 90,
} as const;

export function chromeZIndex(openDialogs: number): number {
  return openDialogs > 0 ? Z.chromeOverDialogBase + openDialogs : Z.chrome;
}

// ─── Gesture thresholds ─────────────────────────────────────────────────────

export const GESTURE = {
  /** Axis lock distance (same as DynamicUIElement's swipe). */
  axisLock: 8,
  /** Fraction of the pill width that commits a tab switch. */
  commitFraction: 0.3,
  /** Release velocity (px/ms) that commits a tab switch. */
  commitVelocity: 0.45,
  /** Upward travel on the chrome that opens the tab overview. */
  swipeUp: 48,
  /** Upward release velocity (px/ms) that opens the tab overview. */
  swipeUpVelocity: 0.5,
  /** Resistance past the last tab (the "New tab" ghost follows at 60%). */
  newTabResistance: 0.6,
  /** Rubber band before the first tab. */
  rubberBand: 0.35,
  /** Gap between the live page and a neighbour ghost. */
  ghostGap: 12,
  /** Edge-back start zone. */
  edgeZone: 20,
  /** Edge-back commit distance. */
  edgeCommit: 64,
  /** Long-press delay. */
  longPressMs: 500,
  /** Movement that cancels a long press. */
  longPressSlop: 8,
  /** Overview card swipe-to-close distance as a fraction of the card width. */
  cardCloseFraction: 0.4,
  /** Overview card swipe-to-close velocity (px/s, motion's unit). */
  cardCloseVelocity: 500,
} as const;

/** Scroll-to-minimize accumulators (spec §8). */
export const SCROLL = {
  minRange: 64,
  edgeTop: 8,
  edgeBottom: 4,
  downAccumulate: 24,
  downMinTop: 44,
  upAccumulate: 32,
  suppressMs: 400,
} as const;

// ─── Motion (spec §22) ──────────────────────────────────────────────────────

export const INSTANT: Transition = { duration: 0 };

/** Chrome collapse / hide: damping ratio ~1, ~300ms, no bounce. */
export const CHROME_SPRING: Transition = { type: "spring", stiffness: 520, damping: 46, mass: 1 };

/** Button taps (bottom-bar.tsx). */
export const TAP_SPRING: Transition = { type: "spring", damping: 18, stiffness: 450 };

/** Page track and ghost settle. */
export const PAGE_SPRING: Transition = { type: "spring", stiffness: 400, damping: 40, mass: 1 };

export const ZOOM_EASE = [0.32, 0.72, 0, 1] as const;
export const STANDARD_EASE = [0.4, 0, 0.2, 1] as const;

/** Tab zoom in / out (the dialog curve, shortened to 400ms). */
export const ZOOM: Transition = { duration: 0.4, ease: ZOOM_EASE };
export const ZOOM_MS = 400;

/** Overview sibling reflow after a card closes. */
export const CARD_LAYOUT_SPRING: Transition = { type: "spring", stiffness: 500, damping: 42 };

/** Card close fade/scale. */
export const CARD_EXIT: Transition = { duration: 0.18, ease: STANDARD_EASE };

export const OVERVIEW_FADE: Transition = { duration: 0.18, ease: "easeOut" };
export const GRID_FADE: Transition = { duration: 0.2, ease: "easeOut" };
export const GHOST_FADE: Transition = { duration: 0.12, ease: "easeOut" };
export const GHOST_FADE_MS = 120;
export const SHEET_TRANSITION: Transition = { duration: 0.2, ease: STANDARD_EASE };
export const SHEET_TRANSITION_MS = 200;

/** Longest a ghost / zoom proxy waits for the target page before fading anyway. */
export const NAV_SETTLE_TIMEOUT_MS = 700;

/** vaul needs to release `body { pointer-events: none }` before another overlay opens. */
export const DRAWER_RELEASE_MS = 320;

export function motionOrInstant(reduced: boolean | null, transition: Transition): Transition {
  return reduced ? INSTANT : transition;
}
