"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type Transition } from "motion/react";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { createClickSuppressor } from "@/lib/browser-shell/mobile/use-pill-swipe";
import {
  claimReached,
  hasHorizontalScroller,
  lockAxis,
  releaseVelocity,
  shouldCommit,
  swipeStartAllowed,
  type SwipeSample,
} from "@/lib/gestures/page-swipe";
import { useDialogDepth } from "@/components/ui/dialog-depth";
import { useDialogBgLayer } from "@/components/ui/dialog-bg-push";
import { useDialogHost } from "@/components/ui/dialog-host";
import { DynamicUIElementBack, dialogSafeTop } from "@/components/ui/dynamic-ui-element-back";

/*
 * The phone (<640px) variant of a DynamicUIElement: a full-screen page that slides in from the right
 * over the layer it pushes aside, and slides back out on Back or on a swipe to the right.
 *
 * One motion value, the page's offset `x` (0 = open, the screen's width = gone), drives everything:
 * the open and close springs, the finger on a swipe, the page's rounded leading edge and the push of
 * the layer underneath (useDialogBgLayer). A swipe or a Back that interrupts an animation carries on
 * from where it is, and a release keeps the finger's speed. Touch moves never re-render React.
 *
 * The page system is physically LTR (in from the right, swiped right to close) in every locale.
 */

// Rest thresholds in px. Both springs are critically damped (no overshoot), settling in ~450ms.
const OPEN_SPRING: Transition = { type: "spring", stiffness: 380, damping: 39, restDelta: 0.5, restSpeed: 10 };
const CLOSE_SPRING: Transition = { type: "spring", stiffness: 420, damping: 41, restDelta: 0.5, restSpeed: 10 };
const REDUCED: Transition = { duration: 0.15, ease: "easeOut" };
/** The page's leading corners round over this much travel. */
const EDGE_ROUND_PX = 24;
const EDGE_RADIUS_PX = 48;
const MAX_SAMPLES = 12;

const screenWidth = () => (typeof window !== "undefined" && window.innerWidth) || 400;
/** A contained page's content reserve: its Back sits at the host box's top, below the status bar. */
const CONTAINED_RESERVE = { paddingTop: 64 } as const;
/** The width a page slides across: its own layer's (the viewport, or a host's box when contained). */
const widthOf = (layer: HTMLElement | null) => layer?.clientWidth || screenWidth();

// Swipe progress of the topmost page (0 = open, 1 = swiped away), for chromes that follow the finger.
const swipeListeners = new Set<(p: number) => void>();
export function useDynamicUIElementSwipeProgress() {
  const [p, setP] = React.useState(0);
  React.useEffect(() => {
    swipeListeners.add(setP);
    return () => { swipeListeners.delete(setP); };
  }, []);
  return p;
}
function setSwipeProgress(p: number) {
  swipeListeners.forEach((fn) => fn(p));
}

/** The page's title for its visible Back, and whether it is leaving. */
export const MobileDynamicUIElementTitleContext = React.createContext<{
  title: string;
  setTitle: (t: string) => void;
  exiting: boolean;
}>({ title: "", setTitle: () => {}, exiting: false });

/** What a phone page offers its content: closing it, and taking its Back. */
interface PageControls {
  /** Slides the page out and closes it, without asking the content (its own Done / Discard). */
  close: () => void;
  /** The content's Back handler (useDynamicUIElementPageBack), or null for none. */
  setContentBack: (handler: (() => boolean) | null) => void;
}
const PageControlsContext = React.createContext<PageControls | null>(null);

/** Inside a phone page: closes it the way Back does, without asking the content first. Null elsewhere. */
export function useDynamicUIElementPageClose(): (() => void) | null {
  return React.useContext(PageControlsContext)?.close ?? null;
}

/**
 * Inside a phone page: `handler` runs on the page's Back — the visible Back, a swipe, the system
 * back — before the page leaves, and returning true keeps the page (the content took the Back
 * itself: a step back, a "discard your answers?"). Null hands Back to the page again.
 */
export function useDynamicUIElementPageBack(handler: (() => boolean) | null): void {
  const setContentBack = React.useContext(PageControlsContext)?.setContentBack;
  React.useLayoutEffect(() => {
    if (!setContentBack) return;
    setContentBack(handler);
    return () => setContentBack(null);
  }, [setContentBack, handler]);
}

interface PageSwipe {
  readonly x0: number;
  readonly y0: number;
  readonly target: Element;
  /** Decided horizontal (to the right) at the axis lock. */
  decided: boolean;
  /** Out SWIPE_CLAIM_PX: the page follows the finger from here. */
  claimed: boolean;
  /** The page's offset when the finger took it. */
  base: number;
  readonly samples: SwipeSample[];
  readonly unwatch: () => void;
}

export function MobileDynamicUIElementPage({
  children,
  noPadding = false,
  contained = false,
}: DialogPrimitive.Popup.Props & {
  noPadding?: boolean;
  /**
   * Portalled into a host's page root (a device app on the tablet's apps side) rather than <body>:
   * the page fills that box instead of the viewport, and the status bar is above it.
   */
  contained?: boolean;
}) {
  const [mobileTitle, setMobileTitle] = React.useState("");
  const [exiting, setExiting] = React.useState(false);
  const exitingRef = React.useRef(false);
  // A page sliding out leaves the stack: one reopened meanwhile pushes what this one pushed.
  const depth = useDialogDepth(!exiting);
  const reducedMotion = useReducedMotion() ?? false;
  const outerRef = React.useRef<HTMLDivElement>(null);
  const gestureRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  // The content's own Back (useDynamicUIElementPageBack): true keeps the page.
  const interceptRef = React.useRef<(() => boolean) | null>(null);
  const setContentBack = React.useCallback((handler: (() => boolean) | null) => { interceptRef.current = handler; }, []);

  const x = useMotionValue(screenWidth());
  const edgeRadius = useTransform(x, [0, EDGE_ROUND_PX], [0, EDGE_RADIUS_PX]);
  const paintBg = useDialogBgLayer(depth);
  React.useLayoutEffect(() => {
    const paint = (v: number) => paintBg(1 - v / widthOf(outerRef.current));
    paint(x.get());
    return x.on("change", paint);
  }, [x, paintBg]);

  const slide = React.useCallback(
    (to: number, spring: Transition, velocity = 0) =>
      animate(x, to, reducedMotion ? REDUCED : { ...spring, velocity }),
    [x, reducedMotion],
  );

  // In from the right on mount (from the edge of the host's box when contained).
  React.useLayoutEffect(() => {
    if (contained) x.jump(widthOf(outerRef.current));
    const controls = slide(0, OPEN_SPRING);
    return () => controls.stop();
  }, [slide, contained, x]);

  // Slides out from wherever the page is (keeping a release's speed), then closes.
  const leave = React.useCallback((velocity = 0) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    void slide(widthOf(outerRef.current), CLOSE_SPRING, velocity).then(() => closeRef.current?.click());
  }, [slide]);

  // Back: slide out, then close. The hidden [data-dialog-back] runs it (closeTopDialog, popstate,
  // Android back), and so does the visible Back on the /manager phone layout and in a device app.
  const goBack = React.useCallback(() => {
    // The content may take the Back itself: the page stays.
    if (interceptRef.current?.()) return;
    leave();
  }, [leave]);

  const controls = React.useMemo<PageControls>(() => ({ close: () => leave(), setContentBack }), [leave, setContentBack]);

  React.useEffect(() => () => setSwipeProgress(0), []);

  // Opened in a device app: the app hears this page's drags too (a drag down closes both).
  const host = useDialogHost();
  React.useEffect(() => {
    const el = outerRef.current;
    if (el && host?.attachPage) return host.attachPage(el);
  }, [host]);

  // Swipe right to go back (lib/gestures/page-swipe.ts decides who may move first): nothing is
  // claimed until the axis locks to the right on a drag the content does not want (a sideways
  // scroller, an editable, an opted-out region), and nothing moves until it is claimed. The click
  // that follows a claimed swipe is swallowed.
  React.useEffect(() => {
    const root = gestureRef.current;
    if (!root) return;
    let gesture: PageSwipe | null = null;
    const clicks = createClickSuppressor(() => performance.now());

    const finish = (): PageSwipe | null => {
      const g = gesture;
      gesture = null;
      g?.unwatch();
      clicks.release();
      return g;
    };
    // A release goes on at the finger's speed (px/ms; motion takes px/s). A cancelled touch springs back.
    const settle = (velocity: number | null) => {
      const commit = velocity !== null && shouldCommit(x.get() / widthOf(outerRef.current), velocity);
      if (velocity !== null && commit && !interceptRef.current?.()) {
        setSwipeProgress(1);
        leave(velocity * 1000);
      } else {
        // A short swipe, or one the content took (useDynamicUIElementPageBack): back to open.
        setSwipeProgress(0);
        slide(0, OPEN_SPRING, commit ? 0 : (velocity ?? 0) * 1000);
      }
    };
    const cancel = () => {
      if (finish()?.claimed) settle(null);
    };
    const onTouchEnd = (event: TouchEvent) => {
      const g = finish();
      if (!g?.claimed) return;
      const lifted = event.changedTouches[0];
      if (lifted) g.samples.push({ t: event.timeStamp, x: lifted.clientX });
      settle(releaseVelocity(g.samples));
    };
    // The end of a touch is heard on its target, which keeps getting touch events after React
    // removes it mid-drag (they no longer bubble here).
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
      cancel();
      clicks.reset();
      if (event.touches.length !== 1 || exitingRef.current) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !swipeStartAllowed(target, root)) return;
      const touch = event.touches[0];
      gesture = {
        x0: touch.clientX,
        y0: touch.clientY,
        target,
        decided: false,
        claimed: false,
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
      if (!g.decided) {
        const axis = lockAxis(dx, touch.clientY - g.y0);
        if (axis === "pending") return;
        // Vertical, leftward, or the content already took the drag.
        if (axis === "vertical" || dx < 0 || !event.cancelable || event.defaultPrevented || hasHorizontalScroller(g.target, root)) {
          finish();
          return;
        }
        g.decided = true;
      }
      // Decided: no scroll may start under the swipe.
      event.preventDefault();
      if (!g.claimed) {
        if (!claimReached(dx) || exitingRef.current) return;
        g.claimed = true;
        clicks.arm();
        x.stop();
        // A page still settling is taken where it is.
        g.base = x.get() - dx;
      }
      g.samples.push({ t: event.timeStamp, x: touch.clientX });
      if (g.samples.length > MAX_SAMPLES) g.samples.shift();
      const next = Math.max(0, g.base + dx);
      x.set(next);
      setSwipeProgress(Math.min(1, next / widthOf(outerRef.current)));
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!clicks.consume()) return;
      event.preventDefault();
      event.stopPropagation();
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("click", onClickCapture, true);
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("click", onClickCapture, true);
      cancel();
    };
  }, [x, slide, leave]);

  return (
    <MobileDynamicUIElementTitleContext.Provider value={{ title: mobileTitle, setTitle: setMobileTitle, exiting }}>
      {/* The page's layer: a page opened over this one pushes it aside (dialog-bg-push.ts). */}
      <div ref={outerRef} id={`mobile-dialog-${depth}`} className={contained ? "absolute inset-0" : "fixed inset-0"} style={{ zIndex: 50 + depth }}>
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={{
            x,
            borderTopLeftRadius: edgeRadius,
            borderBottomLeftRadius: edgeRadius,
            boxShadow: "-8px 0 30px rgba(0, 0, 0, 0.15)",
            willChange: "transform",
          }}
        >
          <DialogPrimitive.Popup
            data-slot="dialog-content"
            initialFocus={false}
            className="absolute inset-0 flex flex-col bg-background text-sm text-foreground outline-none w-full max-w-none p-0!"
          >
            <div ref={gestureRef} className="flex flex-col h-full">
              <DialogPrimitive.Close ref={closeRef} className="hidden" />
              <button data-dialog-back onClick={goBack} className="hidden" />
              <DynamicUIElementBack title={mobileTitle} onBack={goBack} exiting={exiting} />
              {/* The safe top is padding, not a spacer child, so an h-full child fits below it. */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingInline: noPadding ? 0 : 16, paddingTop: `calc(64px + ${dialogSafeTop(getSafeAreaInsets().top)})`, ...(contained ? CONTAINED_RESERVE : null), paddingBottom: `calc(${noPadding ? 0 : 16}px + var(--shell-dialog-bottom, 0px))` }}>
                <PageControlsContext.Provider value={controls}>{children}</PageControlsContext.Provider>
              </div>
            </div>
          </DialogPrimitive.Popup>
        </motion.div>
      </div>
    </MobileDynamicUIElementTitleContext.Provider>
  );
}
