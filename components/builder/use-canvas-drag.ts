import { useRef, useCallback } from "react";

export type DragState = {
  type: "move" | "resize";
  elementId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  handle?: string; // resize handle id e.g. "br", "tl", "t", "r"
};

export type DragOffset = {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

type Callbacks = {
  onDragMove: (id: string, offset: DragOffset) => void;
  onDragEnd: (id: string, offset: DragOffset) => void;
  zoom: number;
};

/**
 * Hook for canvas element move/resize via raw pointer events.
 * Uses the "modifier pattern": returns transient offsets during drag,
 * commits final position on pointerup.
 */
export function useCanvasDrag(callbacks: Callbacks) {
  const dragRef = useRef<DragState | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const startMove = useCallback(
    (e: React.PointerEvent, elementId: string, origX: number, origY: number, origW: number, origH: number) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      dragRef.current = {
        type: "move",
        elementId,
        startX: e.clientX,
        startY: e.clientY,
        origX,
        origY,
        origW,
        origH,
      };
    },
    []
  );

  const startResize = useCallback(
    (e: React.PointerEvent, elementId: string, handle: string, origX: number, origY: number, origW: number, origH: number) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      dragRef.current = {
        type: "resize",
        elementId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        origX,
        origY,
        origW,
        origH,
      };
    },
    []
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    const zoom = callbacksRef.current.zoom;
    const rawDx = (e.clientX - drag.startX) / zoom;
    const rawDy = (e.clientY - drag.startY) / zoom;

    let offset: DragOffset;

    if (drag.type === "move") {
      offset = { dx: rawDx, dy: rawDy, dw: 0, dh: 0 };
    } else {
      offset = computeResizeOffset(drag.handle!, rawDx, rawDy, drag.origW, drag.origH);
    }

    callbacksRef.current.onDragMove(drag.elementId, offset);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    const zoom = callbacksRef.current.zoom;
    const rawDx = (e.clientX - drag.startX) / zoom;
    const rawDy = (e.clientY - drag.startY) / zoom;

    let offset: DragOffset;
    if (drag.type === "move") {
      offset = { dx: rawDx, dy: rawDy, dw: 0, dh: 0 };
    } else {
      offset = computeResizeOffset(drag.handle!, rawDx, rawDy, drag.origW, drag.origH);
    }

    callbacksRef.current.onDragEnd(drag.elementId, offset);
    dragRef.current = null;
  }, []);

  const isDragging = useCallback(() => dragRef.current !== null, []);

  return { startMove, startResize, onPointerMove, onPointerUp, isDragging };
}

const MIN_SIZE = 20;

function computeResizeOffset(
  handle: string,
  rawDx: number,
  rawDy: number,
  origW: number,
  origH: number
): DragOffset {
  let dx = 0, dy = 0, dw = 0, dh = 0;

  // Horizontal
  if (handle.includes("l")) {
    // left edge: move x right, shrink width
    const maxShrink = origW - MIN_SIZE;
    const clampedDx = Math.min(rawDx, maxShrink);
    dx = clampedDx;
    dw = -clampedDx;
  } else if (handle.includes("r")) {
    // right edge: grow width
    dw = Math.max(rawDx, MIN_SIZE - origW);
  }

  // Vertical
  if (handle.includes("t")) {
    const maxShrink = origH - MIN_SIZE;
    const clampedDy = Math.min(rawDy, maxShrink);
    dy = clampedDy;
    dh = -clampedDy;
  } else if (handle.includes("b")) {
    dh = Math.max(rawDy, MIN_SIZE - origH);
  }

  return { dx, dy, dw, dh };
}
