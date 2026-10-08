// Groups and diagrams of an imported slide, flattened (slides.md §10.1 step 3, F15, F27). The model has no groups in
// Phase 1, so each child becomes a top-level element: children are sorted by `order` (document order, not
// pptxtojson's node-key order), positioned in the parent's space with the group's flips and its rotation around the
// group centre applied, and nested groups recurse. pptxtojson gives a group's children relative to the group box,
// already scaled by ext/chExt; a SmartArt drawing's shapes are relative to the diagram frame.
import { byOrder, flag, num, records, type LeanRecord } from "./lean";
import type { ImportReportBuilder } from "./report";

/** Absolute geometry of one element (pt, degrees). Flips mirror the element inside its own box. */
export interface Box { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean }

export interface FlatElement { el: LeanRecord; box: Box }

/** Deeper nesting than any real file; anything below is dropped. */
const MAX_GROUP_DEPTH = 16;
/** Elements one slide may flatten to (the model caps a slide at 400; this only bounds the work). */
const MAX_FLAT = 5_000;

function normalizeDeg(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return r === 360 ? 0 : r;
}

export function boxOf(el: LeanRecord): Box {
  return {
    x: num(el.left),
    y: num(el.top),
    w: Math.max(0, num(el.width)),
    h: Math.max(0, num(el.height)),
    rot: normalizeDeg(num(el.rotate)),
    flipH: flag(el.isFlipH),
    flipV: flag(el.isFlipV),
  };
}

/** `child` (relative to the group box) in the group's parent space. */
export function placeInGroup(child: Box, group: Box): Box {
  let cx = child.x + child.w / 2;
  let cy = child.y + child.h / 2;
  let rot = child.rot;
  let flipH = child.flipH;
  let flipV = child.flipV;
  // Mirroring a rotated box: the mirror of R(θ)·F is R(−θ)·(mirror·F).
  if (group.flipH) {
    cx = group.w - cx;
    flipH = !flipH;
    rot = -rot;
  }
  if (group.flipV) {
    cy = group.h - cy;
    flipV = !flipV;
    rot = -rot;
  }
  if (group.rot !== 0) {
    const rad = (group.rot * Math.PI) / 180;
    const dx = cx - group.w / 2;
    const dy = cy - group.h / 2;
    cx = group.w / 2 + dx * Math.cos(rad) - dy * Math.sin(rad);
    cy = group.h / 2 + dx * Math.sin(rad) + dy * Math.cos(rad);
    rot += group.rot;
  }
  return { x: group.x + cx - child.w / 2, y: group.y + cy - child.h / 2, w: child.w, h: child.h, rot: normalizeDeg(rot), flipH, flipV };
}

function round(box: Box): Box {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { ...box, x: r(box.x), y: r(box.y), w: r(box.w), h: r(box.h), rot: r(box.rot) };
}

/**
 * The elements of one slide (or one decor list, already ordered by the caller when `sort` is false), with groups and
 * diagrams replaced by their children in paint order. Reports `groupsFlattened` and `smartArtFlattened`.
 */
export function flattenElements(elements: readonly unknown[], report: ImportReportBuilder, sort = true): FlatElement[] {
  const out: FlatElement[] = [];
  const visit = (list: readonly LeanRecord[], parent: Box | null, depth: number) => {
    for (const el of list) {
      if (out.length >= MAX_FLAT) return;
      const own = boxOf(el);
      const box = parent ? placeInGroup(own, parent) : own;
      if (el.type === "group") {
        report.add("groupsFlattened");
        if (depth < MAX_GROUP_DEPTH) visit(byOrder(records(el.elements)), box, depth + 1);
      } else if (el.type === "diagram") {
        report.add("smartArtFlattened");
        // Drawing shapes are relative to the diagram frame, which has no rotation or flip of its own.
        const frame: Box = { ...box, rot: 0, flipH: false, flipV: false };
        if (depth < MAX_GROUP_DEPTH) visit(byOrder(records(el.elements)), frame, depth + 1);
      } else {
        out.push({ el, box: round(box) });
      }
    }
  };
  const top = records(elements);
  visit(sort ? byOrder(top) : top, null, 0);
  return out;
}

/** Endpoints of a straight line drawn corner to corner in `box`, with its flips and rotation applied. */
export function lineEndpoints(box: Box): { x1: number; y1: number; x2: number; y2: number } {
  let x1 = box.x;
  let y1 = box.y;
  let x2 = box.x + box.w;
  let y2 = box.y + box.h;
  if (box.flipH) [x1, x2] = [x2, x1];
  if (box.flipV) [y1, y2] = [y2, y1];
  if (box.rot !== 0) {
    const rad = (box.rot * Math.PI) / 180;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const turn = (x: number, y: number): [number, number] => [
      cx + (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad),
      cy + (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad),
    ];
    [x1, y1] = turn(x1, y1);
    [x2, y2] = turn(x2, y2);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2) };
}
