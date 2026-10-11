// The swipe that closes an open device app (./mini-app-shell.tsx, on /personal): a drag down, or toward
// the inline end (from left to right in LTR), picks the app's window up under the finger. It shrinks about the spot the finger took it by and follows the
// finger, and the home screen comes forward as it goes. Let go far or fast enough and the window flies
// back into its icon from where it is; otherwise it springs back.
//
// The axis lock, start rules and release velocity are the page swipes' (lib/gestures/page-swipe.ts). The
// app keeps every drag it could want itself: a scroller that is not at its top (down) or that scrolls
// sideways (end), a region that takes pans with touch-action, an editable, an opted-out region and the
// Drive editors.
//
// Pure decisions plus DOM probes that take the style lookup as a parameter, so they are unit-tested.

import { clamp01 } from "./mini-app-launch";
import {
  SWIPE_COMMIT_VELOCITY,
  SWIPE_OPT_OUT_SELECTOR,
  blocksHorizontalPan,
  isEditableTarget,
  lockAxis,
  swipeDirection,
} from "@/lib/gestures/page-swipe";

/** Which way a close swipe goes. */
export type CloseSwipe = "down" | "toEnd";

/** A release closes the app past this share of the screen (height for down, width for toEnd)… */
export const CLOSE_SWIPE_SHARE = 0.2;
/** …or faster than this toward closing (px/ms). */
export const CLOSE_SWIPE_VELOCITY = SWIPE_COMMIT_VELOCITY;
/** The window's scale with the finger a whole screen out. */
export const DRAG_MIN_SCALE = 0.55;
/** Pull over which the window's corners round to the screen's. */
const ROUND_BY_PULL = 0.08;

/** Regions inside an app that keep all their drags. The Drive editors own theirs (canvas, selection, handles). */
const CLOSE_SWIPE_OPT_OUT_SELECTOR = `${SWIPE_OPT_OUT_SELECTOR}, [data-drive-editor], canvas`;

/** At the axis lock: the close swipe a first move starts, or null when it is not one. */
export function closeSwipeFor(dx: number, dy: number, dir: "ltr" | "rtl"): CloseSwipe | null | "pending" {
  const axis = lockAxis(dx, dy);
  if (axis === "pending") return "pending";
  if (axis === "vertical") return dy > 0 ? "down" : null;
  return swipeDirection(dx, dir) === "toEnd" ? "toEnd" : null;
}

/** How far the finger is along the close swipe, in px (negative when it went back past its start). */
export function closeDistance(swipe: CloseSwipe, dx: number, dy: number, dir: "ltr" | "rtl"): number {
  if (swipe === "down") return dy;
  return dir === "rtl" ? -dx : dx;
}

/** The share of the way toward closing (0–1) for a distance along the swipe, against the screen. */
export function closePull(swipe: CloseSwipe, distance: number, size: { w: number; h: number }): number {
  const span = swipe === "down" ? size.h : size.w;
  return span > 0 ? clamp01(distance / span) : 0;
}

/** Whether a release closes the app. A fast flick back always keeps it open. */
export function closeOnRelease(pull: number, velocity: number): boolean {
  if (velocity <= -CLOSE_SWIPE_VELOCITY) return false;
  return pull >= CLOSE_SWIPE_SHARE || velocity >= CLOSE_SWIPE_VELOCITY;
}

export interface DragFrame {
  /** The window's transform, about `origin`: the finger's travel, then the shrink. */
  x: number;
  y: number;
  scale: number;
  /** The visual corner radius the window's clip should show. */
  radius: number;
}

/**
 * The picked-up window. `held` is how much of the drag still applies: 1 under the finger, easing to 0 as
 * the window springs back or flies into its icon (the launch frames take over from there).
 */
export function dragFrame(drag: { dx: number; dy: number; pull: number }, held: number, screenRadius: number): DragFrame {
  const h = clamp01(held);
  const pull = clamp01(drag.pull) * h;
  return {
    x: drag.dx * h,
    y: drag.dy * h,
    scale: 1 - (1 - DRAG_MIN_SCALE) * pull,
    radius: screenRadius * clamp01(pull / ROUND_BY_PULL),
  };
}

/** How far the home screen behind is receded (launch progress) while the window is pulled. */
export function homeProgressAt(progress: number, pull: number): number {
  return clamp01(progress) * (1 - clamp01(pull));
}

type StyleOf = (element: Element) => Pick<CSSStyleDeclaration, "touchAction" | "overflowX" | "overflowY">;

const computedStyle: StyleOf = (element) => getComputedStyle(element);

/** `target` and its ancestors below `root` (the window, which opts its own surface out of page swipes). */
function inside(target: Element, root: Element): Element[] | null {
  const nodes: Element[] = [];
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (node === root) return nodes;
    nodes.push(node);
  }
  return null;
}

/** Whether a computed `touch-action` leaves vertical panning to script. */
export function blocksVerticalPan(touchAction: string): boolean {
  const value = touchAction.trim();
  if (value === "" || value === "auto" || value === "manipulation") return false;
  if (value === "none") return true;
  return !/\bpan-(y|up|down)\b/.test(value);
}

/** touchstart: whether a close swipe may begin at `target` inside the app's window `root`. */
export function closeSwipeStartAllowed(target: Element | null, root: Element): boolean {
  if (!target) return false;
  const nodes = inside(target, root);
  if (!nodes) return false;
  if (nodes.some((node) => node.matches(CLOSE_SWIPE_OPT_OUT_SELECTOR))) return false;
  return !isEditableTarget(target);
}

/**
 * Axis lock: whether the app keeps this drag. Down yields to a scroller that is not at its top (the app
 * scrolls back up first) and to a vertical touch-action; toEnd yields to any sideways scroller, at its
 * edge too, and to a horizontal touch-action.
 */
export function appKeepsDrag(swipe: CloseSwipe, target: Element, root: Element, styleOf: StyleOf = computedStyle): boolean {
  const nodes = inside(target, root) ?? [];
  return nodes.some((node) => {
    const style = styleOf(node);
    if (swipe === "down") {
      if (blocksVerticalPan(style.touchAction ?? "")) return true;
      const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
      return scrolls && node.scrollHeight > node.clientHeight + 1 && node.scrollTop > 0;
    }
    if (blocksHorizontalPan(style.touchAction ?? "")) return true;
    const scrolls = style.overflowX === "auto" || style.overflowX === "scroll";
    return scrolls && node.scrollWidth > node.clientWidth + 1;
  });
}
