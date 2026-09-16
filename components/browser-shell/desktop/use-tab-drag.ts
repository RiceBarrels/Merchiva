"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MouseEventHandler,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type RefObject,
} from "react";
import { DRAG_EDGE_SCROLL_STEP_PX, DRAG_EDGE_ZONE_PX, DRAG_THRESHOLD_PX } from "./chrome-geometry";

/*
 * Transform-only tab drag reorder (desktop spec §5.2). Nothing is written to the tab store
 * until the pointer is released; siblings slide with CSS transforms meanwhile.
 *
 *   IDLE ─pointerdown(primary, mouse/pen, not [data-tab-close])─▶ PRESSED   (activate, capture, cache rects)
 *   IDLE ─pointerdown(primary, touch)─▶ tap pending ─click─▶ activate   (a swipe/pan never clicks)
 *   PRESSED ─|dx| > 4px─▶ DRAGGING
 *   DRAGGING ─move─▶ offset clamped to the pinned / unpinned group, target = last sibling midpoint crossed
 *   DRAGGING ─up─▶ reorder once, then one "settling" frame without transitions ─▶ IDLE
 *   DRAGGING ─Escape | pointercancel | lostpointercapture | window blur─▶ animate back ─▶ IDLE
 *
 * Touch pointers never start a drag, so coarse devices keep native horizontal scrolling, and
 * they activate on the tap's click rather than on touch-down, so scrolling an overflowing strip
 * doesn't switch to (and route to) whichever tab the swipe started on.
 */

/** Mouse and pen activate a tab immediately on pointerdown (and may drag); touch waits for the tap's click. */
export function pressActivatesTab(pointerType: string): boolean {
  return pointerType === "mouse" || pointerType === "pen";
}

export interface TabDragState {
  readonly id: string;
  readonly originIndex: number;
  readonly targetIndex: number;
  readonly offsetX: number;
  /** Width of the dragged tab (siblings in one group share it). */
  readonly width: number;
  readonly phase: "dragging" | "settling";
}

export interface TabPointerHandlers {
  readonly onPointerDown: PointerEventHandler<HTMLElement>;
  readonly onPointerMove: PointerEventHandler<HTMLElement>;
  readonly onPointerUp: PointerEventHandler<HTMLElement>;
  readonly onPointerCancel: PointerEventHandler<HTMLElement>;
  readonly onLostPointerCapture: PointerEventHandler<HTMLElement>;
  /** Activates a tab tapped with touch (see pressActivatesTab). */
  readonly onClick: MouseEventHandler<HTMLElement>;
}

interface CachedRect {
  readonly left: number;
  readonly width: number;
}

interface PressState {
  readonly id: string;
  readonly pointerId: number;
  readonly element: HTMLElement;
  readonly startX: number;
  readonly startScroll: number;
  readonly originIndex: number;
  readonly groupStart: number;
  readonly groupEnd: number;
  /** Content-space rects (list-relative left + scroll at press time), aligned with the tabs array. */
  readonly rects: readonly CachedRect[];
  lastX: number;
  dragging: boolean;
  targetIndex: number;
}

export function useTabDrag(opts: {
  listRef: RefObject<HTMLElement | null>;
  tabs: readonly { id: string; pinned: boolean }[];
  pinnedCount: number;
  rtl: boolean;
  onActivate(id: string): void;
  onReorder(id: string, toIndex: number): void;
}): {
  drag: TabDragState | null;
  handlers: TabPointerHandlers;
  /** Transform (px) for the tab at `index`; 0 when not affected by the current drag. */
  translateFor(id: string, index: number): number;
  /** Aborts a press or drag (Escape on the pressed tab); siblings animate back. */
  cancel(): void;
} {
  const [drag, setDrag] = useState<TabDragState | null>(null);
  const pressRef = useRef<PressState | null>(null);
  /** Tab id of a touch press waiting for its click. */
  const tapIdRef = useRef<string | null>(null);
  const frameRef = useRef(0);
  const settleFrameRef = useRef(0);
  const latest = useRef(opts);

  useLayoutEffect(() => {
    latest.current = opts;
  });

  const stopAutoScroll = useCallback(() => {
    if (frameRef.current !== 0) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
  }, []);

  const computeDrag = useCallback((press: PressState) => {
    const list = latest.current.listRef.current;
    if (!list) return;
    const { rtl } = latest.current;
    const origin = press.rects[press.originIndex];
    if (!origin) return;

    let offset = press.lastX - press.startX + (list.scrollLeft - press.startScroll);
    let minLeft = Number.POSITIVE_INFINITY;
    let maxRight = Number.NEGATIVE_INFINITY;
    for (let i = press.groupStart; i <= press.groupEnd; i++) {
      const rect = press.rects[i];
      if (!rect) continue;
      minLeft = Math.min(minLeft, rect.left);
      maxRight = Math.max(maxRight, rect.left + rect.width);
    }
    if (Number.isFinite(minLeft) && Number.isFinite(maxRight)) {
      offset = Math.min(Math.max(offset, minLeft - origin.left), maxRight - origin.width - origin.left);
    }

    const center = origin.left + origin.width / 2 + offset;
    let target = press.originIndex;
    for (let j = press.groupStart; j <= press.groupEnd; j++) {
      if (j === press.originIndex) continue;
      const rect = press.rects[j];
      if (!rect) continue;
      const mid = rect.left + rect.width / 2;
      // Higher indexes sit to the right in LTR and to the left in RTL.
      const crossed = j > press.originIndex ? (rtl ? center < mid : center > mid) : rtl ? center > mid : center < mid;
      if (!crossed) continue;
      target = j > press.originIndex ? Math.max(target, j) : Math.min(target, j);
    }
    press.targetIndex = target;
    setDrag({
      id: press.id,
      originIndex: press.originIndex,
      targetIndex: target,
      offsetX: offset,
      width: origin.width,
      phase: "dragging",
    });
  }, []);

  const endPress = useCallback(
    (press: PressState) => {
      pressRef.current = null;
      stopAutoScroll();
      if (press.element.hasPointerCapture(press.pointerId)) {
        try {
          press.element.releasePointerCapture(press.pointerId);
        } catch {
          // Capture already gone.
        }
      }
    },
    [stopAutoScroll],
  );

  const cancel = useCallback(() => {
    const press = pressRef.current;
    if (!press) return;
    endPress(press);
    setDrag(null);
  }, [endPress]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    tapIdRef.current = null;
    if (event.button === 1) {
      // Suppress Windows autoscroll; middle-click closes on auxclick.
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-tab-close]")) return;
    const element = event.currentTarget;
    const id = element.dataset.tabId;
    if (!id) return;
    if (!pressActivatesTab(event.pointerType)) {
      tapIdRef.current = id;
      return;
    }
    const { tabs, pinnedCount, onActivate } = latest.current;
    onActivate(id);

    const list = latest.current.listRef.current;
    const originIndex = tabs.findIndex((tab) => tab.id === id);
    if (!list || originIndex < 0) return;

    const listBounds = list.getBoundingClientRect();
    const scroll = list.scrollLeft;
    const byId = new Map<string, CachedRect>();
    list.querySelectorAll<HTMLElement>("[data-tab-id]").forEach((node) => {
      const tabId = node.dataset.tabId;
      if (!tabId) return;
      const r = node.getBoundingClientRect();
      byId.set(tabId, { left: r.left - listBounds.left + scroll, width: r.width });
    });
    const rects = tabs.map((tab) => byId.get(tab.id) ?? { left: 0, width: 0 });
    const pinned = tabs[originIndex].pinned;
    const groupStart = pinned ? 0 : pinnedCount;
    const groupEnd = pinned ? Math.max(0, pinnedCount - 1) : tabs.length - 1;

    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    pressRef.current = {
      id,
      pointerId: event.pointerId,
      element,
      startX: event.clientX,
      startScroll: scroll,
      originIndex,
      groupStart,
      groupEnd,
      rects,
      lastX: event.clientX,
      dragging: false,
      targetIndex: originIndex,
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (!press || event.pointerId !== press.pointerId) return;
      press.lastX = event.clientX;
      if (!press.dragging) {
        if (Math.abs(event.clientX - press.startX) <= DRAG_THRESHOLD_PX) return;
        press.dragging = true;
      }
      computeDrag(press);
    },
    [computeDrag],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (!press || event.pointerId !== press.pointerId) return;
      endPress(press);
      if (!press.dragging) return;
      if (press.targetIndex !== press.originIndex) {
        latest.current.onReorder(press.id, press.targetIndex);
        // Order and transforms change in the same commit; keep transitions off for one frame.
        setDrag({
          id: press.id,
          originIndex: press.originIndex,
          targetIndex: press.targetIndex,
          offsetX: 0,
          width: 0,
          phase: "settling",
        });
        if (settleFrameRef.current !== 0) window.cancelAnimationFrame(settleFrameRef.current);
        settleFrameRef.current = window.requestAnimationFrame(() => {
          settleFrameRef.current = window.requestAnimationFrame(() => {
            settleFrameRef.current = 0;
            setDrag(null);
          });
        });
      } else {
        setDrag(null);
      }
    },
    [endPress],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (!press || event.pointerId !== press.pointerId) return;
      cancel();
    },
    [cancel],
  );

  const onClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const id = event.currentTarget.dataset.tabId;
    if (!id || tapIdRef.current !== id) return;
    tapIdRef.current = null;
    latest.current.onActivate(id);
  }, []);

  const dragging = drag?.phase === "dragging";

  // Edge auto-scroll while dragging: the pointer within DRAG_EDGE_ZONE_PX of the tablist edge
  // scrolls it by DRAG_EDGE_SCROLL_STEP_PX per frame. Escape is handled by the pressed tab's own
  // keydown (it holds focus during the press), so no global keyboard listener is installed.
  useEffect(() => {
    if (!dragging) return;
    const tick = () => {
      const press = pressRef.current;
      const list = latest.current.listRef.current;
      if (press && press.dragging && list) {
        const bounds = list.getBoundingClientRect();
        let delta = 0;
        if (press.lastX < bounds.left + DRAG_EDGE_ZONE_PX) delta = -DRAG_EDGE_SCROLL_STEP_PX;
        else if (press.lastX > bounds.right - DRAG_EDGE_ZONE_PX) delta = DRAG_EDGE_SCROLL_STEP_PX;
        if (delta !== 0 && list.scrollWidth > list.clientWidth) {
          const before = list.scrollLeft;
          list.scrollLeft = before + delta;
          if (list.scrollLeft !== before) computeDrag(press);
        }
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    window.addEventListener("blur", cancel);
    return () => {
      stopAutoScroll();
      window.removeEventListener("blur", cancel);
    };
  }, [dragging, cancel, computeDrag, stopAutoScroll]);

  useEffect(
    () => () => {
      stopAutoScroll();
      if (settleFrameRef.current !== 0) window.cancelAnimationFrame(settleFrameRef.current);
    },
    [stopAutoScroll],
  );

  const handlers = useMemo<TabPointerHandlers>(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
      onClick,
    }),
    [onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick],
  );

  const { rtl } = opts;
  const translateFor = useCallback(
    (id: string, index: number): number => {
      if (!drag || drag.phase !== "dragging") return 0;
      if (id === drag.id) return drag.offsetX;
      const direction = rtl ? -1 : 1;
      if (drag.targetIndex > drag.originIndex && index > drag.originIndex && index <= drag.targetIndex) {
        return -drag.width * direction;
      }
      if (drag.targetIndex < drag.originIndex && index >= drag.targetIndex && index < drag.originIndex) {
        return drag.width * direction;
      }
      return 0;
    },
    [drag, rtl],
  );

  return { drag, handlers, translateFor, cancel };
}
