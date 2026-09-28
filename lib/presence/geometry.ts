/*
 * Coordinates for page presence. Fractions are measured from the inline-start edge, so a click on
 * the right of a button in an LTR layout lands on the left of the same button for a colleague using
 * Arabic: both point at the same part of the element.
 */

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Into [0, 1]; anything that is not a finite number becomes the middle. */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Where viewport point (x, y) falls inside `box`, 0..1 from its inline-start and top edges. */
export function fractionIn(box: Box, x: number, y: number, rtl: boolean): Point {
  const fx = box.width > 0 ? (rtl ? box.left + box.width - x : x - box.left) / box.width : 0.5;
  const fy = box.height > 0 ? (y - box.top) / box.height : 0.5;
  return { x: clamp01(fx), y: clamp01(fy) };
}

/** The viewport point at fractions (fx, fy) of `box` — the inverse of `fractionIn`. */
export function pointIn(box: Box, fx: number, fy: number, rtl: boolean): Point {
  const ix = clamp01(fx) * box.width;
  return {
    x: rtl ? box.left + box.width - ix : box.left + ix,
    y: box.top + clamp01(fy) * box.height,
  };
}

/** `p` moved inside `box` (inset by `margin`), and whether it had to move: the target is off screen. */
export function clampToBox(p: Point, box: Box, margin = 0): { x: number; y: number; clamped: boolean } {
  const minX = box.left + margin;
  const maxX = Math.max(minX, box.left + box.width - margin);
  const minY = box.top + margin;
  const maxY = Math.max(minY, box.top + box.height - margin);
  const x = Math.min(maxX, Math.max(minX, p.x));
  const y = Math.min(maxY, Math.max(minY, p.y));
  return { x, y, clamped: x !== p.x || y !== p.y };
}

function contains(box: Box, p: Point): boolean {
  return p.x >= box.left && p.x <= box.left + box.width && p.y >= box.top && p.y <= box.top + box.height;
}

/**
 * `p` as seen through nested clipping boxes, innermost first (an inner scroller, then the page
 * region): `outside` when any box hides it — its target is scrolled out of view — and the point
 * pinned inside each box in turn (inset by `margin`). When the boxes overlap that is the point
 * pinned into their intersection; when they do not (an inner scroller scrolled out of the region),
 * it still ends inside the last one. The margin only moves the point; it never makes it `outside`.
 */
export function pinInside(p: Point, boxes: readonly Box[], margin = 0): { x: number; y: number; outside: boolean } {
  let at: Point = p;
  for (const box of boxes) at = clampToBox(at, box, margin);
  return { x: at.x, y: at.y, outside: boxes.some((box) => !contains(box, p)) };
}

const TRANSLATE_RE = /translate[XY]?\(\s*(-?[\d.]+)px(?:\s*,\s*(-?[\d.]+)px)?\s*\)/g;
const SCALE_RE = /scale\(\s*([\d.]+)\s*\)/g;
const KNOWN_RE = /translate[XY]?\(\s*-?[\d.]+px(?:\s*,\s*-?[\d.]+px)?\s*\)|scale\(\s*[\d.]+\s*\)/g;

/**
 * Whether an inline `transform` (DynamicUIElement pushes the page region with
 * `translateX(…px) scale(…)` while a dialog is open) visibly moves the element. Anything it cannot
 * read counts as moved, so cursors hide rather than point at the wrong place.
 */
export function isTransformActive(transform: string): boolean {
  const value = transform.trim();
  if (value === "" || value === "none") return false;
  if (value.replace(KNOWN_RE, "").trim() !== "") return true;
  for (const m of value.matchAll(TRANSLATE_RE)) {
    if (Math.abs(Number(m[1])) > 0.5 || Math.abs(Number(m[2] ?? 0)) > 0.5) return true;
  }
  for (const m of value.matchAll(SCALE_RE)) {
    if (Math.abs(Number(m[1]) - 1) > 0.001) return true;
  }
  return false;
}
