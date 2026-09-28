"use client";

// Drag to reorder in the phone thumbnail strip (slides.md §11): on touch, a 350 ms press lifts the slide (nothing
// moves before that, so a quick swipe still scrolls the strip) and then a drag carries it; with a mouse, a drag of
// 4 px lifts it at once. Releasing drops it where the marker shows. A press held without moving is a long press
// (the caller opens the slide's options). Escape or a cancelled pointer drops nothing.
//
// While a slide is lifted, a non-passive touchmove listener keeps the strip from scrolling, and the click that
// follows the release is swallowed so it does not also select a thumbnail.
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { hapticLight } from "@/lib/haptics";
import { dropIndex, landedPosition, moveTarget } from "@/components/slides/mobile/strip-reorder";

/** Put on each thumbnail: its slide id. */
export const THUMB_ID_ATTR = "data-thumb-id";

const HOLD_MS = 350;
const TOUCH_SLOP_PX = 8;
const MOUSE_DRAG_PX = 4;
/** Near an end of the strip a drag scrolls it (CSS px from the edge, px per move). */
const EDGE_PX = 32;
const EDGE_STEP_PX = 14;

export interface StripDrag {
  id: string;
  /** Insertion slot, 0..n (n = after the last slide). */
  slot: number;
}

interface Press {
  id: string;
  pointerId: number;
  type: string;
  x: number;
  y: number;
  lifted: boolean;
  moved: boolean;
}

export interface StripReorderOptions {
  strip: HTMLElement | null;
  axis: "x" | "y";
  enabled: boolean;
  order: readonly string[];
  /** Drop: move `id` before `before` (null = the end); `position` is where it lands (1-based). */
  onMove(id: string, before: string | null, position: number): void;
  /** A lifted slide released without moving. */
  onHold(id: string): void;
}

export interface StripReorder {
  drag: StripDrag | null;
  handlers: {
    onPointerDown(event: PointerEvent<HTMLElement>): void;
    onPointerMove(event: PointerEvent<HTMLElement>): void;
    onPointerUp(event: PointerEvent<HTMLElement>): void;
    onPointerCancel(): void;
    onClickCapture(event: MouseEvent<HTMLElement>): void;
    onContextMenu(event: MouseEvent<HTMLElement>): void;
  };
}

function thumbIdOf(target: EventTarget | null): string | null {
  const node = target as Node | null;
  if (!node || node.nodeType !== 1) return null;
  return (node as Element).closest(`[${THUMB_ID_ATTR}]`)?.getAttribute(THUMB_ID_ATTR) ?? null;
}

export function useStripReorder(opts: StripReorderOptions): StripReorder {
  const [drag, setDrag] = useState<StripDrag | null>(null);
  const press = useRef<Press | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallowClick = useRef(false);
  const latest = useRef(opts);
  useLayoutEffect(() => {
    latest.current = opts;
  });

  const clearHold = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const finish = () => {
    clearHold();
    press.current = null;
    setDrag(null);
  };

  const slotAt = (x: number, y: number): number => {
    const { strip, axis, order } = latest.current;
    if (!strip) return 0;
    const rects = new Map<string, DOMRect>();
    strip.querySelectorAll<HTMLElement>(`[${THUMB_ID_ATTR}]`).forEach((el) => rects.set(el.getAttribute(THUMB_ID_ATTR) ?? "", el.getBoundingClientRect()));
    let last = 0;
    const centers = order.map((id) => {
      const r = rects.get(id);
      if (r) last = axis === "x" ? r.left + r.width / 2 : r.top + r.height / 2;
      return last;
    });
    const reversed = axis === "x" && getComputedStyle(strip).direction === "rtl";
    return dropIndex(centers, axis === "x" ? x : y, reversed);
  };

  const lift = () => {
    const p = press.current;
    if (!p || !latest.current.enabled) return;
    p.lifted = true;
    void hapticLight();
    setDrag({ id: p.id, slot: latest.current.order.indexOf(p.id) });
    if (p.type === "mouse") {
      try {
        latest.current.strip?.setPointerCapture(p.pointerId);
      } catch {
        // The pointer is already gone.
      }
    }
  };

  const autoScroll = (x: number, y: number) => {
    const { strip, axis } = latest.current;
    if (!strip) return;
    const r = strip.getBoundingClientRect();
    const [pos, start, end] = axis === "x" ? [x, r.left, r.right] : [y, r.top, r.bottom];
    const delta = pos < start + EDGE_PX ? -EDGE_STEP_PX : pos > end - EDGE_PX ? EDGE_STEP_PX : 0;
    if (delta !== 0) strip.scrollBy(axis === "x" ? { left: delta } : { top: delta });
  };

  // Keeps the page from scrolling under a lifted slide (touch-action cannot change mid-gesture).
  const strip = opts.strip;
  useEffect(() => {
    if (!strip) return;
    const onTouchMove = (event: TouchEvent) => {
      if (press.current?.lifted && event.cancelable) event.preventDefault();
    };
    strip.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => strip.removeEventListener("touchmove", onTouchMove);
  }, [strip]);

  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      swallowClick.current = true;
      clearHold();
      press.current = null;
      setDrag(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drag]);

  useEffect(() => () => clearHold(), []);

  const enabled = opts.enabled;
  useEffect(() => {
    if (enabled || !press.current) return;
    clearHold();
    press.current = null;
  }, [enabled]);

  return {
    drag: enabled ? drag : null,
    handlers: {
      onPointerDown: (event) => {
        swallowClick.current = false;
        const id = thumbIdOf(event.target);
        if (!id || event.button !== 0) return;
        clearHold();
        press.current = { id, pointerId: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY, lifted: false, moved: false };
        if (latest.current.enabled && event.pointerType !== "mouse") holdTimer.current = setTimeout(lift, HOLD_MS);
      },
      onPointerMove: (event) => {
        const p = press.current;
        if (!p || event.pointerId !== p.pointerId) return;
        const distance = Math.hypot(event.clientX - p.x, event.clientY - p.y);
        if (!p.lifted) {
          if (p.type === "mouse" && distance > MOUSE_DRAG_PX && latest.current.enabled) lift();
          else if (p.type !== "mouse" && distance > TOUCH_SLOP_PX) {
            // Moved before the hold: the strip is being scrolled.
            clearHold();
            press.current = null;
            return;
          }
          if (!p.lifted) return;
        }
        if (distance > TOUCH_SLOP_PX || p.type === "mouse") p.moved = true;
        autoScroll(event.clientX, event.clientY);
        setDrag({ id: p.id, slot: slotAt(event.clientX, event.clientY) });
      },
      onPointerUp: (event) => {
        const p = press.current;
        clearHold();
        if (!p || event.pointerId !== p.pointerId) return;
        if (p.lifted) {
          swallowClick.current = true;
          const { order, onMove, onHold } = latest.current;
          if (p.moved) {
            const slot = slotAt(event.clientX, event.clientY);
            const before = moveTarget(order, p.id, slot);
            if (before !== undefined) onMove(p.id, before, landedPosition(order, p.id, slot));
          } else {
            onHold(p.id);
          }
        }
        finish();
      },
      onPointerCancel: () => {
        if (press.current?.lifted) swallowClick.current = true;
        finish();
      },
      onClickCapture: (event) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      onContextMenu: (event) => {
        // A long press on touch opens the system menu on some browsers; the long press is ours here.
        if (press.current && press.current.type !== "mouse") event.preventDefault();
      },
    },
  };
}
