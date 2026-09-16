"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { hapticLight } from "@/lib/haptics";
import { GESTURE, INSTANT } from "@/lib/browser-shell/mobile/geometry";
import { cn } from "@/lib/utils";

export interface EdgeBackGestureProps {
  /** Element the swipe starts on (`#mobile-content`). */
  target: HTMLElement | null;
  enabled: boolean;
  dir: "ltr" | "rtl";
  reducedMotion: boolean;
  onBack(): void;
  /** True while a swipe owns the touch (the chrome suppresses scroll-minimize meanwhile). */
  onActiveChange?(active: boolean): void;
}

const OPT_OUT_SELECTOR = "[data-no-sidebar-swipe], [data-no-shell-swipe]";
const INDICATOR_MAX_TRAVEL = 72;
const INDICATOR_REST = -40;

interface EdgeGesture {
  readonly x0: number;
  readonly y0: number;
  axis: "x" | "y" | null;
  armed: boolean;
}

/**
 * Edge swipe back (mobile-safari spec §18). Starts within 20px of the inline-start edge, locks
 * horizontal after 8px and commits at 64px. The page itself does not slide: there is no live
 * previous page (spec F1). Pages opt out with `data-no-sidebar-swipe` / `data-no-shell-swipe`.
 */
export function EdgeBackGesture({ target, enabled, dir, reducedMotion, onBack, onActiveChange }: EdgeBackGestureProps) {
  const [active, setActive] = useState(false);
  const [armed, setArmed] = useState(false);
  const travel = useMotionValue(0);
  const sign = dir === "rtl" ? -1 : 1;
  const x = useTransform(travel, (dx) => sign * (Math.min(INDICATOR_MAX_TRAVEL, dx * 0.5) + INDICATOR_REST));
  const opacity = useTransform(travel, (dx) => Math.min(1, dx / GESTURE.edgeCommit));

  const latest = useRef({ onBack, onActiveChange, dir, reducedMotion });
  useLayoutEffect(() => {
    latest.current = { onBack, onActiveChange, dir, reducedMotion };
  });

  useEffect(() => {
    if (!target || !enabled) return;
    let gesture: EdgeGesture | null = null;
    let tracking = false;

    const settle = (commit: boolean) => {
      const { onBack: back, onActiveChange: report, reducedMotion: reduced } = latest.current;
      if (commit) back();
      report?.(false);
      animate(travel, 0, reduced ? INSTANT : { duration: 0.15, ease: "easeOut" })
        .then(() => {
          setActive(false);
          setArmed(false);
        })
        .catch(() => {
          setActive(false);
          setArmed(false);
        });
    };

    const cancel = () => {
      const wasTracking = tracking;
      gesture = null;
      tracking = false;
      if (wasTracking) settle(false);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      const fromEdge = latest.current.dir === "rtl" ? window.innerWidth - touch.clientX : touch.clientX;
      if (fromEdge > GESTURE.edgeZone) return;
      if (event.target instanceof Element && event.target.closest(OPT_OUT_SELECTOR)) return;
      gesture = { x0: touch.clientX, y0: touch.clientY, axis: null, armed: false };
    };

    const onTouchMove = (event: TouchEvent) => {
      const g = gesture;
      if (!g || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - g.x0;
      const dy = touch.clientY - g.y0;
      if (!g.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < GESTURE.axisLock) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (g.axis === "y") {
          gesture = null;
          return;
        }
        tracking = true;
        setActive(true);
        latest.current.onActiveChange?.(true);
      }
      if (event.cancelable) event.preventDefault();
      const inward = Math.max(0, latest.current.dir === "rtl" ? -dx : dx);
      travel.set(inward);
      const nextArmed = inward >= GESTURE.edgeCommit;
      if (nextArmed !== g.armed) {
        g.armed = nextArmed;
        setArmed(nextArmed);
        if (nextArmed) void hapticLight();
      }
    };

    const onTouchEnd = () => {
      const g = gesture;
      gesture = null;
      if (!g || !tracking) return;
      tracking = false;
      settle(g.armed);
    };

    target.addEventListener("touchstart", onTouchStart, { passive: true });
    target.addEventListener("touchmove", onTouchMove, { passive: false });
    target.addEventListener("touchend", onTouchEnd, { passive: true });
    target.addEventListener("touchcancel", cancel, { passive: true });
    window.addEventListener("orientationchange", cancel);
    window.addEventListener("resize", cancel);
    return () => {
      target.removeEventListener("touchstart", onTouchStart);
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", onTouchEnd);
      target.removeEventListener("touchcancel", cancel);
      window.removeEventListener("orientationchange", cancel);
      window.removeEventListener("resize", cancel);
      if (tracking) {
        latest.current.onActiveChange?.(false);
        travel.jump(0);
      }
    };
  }, [target, enabled, travel]);

  if (!active) return null;
  return (
    <motion.div
      aria-hidden
      className={cn(
        "pointer-events-none fixed top-1/2 z-[46] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background",
        dir === "rtl" ? "right-0" : "left-0",
      )}
      style={{ x, opacity }}
    >
      <ChevronLeft className={cn("h-5 w-5 rtl:-scale-x-100", armed ? "text-foreground" : "text-muted-foreground")} />
    </motion.div>
  );
}
