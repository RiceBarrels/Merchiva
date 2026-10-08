"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { SIDEBAR_ELEMENT_ID } from "@/components/browser-shell/desktop/sidebar/sidebar-state";
import { createAnchorCache, pageRegion, type AnchorCache, type Placement } from "@/lib/presence/dom";
import { cn } from "@/lib/utils";

/** The dock's spring (design-system/README.md §8): cursors glide to the next click. */
const SPRING = { stiffness: 500, damping: 38, mass: 0.6 };
/** Cursors on the same spot are stacked this far apart so their name tags stay readable. */
const STACK_GAP = 22;
/** While a cursor is visible, positions are re-measured at least this often (late-loading pages). */
const MEASURE_EVERY_MS = 500;
/** PageTransition scales a new page in over 200 ms: measure again once it has settled. */
const SETTLE_DELAYS_MS = [0, 120, 260];

/**
 * A counter that changes whenever cursor positions may have moved: any scroll (capture, so nested
 * scrollers count), window and region resizes, the route transition settling, and a slow interval
 * for pages whose content arrives late. Frame-throttled.
 */
export function useMeasureTick(active: boolean, pageKey: string | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const bump = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setTick((n) => n + 1);
      });
    };
    document.addEventListener("scroll", bump, { capture: true, passive: true });
    window.addEventListener("resize", bump);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(bump);
    const region = pageRegion();
    const sidebar = document.getElementById(SIDEBAR_ELEMENT_ID);
    if (region) observer?.observe(region);
    if (sidebar) observer?.observe(sidebar);
    const interval = setInterval(bump, MEASURE_EVERY_MS);
    const settle = SETTLE_DELAYS_MS.map((ms) => setTimeout(bump, ms));
    return () => {
      document.removeEventListener("scroll", bump, { capture: true });
      window.removeEventListener("resize", bump);
      observer?.disconnect();
      clearInterval(interval);
      settle.forEach(clearTimeout);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active, pageKey]);
  return tick;
}

export interface PresenceCursorProps {
  /** Changes when positions may have moved (useMeasureTick). */
  readonly tick: number;
  /** Where the cursor goes now; null hides it. */
  readonly locate: (cache: AnchorCache) => Placement | null;
  /** Index among cursors on the same spot. */
  readonly stack: number;
  readonly label: string;
  /** Second part of the tag (Mr. Merchiva's current tool). */
  readonly detail?: string;
  /** The member's presence colour; null draws Mr. Merchiva's neutral cursor. */
  readonly color: string | null;
  /** A change plays the click ring. */
  readonly clickSeq: number;
  readonly reducedMotion: boolean;
}

/**
 * One remote cursor: an arrow in the member's colour with a white outline (the dark hues stay
 * visible in dark mode) and a name tag styled like the Docs caret labels. Mr. Merchiva's is neutral —
 * foreground fill, background outline and tag — so it never reads as a person.
 */
export function PresenceCursor({ tick, locate, stack, label, detail, color, clickSeq, reducedMotion }: PresenceCursorProps) {
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);
  const opacity = useMotionValue(0);
  const cacheRef = useRef<AnchorCache | null>(null);
  const placedRef = useRef(false);

  useLayoutEffect(() => {
    cacheRef.current ??= createAnchorCache();
    const placement = locate(cacheRef.current);
    if (!placement) {
      opacity.set(0);
      placedRef.current = false;
      return;
    }
    const top = placement.y + stack * STACK_GAP;
    // The first placement (and every one with reduced motion) jumps; later ones glide.
    if (!placedRef.current || reducedMotion) {
      x.jump(placement.x);
      y.jump(top);
    } else {
      x.set(placement.x);
      y.set(top);
    }
    placedRef.current = true;
    opacity.set(placement.dim ? 0.5 : 1);
  }, [tick, locate, stack, reducedMotion, x, y, opacity]);

  // A new click number plays the ring once; the number the cursor mounted with does not.
  const [seenSeq, setSeenSeq] = useState(clickSeq);
  const [ring, setRing] = useState<number | null>(null);
  if (clickSeq !== seenSeq) {
    setSeenSeq(clickSeq);
    setRing(reducedMotion ? null : clickSeq);
  }

  const neutral = color === null;
  const fill = color ?? "var(--foreground)";

  return (
    <motion.div
      className="absolute left-0 top-0 transition-opacity duration-200 motion-reduce:transition-none"
      style={{ x, y, opacity }}
    >
      {ring !== null ? (
        <motion.span
          key={ring}
          className="absolute -left-3 -top-3 h-6 w-6 rounded-full border-2"
          style={{ borderColor: fill }}
          initial={{ scale: 0.4, opacity: 0.6 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onAnimationComplete={() => setRing(null)}
        />
      ) : null}
      <svg
        viewBox="0 0 18 18"
        width={18}
        height={18}
        className="absolute -start-[2px] -top-[2px] overflow-visible rtl:-scale-x-100"
      >
        <path
          d="M2 2v13.2l3.7-3.5 2.4 5.3 2.3-1-2.4-5.2H13z"
          fill={fill}
          stroke={neutral ? "var(--background)" : "#fff"}
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={cn(
          "absolute start-3 top-4 max-w-[240px] truncate whitespace-nowrap rounded-[2px] rounded-ss-none px-1 py-px text-[10px] font-semibold leading-[1.3]",
          neutral ? "bg-foreground text-background" : "text-white",
        )}
        style={neutral ? undefined : { backgroundColor: fill }}
      >
        {label}
        {detail ? <span className="font-normal opacity-75"> · {detail}</span> : null}
      </span>
    </motion.div>
  );
}
