/*
 * Page-level horizontal swipes on phones: the /manager mobile chrome's sidebar swipe (toward the
 * inline end) and Mr. Merchiva swipe (toward the inline start), and the Merchiva panel's own
 * close swipe. Pure decisions plus small DOM probes; the probes take the style lookup as a
 * parameter so the rules are testable without a touch device.
 *
 * A swipe yields to the page whenever the page could want the same drag:
 *   at touchstart  a second finger, an opted-out region, an editable, or an ancestor whose
 *                  touch-action leaves horizontal pans to script (canvases, slide stages);
 *   at axis lock   a vertical first move, a gesture the page already claimed
 *                  (defaultPrevented / not cancelable), or any horizontally scrollable ancestor —
 *                  at its edge too, like iOS, so a flick that runs out of table never opens a panel.
 */

/** Regions that keep their horizontal drags: mark the element or an ancestor. */
export const SWIPE_OPT_OUT_SELECTOR = "[data-no-sidebar-swipe], [data-no-shell-swipe], [data-no-swipe]";

/**
 * Movement before the axis is decided, and how much more horizontal than vertical it must be.
 * The lock comes early so a decided swipe can prevent its moves before the browser starts a native
 * scroll (after which every touchmove is uncancelable): WebKit hands script every pixel of a drag,
 * and a still-pending move that looks horizontal stays under 6·√(1 + 1/1.2²) ≈ 7.8px, inside
 * Chromium's ~8dp straight-line slop. (Chromium holds touchmoves inside its slop back from script
 * altogether and delivers the first one beyond it cancelable, so there the lock lands on that one.)
 */
export const SWIPE_AXIS_LOCK_PX = 6;
export const SWIPE_AXIS_RATIO = 1.2;
/**
 * A swipe decided at the lock only takes over — moves its panel and swallows the click that
 * follows — once the finger is this far out. Until then its moves are prevented (so no scroll
 * starts) but a tap whose thumb rolled a few pixels sideways still clicks.
 */
export const SWIPE_CLAIM_PX = 10;
/** A release commits past this share of the panel width, or faster than this toward open. */
export const SWIPE_COMMIT_SHARE = 0.4;
export const SWIPE_COMMIT_VELOCITY = 0.35; // px/ms
/** Release velocity is measured over the samples of this last window. */
export const SWIPE_VELOCITY_WINDOW_MS = 80;

export type AxisLock = "pending" | "horizontal" | "vertical";

export function lockAxis(dx: number, dy: number): AxisLock {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_AXIS_LOCK_PX) return "pending";
  return ax > ay * SWIPE_AXIS_RATIO ? "horizontal" : "vertical";
}

/** Whether a decided swipe has travelled far enough to take over (see SWIPE_CLAIM_PX). */
export function claimReached(dx: number): boolean {
  return Math.abs(dx) >= SWIPE_CLAIM_PX;
}

/** "toStart" is toward the inline start (leftward in LTR, rightward in RTL); "toEnd" the other way. */
export type SwipeDirection = "toStart" | "toEnd";

export function swipeDirection(dx: number, dir: "ltr" | "rtl"): SwipeDirection {
  return (dir === "rtl") === dx > 0 ? "toStart" : "toEnd";
}

/**
 * Whether a release opens (or, for a close swipe, closes) the panel. `progress` is the share of
 * the way travelled toward that end (0–1), `velocity` the release speed toward it in px/ms
 * (negative when the finger was heading back). A fast flick back always cancels.
 */
export function shouldCommit(progress: number, velocity: number): boolean {
  if (velocity <= -SWIPE_COMMIT_VELOCITY) return false;
  return progress >= SWIPE_COMMIT_SHARE || velocity >= SWIPE_COMMIT_VELOCITY;
}

export interface SwipeSample {
  /** Timestamp in ms (event.timeStamp or performance.now()). */
  readonly t: number;
  readonly x: number;
}

/** Signed horizontal velocity (px/ms) over the last SWIPE_VELOCITY_WINDOW_MS of samples. */
export function releaseVelocity(samples: readonly SwipeSample[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last.t - samples[i].t > SWIPE_VELOCITY_WINDOW_MS) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** Whether a computed `touch-action` leaves horizontal panning to script (so the page owns it). */
export function blocksHorizontalPan(touchAction: string): boolean {
  const value = touchAction.trim();
  if (value === "" || value === "auto" || value === "manipulation") return false;
  if (value === "none") return true;
  return !/\bpan-(x|left|right)\b/.test(value);
}

const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "radio", "submit", "reset", "image", "file", "color", "hidden"]);
const EDITABLE_SELECTOR = 'textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"]';

/** Text fields, selects, sliders and rich-text editors: a horizontal drag there moves a caret or a value. */
export function isEditableTarget(target: Element): boolean {
  if (target.closest(EDITABLE_SELECTOR)) return true;
  const input = target.closest("input");
  return input !== null && !NON_TEXT_INPUT_TYPES.has((input as HTMLInputElement).type);
}

type StyleOf = (element: Element) => Pick<CSSStyleDeclaration, "touchAction" | "overflowX">;

const computedStyle: StyleOf = (element) => getComputedStyle(element);

/** Ancestors from `target` up to and including `root`; empty when `target` is outside `root`. */
function chain(target: Element, root: Element): Element[] {
  const nodes: Element[] = [];
  for (let node: Element | null = target; node; node = node.parentElement) {
    nodes.push(node);
    if (node === root) return nodes;
  }
  return [];
}

/**
 * touchstart: whether a page swipe may begin at `target` inside `root` (the swipe surface).
 * Portaled layers (dialog pages, drawers, popovers) are outside `root` and never start one.
 */
export function swipeStartAllowed(target: Element | null, root: Element, styleOf: StyleOf = computedStyle): boolean {
  if (!target) return false;
  const nodes = chain(target, root);
  if (nodes.length === 0) return false;
  if (target.closest(SWIPE_OPT_OUT_SELECTOR)) return false;
  if (isEditableTarget(target)) return false;
  return !nodes.some((node) => blocksHorizontalPan(styleOf(node).touchAction ?? ""));
}

/**
 * A page's own vertical scroller ([data-tab-scroll-root]) computes overflow-x: auto too, so a page
 * a few pixels too wide would lose both swipes everywhere on it. It only keeps the drag when it
 * really scrolls sideways.
 */
export const SCROLL_ROOT_OVERFLOW_SLACK_PX = 24;

/** Axis lock: whether an ancestor of `target` up to `root` scrolls horizontally (it keeps the drag). */
export function hasHorizontalScroller(target: Element, root: Element, styleOf: StyleOf = computedStyle): boolean {
  return chain(target, root).some((node) => {
    const slack = node.hasAttribute("data-tab-scroll-root") ? SCROLL_ROOT_OVERFLOW_SLACK_PX : 1;
    if (node.scrollWidth <= node.clientWidth + slack) return false;
    const overflowX = styleOf(node).overflowX;
    return overflowX === "auto" || overflowX === "scroll";
  });
}
