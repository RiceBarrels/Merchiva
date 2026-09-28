"use client";

// One element on a slide (slides.md §5.2, §5.3). The wrapper is an absolutely positioned w×h box moved with
// `translate(x, y) rotate(rot)` around its centre; the type views draw inside it in local coordinates. While a
// gesture moves the element, the frame from the gesture store replaces the model's box (the type views get the
// frame's size, so a preset or custom path is recomputed rather than stretched). A line's wrapper is its
// endpoints' bounding box padded by LINE_HIT_PAD.
//
// Only edit mode marks elements for selection (data-el-id, data-locked). Decor (theme or master elements behind
// the slide's own) is never selectable and never takes pointer events. In present mode an element link opens
// through onLinkClick and does not reach the slide (which would advance it).
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";

import { ChartPlaceholderView } from "@/components/slides/canvas/chart-placeholder-view";
import { useElementFrame, type Frame } from "@/components/slides/canvas/gesture-frames";
import { ImageView } from "@/components/slides/canvas/image-view";
import { LINE_HIT_PAD, LineView, type LineEndpoints } from "@/components/slides/canvas/line-view";
import { ShapeView } from "@/components/slides/canvas/shape-view";
import type { SlideViewLabels, SlideViewMode } from "@/components/slides/canvas/slide-view";
import { TableView } from "@/components/slides/canvas/table-view";
import { elementBounds } from "@/lib/slides/geometry/arrange";
import { safeHref } from "@/lib/slides/model/safe-values";
import type { LineElement, SlideElement, ThemeSpec } from "@/lib/slides/model/types";

export interface ElementRenderContext {
  theme: ThemeSpec;
  mode: SlideViewMode;
  /** SVG def id prefix of this layer (slide elements, or decor: decorIdPrefix). */
  idPrefix: string;
  decor: boolean;
  labels?: SlideViewLabels;
  onLinkClick?: (href: string) => void;
  editorTargetId?: string | null;
  renderEditor?: (el: SlideElement, cellKey?: string) => ReactNode;
  /** Picture srcs known not to load (SlideViewProps.unavailableImages). */
  unavailableImages?: ReadonlySet<string>;
}

/** A line's endpoints under a gesture frame: explicit endpoints, or the model's shifted with its bounding box. */
export function lineEndpoints(el: LineElement, frame: Frame | null): LineEndpoints {
  if (!frame) return { x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2 };
  if (frame.line) return frame.line;
  const b = elementBounds(el);
  const dx = frame.x - b.x;
  const dy = frame.y - b.y;
  return { x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
}

function wrapperStyle(x: number, y: number, w: number, h: number, rot: number, decor: boolean, link: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: w,
    height: h,
    transform: rot ? `translate(${x}px, ${y}px) rotate(${rot}deg)` : `translate(${x}px, ${y}px)`,
    pointerEvents: decor ? "none" : undefined,
    cursor: link ? "pointer" : undefined,
  };
}

export function ElementView({ el, ctx }: { el: SlideElement; ctx: ElementRenderContext }) {
  // Decor never moves with a gesture: an empty id reads no frame.
  const frame = useElementFrame(ctx.decor ? "" : el.id);
  const link = ctx.mode === "present" && !ctx.decor && ctx.onLinkClick && el.link ? safeHref(el.link) : "";
  const onLinkClick = ctx.onLinkClick;
  const linkProps =
    link !== "" && onLinkClick
      ? {
          role: "link" as const,
          tabIndex: 0,
          onClick: (event: MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            onLinkClick(link);
          },
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            onLinkClick(link);
          },
        }
      : {};
  const selectable = ctx.mode === "edit" && !ctx.decor;
  const dataProps = selectable
    ? { "data-el-id": el.id, "data-el-type": el.type, "data-locked": el.locked ? "1" : undefined }
    : { "data-decor": ctx.decor ? "1" : undefined };

  if (el.type === "line") {
    const points = lineEndpoints(el, frame);
    const origin = { x: Math.min(points.x1, points.x2) - LINE_HIT_PAD, y: Math.min(points.y1, points.y2) - LINE_HIT_PAD };
    const w = Math.abs(points.x2 - points.x1) + LINE_HIT_PAD * 2;
    const h = Math.abs(points.y2 - points.y1) + LINE_HIT_PAD * 2;
    return (
      <div {...dataProps} {...linkProps} style={wrapperStyle(origin.x, origin.y, w, h, 0, ctx.decor, link !== "")}>
        <LineView el={el} points={points} origin={origin} ctx={ctx} />
      </div>
    );
  }

  const box = frame ?? el;
  const w = Math.max(0, box.w);
  const h = Math.max(0, box.h);
  let body: ReactNode;
  switch (el.type) {
    case "text":
    case "shape":
      body = <ShapeView el={el} w={w} h={h} ctx={ctx} />;
      break;
    case "image":
      body = <ImageView el={el} w={w} h={h} ctx={ctx} />;
      break;
    case "table":
      body = <TableView el={el} w={w} h={h} ctx={ctx} />;
      break;
    case "chart":
      body = <ChartPlaceholderView el={el} w={w} h={h} ctx={ctx} />;
      break;
  }
  return (
    <div {...dataProps} {...linkProps} style={wrapperStyle(box.x, box.y, w, h, box.rot, ctx.decor, link !== "")}>
      {body}
    </div>
  );
}
