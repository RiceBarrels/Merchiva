// Transform gestures as data (slides.md §5.3). While a drag, resize or rotate runs, the selection layer keeps one
// frame per target (the element's box, or a line's endpoint bounding box) and moves it with every pointer event; the
// end of the gesture turns the frames into element patches, committed in ONE updateElements call, which is one
// transaction and so one undo step and one push. Everything is in pt: the targets live inside the scaled stage, so
// the transform values Moveable reports are already in the stage's own units.
import { elementBounds } from "@/lib/slides/geometry/arrange";
import { clampCoord, normalizeRotation } from "@/lib/slides/model/safe-values";
import type { ElementPatch, ElementPatchEntry, LineElement, Pt, SlideElement } from "@/lib/slides/model/types";

/** Structurally the canvas `Frame` (components/slides/canvas/gesture-frames.ts). */
export interface GestureFrame {
  x: Pt;
  y: Pt;
  w: Pt;
  h: Pt;
  rot: number;
  line?: { x1: Pt; y1: Pt; x2: Pt; y2: Pt };
}

/** Smallest width / height a resize can leave (pt). */
export const MIN_ELEMENT_SIZE = 1;
/** Two values closer than this are the same position (pt). */
const EPSILON = 0.005;

export const roundPt = (n: number): number => Math.round(n * 100) / 100;

/** The frame a gesture starts from: the element's box, or a line's endpoint bounding box (rot 0). */
export function startFrame(el: SlideElement): GestureFrame {
  if (el.type === "line") {
    const b = elementBounds(el);
    return { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0 };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot };
}

function translateOf(beforeTranslate: readonly number[]): [number, number] | null {
  const [x, y] = beforeTranslate;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/**
 * The frame after a drag step. `beforeTranslate` is the wrapper's new translate; a line's wrapper is its bounding
 * box grown by `linePad` on every side, so the frame (the unpadded box) sits `linePad` further in.
 */
export function frameAfterDrag(start: GestureFrame, beforeTranslate: readonly number[], isLine: boolean, linePad: number): GestureFrame {
  const t = translateOf(beforeTranslate);
  if (!t) return start;
  const pad = isLine ? linePad : 0;
  return { ...start, x: t[0] + pad, y: t[1] + pad };
}

/** The frame after a resize step: the new size, and the translate that keeps the opposite side in place. */
export function frameAfterResize(start: GestureFrame, width: number, height: number, beforeTranslate: readonly number[]): GestureFrame {
  const t = translateOf(beforeTranslate) ?? [start.x, start.y];
  const w = Number.isFinite(width) ? Math.max(MIN_ELEMENT_SIZE, width) : start.w;
  const h = Number.isFinite(height) ? Math.max(MIN_ELEMENT_SIZE, height) : start.h;
  return { ...start, x: t[0], y: t[1], w, h };
}

/** The frame after a rotate step: the absolute rotation and (in a group) the translate that orbits the centre. */
export function frameAfterRotate(start: GestureFrame, rotation: number, beforeTranslate: readonly number[]): GestureFrame {
  const t = translateOf(beforeTranslate) ?? [start.x, start.y];
  return { ...start, x: t[0], y: t[1], rot: normalizeRotation(rotation, start.rot) };
}

const differs = (a: number, b: number) => Math.abs(a - b) >= EPSILON;

/** The patch that brings `el` to `frame` (only the keys that change), or null when nothing moves. */
export function gesturePatch(el: SlideElement, frame: GestureFrame): ElementPatchEntry | null {
  if (el.locked) return null;
  if (el.type === "line") {
    let end: { x1: Pt; y1: Pt; x2: Pt; y2: Pt };
    if (frame.line) end = frame.line;
    else {
      const b = elementBounds(el);
      const dx = frame.x - b.x;
      const dy = frame.y - b.y;
      end = { x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    }
    const patch: Partial<Pick<LineElement, "x1" | "y1" | "x2" | "y2">> = {};
    for (const key of ["x1", "y1", "x2", "y2"] as const) {
      const value = roundPt(clampCoord(end[key], el[key]));
      if (differs(value, el[key])) patch[key] = value;
    }
    return Object.keys(patch).length > 0 ? { id: el.id, patch } : null;
  }
  const patch: Record<string, number> = {};
  const next = {
    x: roundPt(clampCoord(frame.x, el.x)),
    y: roundPt(clampCoord(frame.y, el.y)),
    w: roundPt(Math.max(MIN_ELEMENT_SIZE, clampCoord(frame.w, el.w))),
    h: roundPt(Math.max(MIN_ELEMENT_SIZE, clampCoord(frame.h, el.h))),
    rot: roundPt(normalizeRotation(frame.rot, el.rot)),
  };
  for (const key of ["x", "y", "w", "h", "rot"] as const) {
    if (differs(next[key], el[key])) patch[key] = next[key];
  }
  return Object.keys(patch).length > 0 ? { id: el.id, patch: patch as ElementPatch } : null;
}

/** The patches of a whole gesture, in slide order; elements without a frame, or that did not move, are left out. */
export function gesturePatches(elements: readonly SlideElement[], frames: ReadonlyMap<string, GestureFrame>): ElementPatchEntry[] {
  return elements.flatMap((el) => {
    const frame = frames.get(el.id);
    const entry = frame ? gesturePatch(el, frame) : null;
    return entry ? [entry] : [];
  });
}

/** `to` turned about `from` to the nearest multiple of 45° (Shift while dragging a line end), keeping its length. */
export function snapLineAngle(from: { x: Pt; y: Pt }, to: { x: Pt; y: Pt }): { x: Pt; y: Pt } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return to;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
}

/** The frame of a line whose `end` ("start" = x1/y1, "end" = x2/y2) is being dragged to `point`. */
export function endpointFrame(el: LineElement, end: "start" | "end", point: { x: Pt; y: Pt }, snapAngle: boolean): GestureFrame {
  const fixed = end === "start" ? { x: el.x2, y: el.y2 } : { x: el.x1, y: el.y1 };
  const moved = snapAngle ? snapLineAngle(fixed, point) : point;
  const line = end === "start" ? { x1: moved.x, y1: moved.y, x2: el.x2, y2: el.y2 } : { x1: el.x1, y1: el.y1, x2: moved.x, y2: moved.y };
  const x = Math.min(line.x1, line.x2);
  const y = Math.min(line.y1, line.y2);
  return { x, y, w: Math.abs(line.x2 - line.x1), h: Math.abs(line.y2 - line.y1), rot: 0, line };
}
