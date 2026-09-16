import { useEffect, useLayoutEffect, useRef } from "react";
import { animate, type MotionValue } from "motion/react";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { GESTURE, INSTANT, PAGE_SPRING } from "./geometry";

export type PillCommit = "prev" | "next" | "new";

export interface PillSwipeOptions {
  /** Horizontal tab switching allowed (no dialog, no sheet, chrome visible and expanded). */
  enabled: boolean;
  /** Swipe up on the chrome opens the tab overview. */
  swipeUpEnabled: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  /** Swiping past the last tab commits to a new tab (Safari behaviour). */
  allowNew: boolean;
  dir: "ltr" | "rtl";
  /** Page track offset; the live page and the neighbour ghosts follow it. */
  x: MotionValue<number>;
  reducedMotion: boolean;
  /** Current page width in px. */
  width(): number;
  /** Where horizontal swipes may start (the address row). */
  pill: HTMLElement | null;
  onActiveChange(active: boolean): void;
  onCommit(direction: PillCommit): void;
  onSwipeUp(): void;
}

interface Sample {
  readonly t: number;
  readonly dx: number;
  readonly dy: number;
}

interface Gesture {
  readonly x0: number;
  readonly y0: number;
  axis: "x" | "y" | null;
  readonly horizontalAllowed: boolean;
  samples: Sample[];
  dx: number;
  dy: number;
  armed: boolean;
  finished: boolean;
  dragging: boolean;
}

/** Thenable playback controls returned by motion's `animate`. */
type SettleAnimation = ReturnType<typeof animate>;

const VELOCITY_WINDOW_MS = 80;

/** How long after a gesture's touch ends its synthetic click can still arrive. */
export const CLICK_SUPPRESS_MS = 400;

export interface ClickSuppressor {
  /** A touch turned into a gesture: its click must not activate a chrome button. */
  arm(): void;
  /** The touch ended or was cancelled: keep suppressing only for the synthetic-click window. */
  release(): void;
  /** A new touch started: nothing to suppress. */
  reset(): void;
  /** Called for every click; true (and cleared) when the click belongs to the gesture. */
  consume(): boolean;
}

/**
 * Swallows the click that follows a swipe, and nothing later. Keyboard, switch-control and
 * trackpad activations don't send touchstart, so an open-ended flag would eat the next one.
 */
export function createClickSuppressor(now: () => number, windowMs: number = CLICK_SUPPRESS_MS): ClickSuppressor {
  let armed = false;
  let until = Number.NEGATIVE_INFINITY;
  return {
    arm() {
      armed = true;
    },
    release() {
      if (!armed) return;
      armed = false;
      until = now() + windowMs;
    },
    reset() {
      armed = false;
      until = Number.NEGATIVE_INFINITY;
    },
    consume() {
      const suppress = armed || now() <= until;
      armed = false;
      until = Number.NEGATIVE_INFINITY;
      return suppress;
    },
  };
}

function velocity(samples: readonly Sample[], key: "dx" | "dy"): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const sample of samples) {
    if (last.t - sample.t <= VELOCITY_WINDOW_MS) {
      first = sample;
      break;
    }
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last[key] - first[key]) / dt : 0;
}

/**
 * Safari's address-bar swipe (mobile-safari spec §10). Touch-only: the pill buttons keep their
 * normal click behaviour for taps, and the click that follows a swipe is swallowed.
 * The live page follows the finger through `x`; the chrome renders neighbour ghosts while active.
 */
export function usePillSwipe(root: HTMLElement | null, options: PillSwipeOptions): void {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!root) return;
    let gesture: Gesture | null = null;
    const clicks = createClickSuppressor(() => performance.now());
    let settle: SettleAnimation | null = null;
    let settleToken = 0;

    const finishDrag = (commit: PillCommit | null, target: number) => {
      const o = latest.current;
      settle?.stop();
      const token = ++settleToken;
      settle = animate(o.x, target, o.reducedMotion ? INSTANT : PAGE_SPRING);
      settle
        .then(() => {
          if (token !== settleToken) return;
          settle = null;
          const current = latest.current;
          if (commit) current.onCommit(commit);
          current.onActiveChange(false);
        })
        .catch(() => {
          if (token === settleToken) latest.current.onActiveChange(false);
        });
    };

    const cancel = () => {
      const active = gesture;
      gesture = null;
      clicks.release();
      if (active?.dragging) finishDrag(null, 0);
    };

    const onTouchStart = (event: TouchEvent) => {
      clicks.reset();
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      const o = latest.current;
      const target = event.target instanceof Node ? event.target : null;
      gesture = {
        x0: touch.clientX,
        y0: touch.clientY,
        axis: null,
        horizontalAllowed: o.enabled && !!o.pill && !!target && o.pill.contains(target),
        samples: [{ t: event.timeStamp, dx: 0, dy: 0 }],
        dx: 0,
        dy: 0,
        armed: false,
        finished: false,
        dragging: false,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const g = gesture;
      if (!g || g.finished || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const o = latest.current;
      g.dx = touch.clientX - g.x0;
      g.dy = touch.clientY - g.y0;
      g.samples.push({ t: event.timeStamp, dx: g.dx, dy: g.dy });
      if (g.samples.length > 8) g.samples.shift();

      if (!g.axis) {
        if (Math.max(Math.abs(g.dx), Math.abs(g.dy)) < GESTURE.axisLock) return;
        g.axis = Math.abs(g.dx) > Math.abs(g.dy) ? "x" : "y";
        if (g.axis === "x" && g.horizontalAllowed) {
          settleToken++;
          settle?.stop();
          settle = null;
          g.dragging = true;
          clicks.arm();
          o.onActiveChange(true);
        }
      }

      if (g.axis === "y") {
        if (o.swipeUpEnabled && g.dy < -GESTURE.swipeUp) {
          g.finished = true;
          clicks.arm();
          o.onSwipeUp();
        }
        return;
      }
      if (!g.horizontalAllowed) return;
      if (event.cancelable) event.preventDefault();

      const towardNext = o.dir === "ltr" ? g.dx < 0 : g.dx > 0;
      let value = g.dx;
      if (towardNext && !o.hasNext) value = g.dx * (o.allowNew ? GESTURE.newTabResistance : GESTURE.rubberBand);
      else if (!towardNext && !o.hasPrev) value = g.dx * GESTURE.rubberBand;
      o.x.set(value);

      const reachable = towardNext ? o.hasNext || o.allowNew : o.hasPrev;
      const armed = reachable && Math.abs(g.dx) >= GESTURE.commitFraction * o.width();
      if (armed !== g.armed) {
        g.armed = armed;
        if (armed) void hapticLight();
      }
    };

    const onTouchEnd = () => {
      const g = gesture;
      gesture = null;
      if (!g || g.finished) {
        clicks.release();
        return;
      }
      const o = latest.current;

      if (g.axis === "y") {
        if (o.swipeUpEnabled && g.dy < -GESTURE.axisLock * 2 && velocity(g.samples, "dy") <= -GESTURE.swipeUpVelocity) {
          clicks.arm();
          o.onSwipeUp();
        }
        clicks.release();
        return;
      }
      clicks.release();
      if (g.axis !== "x" || !g.dragging) return;

      const width = o.width();
      const towardNext = o.dir === "ltr" ? g.dx < 0 : g.dx > 0;
      const target: PillCommit | null = towardNext ? (o.hasNext ? "next" : o.allowNew ? "new" : null) : o.hasPrev ? "prev" : null;
      const v = velocity(g.samples, "dx");
      const fastEnough = Math.abs(v) >= GESTURE.commitVelocity && Math.sign(v) === Math.sign(g.dx);
      const farEnough = Math.abs(g.dx) >= GESTURE.commitFraction * width;
      if (target && (farEnough || fastEnough)) {
        void hapticMedium();
        finishDrag(target, (g.dx < 0 ? -1 : 1) * (width + GESTURE.ghostGap));
      } else {
        finishDrag(null, 0);
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!clicks.consume()) return;
      event.preventDefault();
      event.stopPropagation();
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", cancel, { passive: true });
    root.addEventListener("click", onClickCapture, true);
    window.addEventListener("resize", cancel);
    window.addEventListener("orientationchange", cancel);
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", cancel);
      root.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("orientationchange", cancel);
      settleToken++;
      settle?.stop();
      if (gesture?.dragging) latest.current.x.set(0);
      gesture = null;
    };
  }, [root]);
}
