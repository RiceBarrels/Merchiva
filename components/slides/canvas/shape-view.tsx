"use client";

// Text and shape elements (slides.md §3, §5.2): the geometry as one SVG path, drawn in the element's own w×h box
// (presets and custom paths are both scaled by recomputing the path, so strokes keep their width), and the text on
// top of it. Flips follow PowerPoint: they apply to the geometry only; flipH never mirrors text and flipV turns it
// 180°. Paint is written as SVG presentation attributes with resolved colours and local defs, because html2canvas
// rasterizes each <svg> as a standalone image (no CSS classes, no custom properties, no outside defs, no external
// images). For the same reason an image fill is an SVG pattern on screen but an HTML layer in export mode.
import { useMemo, type CSSProperties, type ReactNode } from "react";

import type { ElementRenderContext } from "@/components/slides/canvas/element-view";
import { SlideTextBlock } from "@/components/slides/canvas/rich-text-view";
import { paddedSvg, svgDefId, svgUrl } from "@/components/slides/canvas/svg-ids";
import {
  ROUND_RECT_RATIO, cssUrl, dashArray, gradientVector, hexOf, shapePathD, textAreaInsets,
} from "@/lib/slides/export/render-rules";
import { safeImageSrc } from "@/lib/slides/model/safe-values";
import type { Fill, Pt, ShapeElement, TextElement } from "@/lib/slides/model/types";
import { isEmptyText } from "@/lib/slides/text/plain";

type BoxElement = TextElement | ShapeElement;

/** Presets whose tail reaches below the box (presets.ts calloutTail). */
const CALLOUTS: ReadonlySet<string> = new Set(["wedgeRectCallout", "wedgeRoundRectCallout"]);

const JUSTIFY: Record<BoxElement["box"]["vAlign"], CSSProperties["justifyContent"]> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

/** SVG transform that mirrors the geometry inside its box. */
export function flipTransform(flipH: boolean, flipV: boolean, w: Pt, h: Pt): string | undefined {
  if (flipH && flipV) return `translate(${w} ${h}) scale(-1 -1)`;
  if (flipH) return `translate(${w} 0) scale(-1 1)`;
  if (flipV) return `translate(0 ${h}) scale(1 -1)`;
  return undefined;
}

/** CSS border-radius that approximates a geometry on an HTML layer (export image fills). */
function layerRadius(el: BoxElement, w: Pt, h: Pt): string | undefined {
  if (el.geom.kind !== "preset") return undefined;
  if (el.geom.preset === "ellipse") return "50%";
  if (el.geom.preset === "roundRect") return `${Math.min(w, h) * ROUND_RECT_RATIO}px`;
  return undefined;
}

function ImageFillLayer({ el, fill, w, h }: { el: BoxElement; fill: Extract<Fill, { t: "image" }>; w: Pt; h: Pt }) {
  const src = safeImageSrc(fill.src);
  if (src === "") return null;
  const flip = el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: w,
        height: h,
        backgroundImage: cssUrl(src),
        backgroundSize: fill.mode === "cover" ? "cover" : "100% 100%",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        borderRadius: layerRadius(el, w, h),
        transform: flip,
      }}
    />
  );
}

/** How far a shape may paint outside its box: half its stroke (and joins), its shadow, a callout's tail. */
function paintOverflow(el: BoxElement, h: Pt): number {
  const stroke = el.stroke && el.stroke.width > 0 ? el.stroke.width : 0;
  const shadow = el.shadow && el.shadow.alpha > 0 ? Math.max(Math.abs(el.shadow.x), Math.abs(el.shadow.y)) + el.shadow.blur * 3 : 0;
  const callout = el.geom.kind === "preset" && CALLOUTS.has(el.geom.preset) ? h * 0.13 : 0;
  return stroke + shadow + callout + 1;
}

function Geometry({ el, d, w, h, ctx }: { el: BoxElement; d: string; w: Pt; h: Pt; ctx: ElementRenderContext }) {
  const { theme } = ctx;
  const id = (kind: "grad" | "shadow" | "pattern") => svgDefId(ctx.idPrefix, el.id, kind);
  const defs: ReactNode[] = [];
  let fill = "none";
  let fillOpacity: number | undefined;
  const f = el.fill;
  if (f.t === "solid") {
    fill = hexOf(f.color, theme);
    fillOpacity = f.alpha;
  } else if (f.t === "linear") {
    const v = gradientVector(f.angle);
    defs.push(
      <linearGradient key="grad" id={id("grad")} x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>
        {f.stops.map((s, i) => (
          <stop key={i} offset={s.pos} stopColor={hexOf(s.color, theme)} stopOpacity={s.alpha ?? 1} />
        ))}
      </linearGradient>,
    );
    fill = svgUrl(id("grad"));
  } else if (f.t === "image" && ctx.mode !== "export") {
    const src = safeImageSrc(f.src);
    if (src !== "") {
      defs.push(
        <pattern key="pattern" id={id("pattern")} patternUnits="userSpaceOnUse" x={0} y={0} width={Math.max(w, 1)} height={Math.max(h, 1)}>
          <image href={src} x={0} y={0} width={w} height={h} preserveAspectRatio={f.mode === "cover" ? "xMidYMid slice" : "none"} />
        </pattern>,
      );
      fill = svgUrl(id("pattern"));
    }
  }
  const stroke = el.stroke && el.stroke.width > 0 ? el.stroke : null;
  const shadow = el.shadow && el.shadow.alpha > 0 ? el.shadow : null;
  if (shadow) {
    const pad = shadow.blur * 3 + 8;
    defs.push(
      <filter
        key="shadow"
        id={id("shadow")}
        filterUnits="userSpaceOnUse"
        x={Math.min(0, shadow.x) - pad}
        y={Math.min(0, shadow.y) - pad}
        width={w + Math.abs(shadow.x) + pad * 2}
        height={h + Math.abs(shadow.y) + pad * 2}
      >
        <feDropShadow dx={shadow.x} dy={shadow.y} stdDeviation={shadow.blur / 2} floodColor={hexOf(shadow.color, theme)} floodOpacity={shadow.alpha} />
      </filter>,
    );
  }
  const frame = paddedSvg(w, h, paintOverflow(el, h));
  return (
    <div aria-hidden="true" style={frame.box}>
      <svg {...frame.svg}>
        {defs.length > 0 ? <defs>{defs}</defs> : null}
        <g transform={frame.origin}>
          <g filter={shadow ? svgUrl(id("shadow")) : undefined}>
            <g transform={flipTransform(el.flipH, el.flipV, w, h)}>
              <path
                d={d}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke ? hexOf(stroke.color, theme) : "none"}
                strokeOpacity={stroke?.alpha}
                strokeWidth={stroke ? stroke.width : undefined}
                strokeDasharray={stroke ? dashArray(stroke.dash, stroke.width) : undefined}
                strokeLinejoin="round"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

function TextArea({ el, w, h, ctx }: { el: BoxElement; w: Pt; h: Pt; ctx: ElementRenderContext }) {
  const editing = !ctx.decor && ctx.renderEditor && ctx.editorTargetId === el.id;
  const empty = isEmptyText(el.text);
  const prompt = ctx.mode === "edit" && el.placeholder !== "" && empty ? (ctx.labels?.placeholders[el.placeholder] ?? null) : null;
  if (!editing && empty && !prompt) return null;
  const [l, t, r, b] = textAreaInsets(el, w, h);
  const areaW = Math.max(0, w - l - r);
  const areaH = Math.max(0, h - t - b);
  const scale = el.box.fontScale;
  return (
    <div style={{ position: "absolute", left: l, top: t, width: areaW, height: areaH, transform: el.flipV ? "rotate(180deg)" : undefined }}>
      <div
        style={{
          width: areaW / scale,
          height: areaH / scale,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: "0 0",
          display: "flex",
          flexDirection: "column",
          justifyContent: JUSTIFY[el.box.vAlign],
        }}
      >
        <SlideTextBlock
          json={el.text}
          defaults={el.textStyle}
          wrap={el.box.wrap}
          vertical={el.box.vertical}
          onLinkClick={ctx.mode === "present" ? ctx.onLinkClick : undefined}
          editor={editing && ctx.renderEditor ? ctx.renderEditor(el) : undefined}
          prompt={prompt}
        />
      </div>
    </div>
  );
}

export function ShapeView({ el, w, h, ctx }: { el: BoxElement; w: Pt; h: Pt; ctx: ElementRenderContext }) {
  const d = useMemo(() => shapePathD(el.geom, w, h), [el.geom, w, h]);
  const exportImageFill = el.fill.t === "image" && ctx.mode === "export";
  const filled = el.fill.t === "solid" || el.fill.t === "linear" || (el.fill.t === "image" && !exportImageFill);
  const painted = d !== "" && (filled || (el.stroke !== null && el.stroke.width > 0) || (el.shadow !== null && el.shadow.alpha > 0));
  return (
    <>
      {exportImageFill && el.fill.t === "image" ? <ImageFillLayer el={el} fill={el.fill} w={w} h={h} /> : null}
      {painted ? <Geometry el={el} d={d} w={w} h={h} ctx={ctx} /> : null}
      <TextArea el={el} w={w} h={h} ctx={ctx} />
    </>
  );
}
