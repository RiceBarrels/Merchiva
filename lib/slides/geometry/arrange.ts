// Arrange helpers (slides.md §3): bounds, align, distribute, nudge and rotate as element patches. Pure: the
// editor commits the patches with updateElements in one transaction (one undo step). Locked elements never move.
// Rotated elements align and distribute by their rotated bounding box, as in PowerPoint.
import { clampCoord, normalizeRotation } from "@/lib/slides/model/safe-values";
import type { ElementPatch, ElementPatchEntry, Pt, SlideElement } from "@/lib/slides/model/types";

export interface Bounds { x: Pt; y: Pt; w: Pt; h: Pt }

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

const round = (n: number) => Math.round(n * 100) / 100;

/** Axis-aligned bounds: the rotated box of a box element, the endpoints' box of a line. */
export function elementBounds(el: SlideElement): Bounds {
  if (el.type === "line") {
    const x = Math.min(el.x1, el.x2);
    const y = Math.min(el.y1, el.y2);
    return { x, y, w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
  }
  const rad = (el.rot * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = el.w * cos + el.h * sin;
  const h = el.w * sin + el.h * cos;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Union of the elements' bounds (null for none). */
export function unionBounds(els: readonly SlideElement[]): Bounds | null {
  if (els.length === 0) return null;
  const all = els.map(elementBounds);
  const x = Math.min(...all.map((b) => b.x));
  const y = Math.min(...all.map((b) => b.y));
  const right = Math.max(...all.map((b) => b.x + b.w));
  const bottom = Math.max(...all.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** The patch that moves `el` by (dx, dy), clamped to the coordinate limit. */
function movePatch(el: SlideElement, dx: Pt, dy: Pt): ElementPatch {
  if (el.type === "line") {
    return {
      x1: round(clampCoord(el.x1 + dx, el.x1)),
      y1: round(clampCoord(el.y1 + dy, el.y1)),
      x2: round(clampCoord(el.x2 + dx, el.x2)),
      y2: round(clampCoord(el.y2 + dy, el.y2)),
    };
  }
  return { x: round(clampCoord(el.x + dx, el.x)), y: round(clampCoord(el.y + dy, el.y)) };
}

function moved(el: SlideElement, dx: Pt, dy: Pt): ElementPatchEntry | null {
  return Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005 ? null : { id: el.id, patch: movePatch(el, dx, dy) };
}

/** Aligns each element's bounds to the selection's (or the slide's) edge or centre line. */
export function alignPatches(
  els: readonly SlideElement[],
  mode: AlignMode,
  to: "selection" | "slide",
  slide: { w: Pt; h: Pt },
): ElementPatchEntry[] {
  const movable = els.filter((el) => !el.locked);
  const target = to === "slide" ? { x: 0, y: 0, w: slide.w, h: slide.h } : unionBounds(movable);
  if (!target) return [];
  return movable.flatMap((el) => {
    const b = elementBounds(el);
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = target.x - b.x;
    else if (mode === "center") dx = target.x + target.w / 2 - (b.x + b.w / 2);
    else if (mode === "right") dx = target.x + target.w - (b.x + b.w);
    else if (mode === "top") dy = target.y - b.y;
    else if (mode === "middle") dy = target.y + target.h / 2 - (b.y + b.h / 2);
    else dy = target.y + target.h - (b.y + b.h);
    return moved(el, dx, dy) ?? [];
  });
}

/** Equal gaps between three or more elements; the first and last (by position) stay where they are. */
export function distributePatches(els: readonly SlideElement[], axis: "h" | "v"): ElementPatchEntry[] {
  const movable = els.filter((el) => !el.locked);
  if (movable.length < 3) return [];
  const start = (b: Bounds) => (axis === "h" ? b.x : b.y);
  const size = (b: Bounds) => (axis === "h" ? b.w : b.h);
  const items = movable.map((el) => ({ el, b: elementBounds(el) })).sort((a, b) => start(a.b) - start(b.b) || (a.el.id < b.el.id ? -1 : 1));
  const first = items[0].b;
  const last = items[items.length - 1].b;
  const span = start(last) + size(last) - start(first);
  const gap = (span - items.reduce((sum, item) => sum + size(item.b), 0)) / (items.length - 1);
  let pos = start(first) + size(first) + gap;
  const out: ElementPatchEntry[] = [];
  for (const item of items.slice(1, -1)) {
    const delta = pos - start(item.b);
    const entry = axis === "h" ? moved(item.el, delta, 0) : moved(item.el, 0, delta);
    if (entry) out.push(entry);
    pos += size(item.b) + gap;
  }
  return out;
}

/** Moves every unlocked element by (dx, dy) pt (arrow keys: 1 pt, Shift: 10 pt). */
export function nudgePatches(els: readonly SlideElement[], dx: Pt, dy: Pt): ElementPatchEntry[] {
  return els.filter((el) => !el.locked).flatMap((el) => moved(el, dx, dy) ?? []);
}

/** Rotates by ±90°: a box element changes `rot`; a line turns its endpoints around their midpoint. */
export function rotatePatch(el: SlideElement, delta: 90 | -90): ElementPatchEntry {
  if (el.type !== "line") return { id: el.id, patch: { rot: normalizeRotation(el.rot + delta) } };
  const mx = (el.x1 + el.x2) / 2;
  const my = (el.y1 + el.y2) / 2;
  // Screen coordinates (y down): clockwise +90° maps (dx, dy) to (-dy, dx).
  const turn = (x: number, y: number): [number, number] =>
    delta === 90 ? [mx - (y - my), my + (x - mx)] : [mx + (y - my), my - (x - mx)];
  const [x1, y1] = turn(el.x1, el.y1);
  const [x2, y2] = turn(el.x2, el.y2);
  return {
    id: el.id,
    patch: { x1: round(clampCoord(x1, el.x1)), y1: round(clampCoord(y1, el.y1)), x2: round(clampCoord(x2, el.x2)), y2: round(clampCoord(y2, el.y2)) },
  };
}
