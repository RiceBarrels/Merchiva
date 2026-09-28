"use client";

// Lines and arrows (slides.md §3, §5.3). The wrapper ElementView places is the endpoints' bounding box padded by
// LINE_HIT_PAD on every side, so a thin or axis-aligned line still has something to grab; the line is drawn inside
// it with local <marker> defs. `head` sits at (x1, y1) and `tail` at (x2, y2), as DrawingML's headEnd / tailEnd.
import type { ReactNode } from "react";

import type { ElementRenderContext } from "@/components/slides/canvas/element-view";
import { paddedSvg, svgDefId, svgUrl } from "@/components/slides/canvas/svg-ids";
import { dashArray, hexOf } from "@/lib/slides/export/render-rules";
import type { LineElement, LineEnd, Pt } from "@/lib/slides/model/types";

/** Padding of a line's wrapper around its endpoints (pt). */
export const LINE_HIT_PAD = 6;

export interface LineEndpoints { x1: Pt; y1: Pt; x2: Pt; y2: Pt }

/** Marker shapes in a 10 × 10 box pointing along +x; `ref` is the point placed on the line's end. */
const MARKERS: Record<Exclude<LineEnd, "none">, { d: string; filled: boolean; refX: number }> = {
  arrow: { d: "M1 1 L9 5 L1 9", filled: false, refX: 8 },
  triangle: { d: "M0 0 L10 5 L0 10 Z", filled: true, refX: 8 },
  stealth: { d: "M0 0 L10 5 L0 10 L3 5 Z", filled: true, refX: 8 },
  oval: { d: "M0 5 A5 5 0 1 1 10 5 A5 5 0 1 1 0 5 Z", filled: true, refX: 5 },
  diamond: { d: "M0 5 L5 0 L10 5 L5 10 Z", filled: true, refX: 5 },
};

/** Arrowhead size relative to the stroke width, with a floor so heads on hairlines stay visible. */
function markerSize(width: Pt): number {
  return Math.max(width * 3, 5);
}

function marker(id: string, end: Exclude<LineEnd, "none">, color: string, alpha: number | undefined, width: Pt, start: boolean): ReactNode {
  const shape = MARKERS[end];
  const size = markerSize(width);
  return (
    <marker
      key={id}
      id={id}
      viewBox="0 0 10 10"
      refX={shape.refX}
      refY={5}
      markerUnits="userSpaceOnUse"
      markerWidth={size}
      markerHeight={size}
      orient={start ? "auto-start-reverse" : "auto"}
    >
      <path
        d={shape.d}
        fill={shape.filled ? color : "none"}
        fillOpacity={shape.filled ? alpha : undefined}
        stroke={shape.filled ? "none" : color}
        strokeOpacity={shape.filled ? undefined : alpha}
        strokeWidth={shape.filled ? undefined : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </marker>
  );
}

/**
 * The line inside its wrapper. `points` are absolute slide coordinates (the model's, or a gesture's); `origin` is
 * the wrapper's top-left in slide coordinates.
 */
export function LineView({ el, points, origin, ctx }: { el: LineElement; points: LineEndpoints; origin: { x: Pt; y: Pt }; ctx: ElementRenderContext }) {
  const { stroke } = el;
  const w = Math.abs(points.x2 - points.x1) + LINE_HIT_PAD * 2;
  const h = Math.abs(points.y2 - points.y1) + LINE_HIT_PAD * 2;
  if (stroke.width <= 0) return null;
  const color = hexOf(stroke.color, ctx.theme);
  const head = stroke.head && stroke.head !== "none" ? stroke.head : null;
  const tail = stroke.tail && stroke.tail !== "none" ? stroke.tail : null;
  const headId = svgDefId(ctx.idPrefix, el.id, "head");
  const tailId = svgDefId(ctx.idPrefix, el.id, "tail");
  const defs: ReactNode[] = [];
  if (head) defs.push(marker(headId, head, color, stroke.alpha, stroke.width, true));
  if (tail) defs.push(marker(tailId, tail, color, stroke.alpha, stroke.width, false));
  const frame = paddedSvg(w, h, markerSize(stroke.width) + stroke.width);
  return (
    <div aria-hidden="true" style={frame.box}>
      <svg {...frame.svg}>
        {defs.length > 0 ? <defs>{defs}</defs> : null}
        <g transform={frame.origin}>
          <line
            x1={points.x1 - origin.x}
            y1={points.y1 - origin.y}
            x2={points.x2 - origin.x}
            y2={points.y2 - origin.y}
            stroke={color}
            strokeOpacity={stroke.alpha}
            strokeWidth={stroke.width}
            strokeDasharray={dashArray(stroke.dash, stroke.width)}
            markerStart={head ? svgUrl(headId) : undefined}
            markerEnd={tail ? svgUrl(tailId) : undefined}
          />
        </g>
      </svg>
    </div>
  );
}
