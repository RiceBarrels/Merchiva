"use client";

// Pointer reordering of slides (slides.md §7.3, §11): the desktop rail (vertical), the grid sorter (grid) and the
// phone's thumbnail strip (horizontal). A mouse drag starts after 4 px of movement; a touch or pen drag after a
// 350 ms long-press that stays within 8 px, so a normal swipe still scrolls the list. While dragging, the list
// scrolls itself near its edges, Escape cancels, and the drop calls `onDrop(ids, before)` once (one moveSlides,
// one undo step). Pressing a slide that is not picked drags just that slide (`onDragStart` lets the host select it).
//
// Items are the elements inside `container` carrying `data-reorder-id`; their boxes are measured once when the drag
// starts, in the scroller's content coordinates, so auto-scrolling needs no re-measure. The keyboard path (Mod+↑/↓)
// is the editor's shortcut hook, not this.
import { useEffect, useLayoutEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import {
  autoScrollDirection, draggedSlides, dropIndexAt, dropTarget, type ReorderAxis, type ReorderItemRect,
} from "@/components/slides/rail/reorder-math";
import { hapticLight } from "@/lib/haptics";
import { Latest } from "@/lib/slides/editor/latest";

export type { ReorderAxis } from "@/components/slides/rail/reorder-math";

/** The attribute that marks a reorderable item and names its slide. */
export const REORDER_ID_ATTR = "data-reorder-id";

const MOUSE_SLOP_PX = 4;
const TOUCH_SLOP_PX = 8;
const LONG_PRESS_MS = 350;
/** Auto-scroll starts this close to the scroller's edge (CSS px), up to this many px per frame. */
const SCROLL_BAND_PX = 40;
const SCROLL_MAX_STEP = 14;

export interface SlideReorderOptions {
  axis: ReorderAxis;
  /** The scrolling list the items are in. */
  container: RefObject<HTMLElement | null>;
  /** Every slide id, in deck order. */
  order: readonly string[];
  /** The picked slides (a drag on one of them moves them all). */
  picked: readonly string[];
  enabled: boolean;
  /** A drag began on `pressed`, moving `ids` (the host selects `pressed` when it was not picked). */
  onDragStart?(pressed: string, ids: readonly string[]): void;
  onDrop(ids: readonly string[], before: string | null): void;
}

export interface SlideReorderDrag {
  /** The slides being moved, in deck order. */
  ids: readonly string[];
  /** Where they would land (0..order.length), or null when dropping now would change nothing. */
  index: number | null;
}

export interface SlideReorder {
  drag: SlideReorderDrag | null;
  /** Put on each item's onPointerDown. */
  onPointerDown(event: ReactPointerEvent<HTMLElement>, id: string): void;
  /** True for the click that ends a drag (or a long-press), which the host should ignore. */
  takeClick(): boolean;
}

interface Press {
  id: string;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  timer: number | null;
  dragging: boolean;
  ids: readonly string[];
  items: ReorderItemRect[];
  box: DOMRect | null;
  frame: number | null;
  index: number | null;
  detach: () => void;
}

function measure(container: HTMLElement): { box: DOMRect; items: ReorderItemRect[] } {
  const box = container.getBoundingClientRect();
  const dx = container.scrollLeft - box.left;
  const dy = container.scrollTop - box.top;
  const items: ReorderItemRect[] = [];
  for (const el of container.querySelectorAll<HTMLElement>(`[${REORDER_ID_ATTR}]`)) {
    const id = el.getAttribute(REORDER_ID_ATTR);
    if (!id) continue;
    const r = el.getBoundingClientRect();
    items.push({ id, left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy });
  }
  return { box, items };
}

/** One press at a time: from pointerdown to the drop (or the cancel), with its window listeners. */
class ReorderController {
  private press: Press | null = null;
  private swallowClick = false;
  private shown: SlideReorderDrag | null = null;

  constructor(
    private readonly opts: Latest<SlideReorderOptions>,
    private readonly publish: (drag: SlideReorderDrag | null) => void,
  ) {}

  readonly takeClick = (): boolean => this.swallowClick;

  readonly onPointerDown = (event: ReactPointerEvent<HTMLElement>, id: string): void => {
    const { enabled, container } = this.opts.get();
    if (!enabled || !container.current || this.press || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const touch = event.pointerType !== "mouse";
    const p: Press = {
      id, pointerId: event.pointerId, touch, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      timer: null, dragging: false, ids: [], items: [], box: null, frame: null, index: null, detach: () => undefined,
    };
    this.press = p;
    if (touch) p.timer = window.setTimeout(() => this.begin(p), LONG_PRESS_MS);

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== p.pointerId) return;
      // Editing rights went away mid-gesture: drop nothing.
      if (!this.opts.get().enabled) {
        this.end(false);
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (!p.dragging) {
        const moved = Math.hypot(p.x - p.startX, p.y - p.startY);
        if (p.touch && moved > TOUCH_SLOP_PX) this.end(false);
        else if (!p.touch && moved > MOUSE_SLOP_PX) this.begin(p);
        return;
      }
      this.track(p);
      if (p.frame === null) p.frame = window.requestAnimationFrame(() => this.autoScroll(p));
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === p.pointerId) this.end(this.opts.get().enabled);
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === p.pointerId) this.end(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      this.end(false);
    };
    // A long-press drag must not scroll the page or the list, nor raise the touch callout menu.
    const onTouchMove = (e: TouchEvent) => {
      if (p.dragging && e.cancelable) e.preventDefault();
    };
    const onContextMenu = (e: Event) => {
      if (p.touch) e.preventDefault();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("contextmenu", onContextMenu, true);
    p.detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("contextmenu", onContextMenu, true);
    };
  };

  /** Ends the press in progress (no drop). */
  dispose(): void {
    this.end(false);
  }

  private show(drag: SlideReorderDrag | null): void {
    const prev = this.shown;
    if (prev === drag || (prev && drag && prev.ids === drag.ids && prev.index === drag.index)) return;
    this.shown = drag;
    this.publish(drag);
  }

  private begin(p: Press): void {
    const { container, order, picked, onDragStart } = this.opts.get();
    const el = container.current;
    if (!el || this.press !== p) return;
    p.timer = null;
    p.dragging = true;
    p.ids = draggedSlides(order, picked, p.id);
    const measured = measure(el);
    p.box = measured.box;
    p.items = measured.items;
    if (p.touch) void hapticLight();
    onDragStart?.(p.id, p.ids);
    this.track(p);
  }

  /** Recomputes the drop index from the pointer (in the scroller's content coordinates). */
  private track(p: Press): void {
    const container = this.opts.get().container.current;
    if (!container || !p.box) return;
    const x = p.x - p.box.left + container.scrollLeft;
    const y = p.y - p.box.top + container.scrollTop;
    const at = dropIndexAt(p.items, x, y, this.opts.get().axis);
    const order = p.items.map((item) => item.id);
    p.index = dropTarget(order, p.ids, at) ? at : null;
    this.show({ ids: p.ids, index: p.index });
  }

  private autoScroll(p: Press): void {
    p.frame = null;
    const { container, axis } = this.opts.get();
    const el = container.current;
    if (this.press !== p || !p.dragging || !el || !p.box) return;
    const vertical = axis !== "horizontal";
    const dir = vertical
      ? autoScrollDirection(p.y, p.box.top, p.box.bottom, SCROLL_BAND_PX)
      : autoScrollDirection(p.x, p.box.left, p.box.right, SCROLL_BAND_PX);
    if (dir === 0) return;
    const step = Math.round(dir * SCROLL_MAX_STEP);
    if (vertical) el.scrollTop += step;
    else el.scrollLeft += step;
    this.track(p);
    p.frame = window.requestAnimationFrame(() => this.autoScroll(p));
  }

  private end(drop: boolean): void {
    const p = this.press;
    if (!p) return;
    this.press = null;
    p.detach();
    if (p.timer !== null) window.clearTimeout(p.timer);
    if (p.frame !== null) window.cancelAnimationFrame(p.frame);
    if (!p.dragging) return;
    this.show(null);
    // The click that follows the pointerup of a drag (or of a long-press) is not a selection.
    this.swallowClick = true;
    window.setTimeout(() => {
      this.swallowClick = false;
    }, 0);
    if (!drop || p.index === null) return;
    const target = dropTarget(p.items.map((item) => item.id), p.ids, p.index);
    if (target) this.opts.get().onDrop(p.ids, target.before);
  }
}

export function useSlideReorder(opts: SlideReorderOptions): SlideReorder {
  const [latest] = useState(() => new Latest(opts));
  useLayoutEffect(() => {
    latest.set(opts);
  });
  const [drag, setDrag] = useState<SlideReorderDrag | null>(null);
  const [controller] = useState(() => new ReorderController(latest, setDrag));
  // A drag in progress ends (without a drop) when the list goes away.
  useEffect(() => () => controller.dispose(), [controller]);
  return { drag: opts.enabled ? drag : null, onPointerDown: controller.onPointerDown, takeClick: controller.takeClick };
}
