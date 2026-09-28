// The 25 preset shapes (slides.md §3): SVG path data in a w×h box plus the text area inside each shape. Our own
// geometry, drawn with the default adjust values PowerPoint uses (Phase 1 has no adjust handles). Every name is
// also a pptxgenjs SHAPE_NAME, so export writes native preset shapes. Callout tails reach below the box: the
// renderer draws shape SVG with overflow visible.
import { formatPathNumber as f } from "@/lib/slides/geometry/svg-path";
import type { Pt, ShapePreset } from "@/lib/slides/model/types";

export const SHAPE_PRESETS: readonly ShapePreset[] = [
  "rect", "roundRect", "ellipse", "triangle", "rtTriangle", "diamond", "parallelogram", "trapezoid",
  "pentagon", "hexagon", "octagon", "star4", "star5", "rightArrow", "leftArrow", "upArrow", "downArrow",
  "leftRightArrow", "chevron", "homePlate", "plus", "heart", "donut", "wedgeRectCallout", "wedgeRoundRectCallout",
];

export function isShapePreset(value: unknown): value is ShapePreset {
  return typeof value === "string" && (SHAPE_PRESETS as readonly string[]).includes(value);
}

type Point = readonly [number, number];

function polygon(points: readonly Point[]): string {
  return `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${f(x)} ${f(y)}`).join(" ")} Z`;
}

/** Closed ellipse through (cx ± rx, cy); `reverse` winds it the other way (a hole under the nonzero rule). */
function ellipse(cx: number, cy: number, rx: number, ry: number, reverse = false): string {
  const sweep = reverse ? 0 : 1;
  return (
    `M${f(cx - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 ${sweep} ${f(cx + rx)} ${f(cy)} ` +
    `A${f(rx)} ${f(ry)} 0 1 ${sweep} ${f(cx - rx)} ${f(cy)} Z`
  );
}

/** Rounded rectangle; `tail` (optional) replaces part of the bottom edge with a callout wedge. */
function roundRect(w: number, h: number, r: number, tail?: readonly Point[]): string {
  const bottom = tail ? `L${f(tail[0][0])} ${f(h)} L${f(tail[1][0])} ${f(tail[1][1])} L${f(tail[2][0])} ${f(h)} ` : "";
  return (
    `M${f(r)} 0 L${f(w - r)} 0 A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} L${f(w)} ${f(h - r)} ` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)} ${bottom}L${f(r)} ${f(h)} A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)} ` +
    `L0 ${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`
  );
}

/** Regular n-gon / star points around the unit circle, stretched to fill the box exactly. */
function radialPolygon(w: number, h: number, count: number, innerRatio: number | null): Point[] {
  const raw: Point[] = [];
  const steps = innerRatio === null ? count : count * 2;
  for (let i = 0; i < steps; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    const radius = innerRatio !== null && i % 2 === 1 ? innerRatio : 1;
    raw.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return raw.map(([x, y]) => [((x - minX) / (maxX - minX)) * w, ((y - minY) / (maxY - minY)) * h]);
}

/** Default callout tail: tip below the box at 29% of the width, base on the bottom edge. */
function calloutTail(w: number, h: number): Point[] {
  return [[w * (5 / 12), h], [w * 0.2917, h * 1.125], [w * (3 / 12), h]];
}

function safeSize(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** SVG path data of `preset` in a `w`×`h` box (pt). Always parseable, also for 0 sizes. */
export function presetPath(preset: ShapePreset, wIn: Pt, hIn: Pt): string {
  const w = safeSize(wIn);
  const h = safeSize(hIn);
  const m = Math.min(w, h);
  switch (preset) {
    case "rect":
      return polygon([[0, 0], [w, 0], [w, h], [0, h]]);
    case "roundRect":
      return roundRect(w, h, m * 0.16667);
    case "ellipse":
      return ellipse(w / 2, h / 2, w / 2, h / 2);
    case "triangle":
      return polygon([[w / 2, 0], [w, h], [0, h]]);
    case "rtTriangle":
      return polygon([[0, 0], [w, h], [0, h]]);
    case "diamond":
      return polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case "parallelogram": {
      const o = m * 0.25;
      return polygon([[o, 0], [w, 0], [w - o, h], [0, h]]);
    }
    case "trapezoid": {
      const o = m * 0.25;
      return polygon([[0, h], [o, 0], [w - o, 0], [w, h]]);
    }
    case "pentagon":
      return polygon(radialPolygon(w, h, 5, null));
    case "hexagon": {
      const o = m * 0.25;
      return polygon([[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]]);
    }
    case "octagon": {
      const o = m * 0.29289;
      return polygon([[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]]);
    }
    case "star4":
      return polygon(radialPolygon(w, h, 4, 0.25));
    case "star5":
      return polygon(radialPolygon(w, h, 5, 0.38197));
    case "rightArrow": {
      const x = w - Math.min(m * 0.5, w);
      return polygon([[0, h / 4], [x, h / 4], [x, 0], [w, h / 2], [x, h], [x, (3 * h) / 4], [0, (3 * h) / 4]]);
    }
    case "leftArrow": {
      const x = Math.min(m * 0.5, w);
      return polygon([[w, h / 4], [x, h / 4], [x, 0], [0, h / 2], [x, h], [x, (3 * h) / 4], [w, (3 * h) / 4]]);
    }
    case "upArrow": {
      const y = Math.min(m * 0.5, h);
      return polygon([[w / 4, h], [w / 4, y], [0, y], [w / 2, 0], [w, y], [(3 * w) / 4, y], [(3 * w) / 4, h]]);
    }
    case "downArrow": {
      const y = h - Math.min(m * 0.5, h);
      return polygon([[w / 4, 0], [w / 4, y], [0, y], [w / 2, h], [w, y], [(3 * w) / 4, y], [(3 * w) / 4, 0]]);
    }
    case "leftRightArrow": {
      const x = Math.min(m * 0.5, w / 2);
      return polygon([
        [0, h / 2], [x, 0], [x, h / 4], [w - x, h / 4], [w - x, 0], [w, h / 2],
        [w - x, h], [w - x, (3 * h) / 4], [x, (3 * h) / 4], [x, h],
      ]);
    }
    case "chevron": {
      const o = Math.min(m * 0.5, w);
      return polygon([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]]);
    }
    case "homePlate": {
      const o = Math.min(m * 0.5, w);
      return polygon([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]]);
    }
    case "plus": {
      const o = m * 0.25;
      return polygon([
        [o, 0], [w - o, 0], [w - o, o], [w, o], [w, h - o], [w - o, h - o],
        [w - o, h], [o, h], [o, h - o], [0, h - o], [0, o], [o, o],
      ]);
    }
    case "heart": {
      const hc = w / 2;
      const top = h / 4;
      return (
        `M${f(hc)} ${f(top)} C${f(hc + (10 * w) / 48)} ${f(-h / 3)} ${f(hc + (49 * w) / 48)} ${f(top)} ${f(hc)} ${f(h)} ` +
        `C${f(hc - (49 * w) / 48)} ${f(top)} ${f(hc - (10 * w) / 48)} ${f(-h / 3)} ${f(hc)} ${f(top)} Z`
      );
    }
    case "donut": {
      const t = m * 0.25;
      return `${ellipse(w / 2, h / 2, w / 2, h / 2)} ${ellipse(w / 2, h / 2, w / 2 - t, h / 2 - t, true)}`;
    }
    case "wedgeRectCallout": {
      const [a, tip, b] = calloutTail(w, h);
      return polygon([[0, 0], [w, 0], [w, h], a, tip, b, [0, h]]);
    }
    case "wedgeRoundRectCallout":
      return roundRect(w, h, m * 0.16667, calloutTail(w, h));
  }
}

/** Text area inside `preset`, as insets [left, top, right, bottom] from the element box (pt). */
export function presetTextInset(preset: ShapePreset, wIn: Pt, hIn: Pt): readonly [Pt, Pt, Pt, Pt] {
  const w = safeSize(wIn);
  const h = safeSize(hIn);
  const m = Math.min(w, h);
  const head = Math.min(m * 0.5, w);
  let inset: [number, number, number, number];
  switch (preset) {
    case "roundRect":
    case "wedgeRoundRectCallout": {
      const r = m * 0.16667 * 0.29289;
      inset = [r, r, r, r];
      break;
    }
    case "ellipse":
    case "donut":
      inset = [w * 0.14645, h * 0.14645, w * 0.14645, h * 0.14645];
      break;
    case "triangle":
      inset = [w / 4, h / 2, w / 4, 0];
      break;
    case "rtTriangle":
      inset = [w / 12, (7 * h) / 12, (7 * w) / 12, h / 12];
      break;
    case "diamond":
      inset = [w / 4, h / 4, w / 4, h / 4];
      break;
    case "parallelogram":
    case "trapezoid":
    case "hexagon":
      inset = [m * 0.25, 0, m * 0.25, 0];
      break;
    case "pentagon":
      inset = [w * 0.19, h * 0.38, w * 0.19, 0];
      break;
    case "octagon":
      inset = [m * 0.146, m * 0.146, m * 0.146, m * 0.146];
      break;
    case "star4":
      inset = [w * 0.375, h * 0.375, w * 0.375, h * 0.375];
      break;
    case "star5":
      inset = [w * 0.3, h * 0.35, w * 0.3, h * 0.25];
      break;
    case "rightArrow":
      inset = [0, h / 4, head / 2, h / 4];
      break;
    case "leftArrow":
      inset = [head / 2, h / 4, 0, h / 4];
      break;
    case "upArrow":
      inset = [w / 4, Math.min(m * 0.5, h) / 2, w / 4, 0];
      break;
    case "downArrow":
      inset = [w / 4, 0, w / 4, Math.min(m * 0.5, h) / 2];
      break;
    case "leftRightArrow": {
      const x = Math.min(m * 0.5, w / 2) / 2;
      inset = [x, h / 4, x, h / 4];
      break;
    }
    case "chevron":
      inset = [head, 0, head, 0];
      break;
    case "homePlate":
      inset = [0, 0, head / 2, 0];
      break;
    case "plus":
      inset = [0, m * 0.25, 0, m * 0.25];
      break;
    case "heart":
      inset = [w * 0.2, h * 0.25, w * 0.2, h * 0.3];
      break;
    default:
      inset = [0, 0, 0, 0];
  }
  // Never let the insets cross: keep a non-negative text area.
  if (inset[0] + inset[2] > w) inset = [w / 2, inset[1], w / 2, inset[3]];
  if (inset[1] + inset[3] > h) inset = [inset[0], h / 2, inset[2], h / 2];
  const r = (n: number) => Math.round(n * 100) / 100;
  return [r(inset[0]), r(inset[1]), r(inset[2]), r(inset[3])];
}
