"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { MotionValue } from "motion/react";
import {
  beginMerchivaReveal,
  endMerchivaReveal,
  merchivaPanelWidth,
  merchivaReveal,
  moveMerchivaReveal,
} from "@/components/merchiva-dock/dock-reveal";
import { createClickSuppressor } from "@/lib/browser-shell/mobile/use-pill-swipe";
import {
  drawerProgressAt,
  drawerReleaseOpen,
  inSafariEdge,
  merchivaProgressAt,
  merchivaReleaseCommit,
  pageSwipeAction,
  type PageSwipeAction,
} from "@/lib/browser-shell/mobile-app/drawer";
import { swipeOverlayOpen } from "@/lib/browser-shell/mobile-app/overlay-open";
import {
  claimReached,
  hasHorizontalScroller,
  lockAxis,
  releaseVelocity,
  swipeDirection,
  swipeStartAllowed,
  type SwipeSample,
} from "@/lib/gestures/page-swipe";
import { hapticLight } from "@/lib/haptics";

export interface PageSwipeOptions {
  /** False while something else owns the screen: a dialog page, immersive editing, the keyboard, Mr. Merchiva. */
  enabled: boolean;
  dir: "ltr" | "rtl";
  /** A plain iOS Safari tab: swipes that start at either screen edge are Safari's. */
  safariEdges: boolean;
  drawerOpen: boolean;
  /** A swipe toward the start may pull Mr. Merchiva in. */
  merchivaAvailable: boolean;
  /** `#mobile-content`: the page surface the swipe rules are read against. */
  content: HTMLElement | null;
  sidebar: HTMLElement | null;
  scrim: HTMLElement | null;
  /** The drawer's reveal (0 closed – 1 open), driven directly while a finger holds it. */
  progress: MotionValue<number>;
  drawerWidth: number;
  /** A finger took the drawer: stop its settle animation. */
  onDrawerGrab(): void;
  /** The finger let go, or the gesture was cancelled: settle open or closed. */
  onDrawerRelease(open: boolean): void;
}

interface Gesture {
  readonly x0: number;
  readonly y0: number;
  readonly target: Element;
  /** Where the swipe rules stop walking up: `#mobile-content`, or the sidebar / scrim while the drawer is open. */
  readonly scope: Element;
  /** What the swipe will do, from the axis lock on; null before. */
  decided: Exclude<PageSwipeAction, "none"> | null;
  /** null until the swipe is claimed (decided and SWIPE_CLAIM_PX out): only then does anything move. */
  action: Exclude<PageSwipeAction, "none"> | null;
  /** Drawer progress when the finger took it. */
  base: number;
  readonly samples: SwipeSample[];
  /** Removes the end listeners on `target`. */
  readonly unwatch: () => void;
}

const MAX_SAMPLES = 12;

/** The element the swipe rules are read against for a touch at `target`, or null when no swipe may start there. */
function startScope(o: PageSwipeOptions, target: Element): Element | null {
  if (o.drawerOpen) {
    if (o.scrim?.contains(target)) return o.scrim;
    if (o.sidebar?.contains(target)) return swipeStartAllowed(target, o.sidebar) ? o.sidebar : null;
    return null;
  }
  return o.content && swipeStartAllowed(target, o.content) ? o.content : null;
}

/**
 * The phone's page swipes (lib/gestures/page-swipe.ts decides who may move first): toward the
 * inline end drags the sidebar drawer open, toward the start drags it closed or — with the drawer
 * closed — pulls Mr. Merchiva in. Native listeners on the frame (and, for the touch's end, on its
 * target), so portaled layers (dialog pages, drawers, popovers, Mr. Merchiva) never start one.
 * Nothing is claimed and nothing prevented until the axis locks horizontal, the page has not
 * taken the drag and nothing has opened over it since touchstart; the click that follows a claimed
 * swipe is swallowed. State lives in the closure and motion values, so a touchmove never
 * re-renders React.
 */
export function usePageSwipe(frame: HTMLElement | null, options: PageSwipeOptions): void {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!frame) return;
    let gesture: Gesture | null = null;
    const clicks = createClickSuppressor(() => performance.now());

    const settle = (g: Gesture, open: boolean | null) => {
      const o = latest.current;
      if (g.action === "merchiva") {
        const commit = open === true;
        if (commit) void hapticLight();
        endMerchivaReveal(commit);
        return;
      }
      const next = open ?? o.drawerOpen;
      if (next !== o.drawerOpen) void hapticLight();
      o.onDrawerRelease(next);
    };

    const finish = (): Gesture | null => {
      const g = gesture;
      gesture = null;
      g?.unwatch();
      clicks.release();
      return g;
    };

    const cancel = () => {
      const g = finish();
      if (g?.action) settle(g, null);
    };

    const onTouchEnd = (event: TouchEvent) => {
      const g = finish();
      if (!g?.action) return;
      const o = latest.current;
      // A finger that rested before lifting has no speed left: the release sample says so.
      const lifted = event.changedTouches[0];
      if (lifted) g.samples.push({ t: event.timeStamp, x: lifted.clientX });
      const velocity = releaseVelocity(g.samples);
      if (g.action === "merchiva") {
        settle(g, merchivaReleaseCommit(merchivaReveal.get(), velocity, o.dir));
      } else {
        settle(g, drawerReleaseOpen(g.action, o.progress.get(), velocity, o.dir));
      }
    };

    // The end of a touch is heard on its target: touch events keep going to a target React removed
    // mid-drag, and from there they no longer bubble to the frame.
    const onTargetEnd = (event: Event) => onTouchEnd(event as TouchEvent);
    const watch = (target: Element) => {
      target.addEventListener("touchend", onTargetEnd, { passive: true });
      target.addEventListener("touchcancel", cancel, { passive: true });
      return () => {
        target.removeEventListener("touchend", onTargetEnd);
        target.removeEventListener("touchcancel", cancel);
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      // A gesture still running here lost its end (or this is a second finger): settle it first.
      cancel();
      clicks.reset();
      if (event.touches.length !== 1) return;
      const o = latest.current;
      if (!o.enabled || swipeOverlayOpen()) return;
      const touch = event.touches[0];
      if (o.safariEdges && inSafariEdge(touch.clientX, window.innerWidth)) return;
      const target = event.target instanceof Element ? event.target : null;
      const scope = target ? startScope(o, target) : null;
      if (!target || !scope) return;
      gesture = {
        x0: touch.clientX,
        y0: touch.clientY,
        target,
        scope,
        decided: null,
        action: null,
        base: 0,
        samples: [{ t: event.timeStamp, x: touch.clientX }],
        unwatch: watch(target),
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const g = gesture;
      if (!g) return;
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      const dx = touch.clientX - g.x0;
      const o = latest.current;

      if (g.action === null && g.decided === null) {
        const axis = lockAxis(dx, touch.clientY - g.y0);
        if (axis === "pending") return;
        // Vertical, or the page already took the drag (a native scroll, its own swipe, a scroller).
        if (axis === "vertical" || !event.cancelable || event.defaultPrevented || hasHorizontalScroller(g.target, g.scope)) {
          finish();
          return;
        }
        // Something took the screen after touchstart (a long-press menu, a dialog page): stand down.
        if (!o.enabled || swipeOverlayOpen()) {
          finish();
          return;
        }
        const action = pageSwipeAction({
          drawerOpen: o.drawerOpen,
          direction: swipeDirection(dx, o.dir),
          merchivaAvailable: o.merchivaAvailable,
        });
        if (action === "none") {
          finish();
          return;
        }
        g.decided = action;
      }

      if (g.action === null && g.decided !== null) {
        // Decided, not yet out far enough to be a swipe rather than a rolling tap: keep the browser
        // from starting a scroll, move nothing, and leave the tap's click alone.
        event.preventDefault();
        if (!claimReached(dx)) return;
        // A long-press menu can open between the decision and here, while the finger rests.
        if (!o.enabled || swipeOverlayOpen()) {
          finish();
          return;
        }
        const action = g.decided;
        g.action = action;
        clicks.arm();
        if (action === "merchiva") {
          beginMerchivaReveal();
        } else {
          o.onDrawerGrab();
          g.base = o.progress.get();
        }
      }

      event.preventDefault();
      g.samples.push({ t: event.timeStamp, x: touch.clientX });
      if (g.samples.length > MAX_SAMPLES) g.samples.shift();
      if (g.action === "merchiva") moveMerchivaReveal(merchivaProgressAt(dx, merchivaPanelWidth(), o.dir));
      else o.progress.set(drawerProgressAt(g.base, dx, o.drawerWidth, o.dir));
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!clicks.consume()) return;
      event.preventDefault();
      event.stopPropagation();
    };

    frame.addEventListener("touchstart", onTouchStart, { passive: true });
    frame.addEventListener("touchmove", onTouchMove, { passive: false });
    frame.addEventListener("click", onClickCapture, true);
    window.addEventListener("resize", cancel);
    window.addEventListener("orientationchange", cancel);
    return () => {
      frame.removeEventListener("touchstart", onTouchStart);
      frame.removeEventListener("touchmove", onTouchMove);
      frame.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("orientationchange", cancel);
      cancel();
    };
  }, [frame]);
}
