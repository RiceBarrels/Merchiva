// One flattened pptxtojson element → model elements (slides.md §10.1 step 3). Text and shapes keep their geometry
// (our 25 presets natively, anything else as its SVG path), straight connectors become lines, images keep crop and
// mask, tables and charts go through ./map-table.ts, maths becomes its fallback picture (or its LaTeX as text), and
// video and audio are dropped. Every value is re-checked by sanitizeElement when the deck is built.
import type { JSONContent } from "@tiptap/core";

import { SLIDES_MAX_PATH_CHARS } from "@/lib/slides/constants";
import { isShapePreset } from "@/lib/slides/geometry/presets";
import { DEFAULT_STROKE, DEFAULT_TEXT_BOX, DEFAULT_TEXT_DEFAULTS } from "@/lib/slides/model/defaults";
import { newSlidesId } from "@/lib/slides/model/fractional-index";
import { cleanLabel } from "@/lib/slides/model/safe-values";
import type {
  ImageElement, PlaceholderRole, ShapeElement, ShapeGeom, SlideElement, TextBox, TextDefaults, TextElement, VAlign,
} from "@/lib/slides/model/types";
import { blankTextJson } from "@/lib/slides/text/plain";

import { lineEndpoints, type Box, type FlatElement } from "./flatten";
import { importHref } from "./html-to-text";
import { flag, num, rec, str, type LeanRecord } from "./lean";
import { mapFill, mapShadow, mapStroke } from "./map-fill";
import { mapChart, mapTable, type TableTextContext } from "./map-table";

export interface ElementContext extends TableTextContext {
  /** Element text: sanitized JSON plus the text defaults most of it uses (so marks only hold the differences). */
  text(html: unknown, base: TextDefaults): { text: JSONContent; style: TextDefaults };
}

const VALIGN: Readonly<Record<string, VAlign>> = { up: "top", mid: "middle", down: "bottom", top: "top", middle: "middle", bottom: "bottom" };
/** Straight connectors (drawn corner to corner in their box) become line elements. */
const STRAIGHT_LINES = new Set(["line", "straightConnector1"]);
/** Fill and outline of the placeholder that replaces an image that cannot be shown. */
const PLACEHOLDER_FILL = "#e5e7eb";
const PLACEHOLDER_STROKE = "#9ca3af";

/** Placeholder role of an imported text box, from the shape name PowerPoint gives it ("Title 1", "标题 1", …). */
export function placeholderRoleFromName(name: string): PlaceholderRole {
  const n = name.trim().toLowerCase();
  if (/^(?:subtitle|副标题|副標題|sous-titre|subtítulo)(?!\p{L})/u.test(n)) return "subtitle";
  if (/^(?:title|标题|標題|titre|título|titel)(?!\p{L})/u.test(n)) return "title";
  if (/^(?:content placeholder|text placeholder|内容占位符|文本占位符|內容版面配置區|文字版面配置區)(?!\p{L})/u.test(n)) return "body";
  return "";
}

function baseFields(el: LeanRecord, ctx: ElementContext) {
  const rawLink = str(el.link).trim();
  const link = rawLink === "" ? "" : importHref(rawLink);
  if (rawLink !== "" && link === "") ctx.report.add("linkRemoved");
  return { id: newSlidesId(), z: "", locked: false, name: cleanLabel(str(el.name), 200), link, placeholder: "" as PlaceholderRole };
}

function boxFields(box: Box) {
  return { x: box.x, y: box.y, w: box.w, h: box.h, rot: box.rot };
}

/** A light-grey stand-in for an image that cannot be shown (EMF/WMF/TIFF, a failed upload). */
export function imagePlaceholder(fields: { id: string; z: string; name: string; x: number; y: number; w: number; h: number; rot: number }): ShapeElement {
  return {
    ...fields,
    type: "shape",
    locked: false,
    link: "",
    placeholder: "",
    geom: { kind: "preset", preset: "rect" },
    fill: { t: "solid", color: PLACEHOLDER_FILL },
    stroke: { color: PLACEHOLDER_STROKE, width: 1, dash: "dash" },
    shadow: null,
    box: DEFAULT_TEXT_BOX,
    textStyle: DEFAULT_TEXT_DEFAULTS,
    flipH: false,
    flipV: false,
    text: blankTextJson(),
  };
}

/**
 * pptxtojson writes preset paths with full float precision (a 50 pt cloud is ~49,000 characters). The path lives in
 * the shape's own pt box, so 0.01 pt (0.001 in a box under 10 pt) is plenty; rounding brings such paths under
 * SLIDES_MAX_PATH_CHARS. Longer inputs are not worth the work: they fall back to a rectangle anyway.
 */
export function compactPath(d: string, viewSize: number): string {
  if (d.length > SLIDES_MAX_PATH_CHARS * 8) return "";
  const scale = viewSize < 10 ? 1000 : 100;
  return d
    .replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, (n) => {
      const v = Math.round(Number.parseFloat(n) * scale) / scale;
      return Number.isFinite(v) ? String(Object.is(v, -0) ? 0 : v) : n;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function geomOf(el: LeanRecord, shapType: string): ShapeGeom {
  if (isShapePreset(shapType)) return { kind: "preset", preset: shapType };
  const view = rec(el.pathViewBox);
  const vw = num(view?.width);
  const vh = num(view?.height);
  const path = compactPath(str(el.path), Math.max(vw, vh));
  if (path !== "" && path.length <= SLIDES_MAX_PATH_CHARS && vw > 0 && vh > 0) {
    return { kind: "path", d: path, vw, vh, srcPreset: shapType.replace(/[^A-Za-z0-9]/g, "").slice(0, 64) };
  }
  return { kind: "preset", preset: "rect" };
}

function textBoxOf(el: LeanRecord, ctx: ElementContext): TextBox {
  const inset = rec(el.textInset);
  const autoFit = rec(el.autoFit);
  const vertical = flag(el.isVertical);
  if (vertical) ctx.report.add("verticalText");
  return {
    vAlign: VALIGN[str(el.vAlign)] ?? "top",
    inset: inset ? [num(inset.l, 7.2), num(inset.t, 3.6), num(inset.r, 7.2), num(inset.b, 3.6)] : DEFAULT_TEXT_BOX.inset,
    autofit: autoFit?.type === "shape" ? "grow" : "none",
    fontScale: autoFit?.type === "text" && autoFit.fontScale !== undefined ? num(autoFit.fontScale, 100) / 100 : 1,
    wrap: el.wrap === undefined ? true : flag(el.wrap),
    vertical,
  };
}

function mapShapeLike(el: LeanRecord, box: Box, ctx: ElementContext): SlideElement {
  const base = baseFields(el, ctx);
  const shapType = str(el.shapType);
  if (el.type === "shape" && STRAIGHT_LINES.has(shapType)) {
    return { ...base, type: "line", ...lineEndpoints(box), stroke: mapStroke(el, ctx, 0.75) ?? { ...DEFAULT_STROKE } };
  }
  const connector = /connector/i.test(shapType);
  const strokeOnly = flag(el.strokeOnly) || connector;
  const fill = strokeOnly ? null : mapFill(el.fill, ctx);
  const stroke = mapStroke(el, ctx, connector ? 0.75 : 0);
  const role = el.type === "text" || shapType === "rect" || shapType === "" ? placeholderRoleFromName(str(el.name)) : "";
  const textBase: TextDefaults = role === "title" ? { ...DEFAULT_TEXT_DEFAULTS, font: "theme:heading" } : DEFAULT_TEXT_DEFAULTS;
  const { text, style } = ctx.text(el.content, textBase);
  const hasText = str(el.content).trim() !== "";
  const isTextBox = el.type === "text" || ((shapType === "rect" || shapType === "") && fill === null && stroke === null && (hasText || role !== ""));
  const shape: Omit<TextElement, "type"> = {
    ...base,
    ...boxFields(box),
    placeholder: isTextBox ? role : "",
    geom: el.type === "text" ? { kind: "preset", preset: "rect" } : geomOf(el, shapType),
    fill: fill ?? { t: "none" },
    stroke,
    shadow: mapShadow(el.shadow, ctx),
    box: textBoxOf(el, ctx),
    textStyle: style,
    flipH: box.flipH,
    flipV: box.flipV,
    text,
  };
  return isTextBox ? { ...shape, type: "text" } : { ...shape, type: "shape" };
}

/** An image element whose `src` the upload fills in, or a placeholder when the picture cannot be shown. */
function mapPicture(el: LeanRecord, ref: unknown, box: Box, ctx: ElementContext): SlideElement {
  const base = baseFields(el, ctx);
  const found = ctx.assets.lookup(ref);
  const usable = found !== null && ["png", "jpeg", "gif", "webp", "bmp", "svg"].includes(found.kind);
  if (!usable) {
    if (!found || ctx.assets.firstReport(found.key)) ctx.report.add("imageUnsupported");
    return imagePlaceholder({ id: base.id, z: "", name: base.name, ...boxFields(box) });
  }
  const rect = rec(el.rect);
  const side = (v: unknown) => Math.min(0.99, Math.max(0, num(v, 0) / 100));
  const geom = str(el.geom);
  const image: ImageElement = {
    ...base,
    ...boxFields(box),
    type: "image",
    src: "",
    crop: { l: side(rect?.l), t: side(rect?.t), r: side(rect?.r), b: side(rect?.b) },
    mask: geom === "ellipse" ? "ellipse" : geom === "roundRect" ? "roundRect" : "",
    alt: "",
    stroke: mapStroke(el, ctx),
    flipH: box.flipH,
    flipV: box.flipV,
  };
  ctx.assets.use(found.key, (url) => {
    image.src = url;
  });
  if (rec(el.filters)) ctx.report.add("filtersDropped");
  return image;
}

/** The model elements for one flattened element (none for dropped media and unknown types). */
export function mapElement({ el, box }: FlatElement, ctx: ElementContext): SlideElement[] {
  switch (el.type) {
    case "text":
    case "shape":
      return [mapShapeLike(el, box, ctx)];
    case "image":
      return [mapPicture(el, el.base64, box, ctx)];
    case "table": {
      const table = mapTable(el, box, ctx);
      return table ? [{ ...baseFields(el, ctx), ...table }] : [];
    }
    case "chart":
      ctx.report.add("chartPlaceholder");
      return [{ ...baseFields(el, ctx), ...boxFields(box), type: "chart", chart: mapChart(el) }];
    case "math": {
      const found = ctx.assets.lookup(el.picBase64);
      if (found && ["png", "jpeg", "gif", "webp", "bmp", "svg"].includes(found.kind)) {
        ctx.report.add("mathAsImage");
        return [mapPicture(el, el.picBase64, box, ctx)];
      }
      const latex = str(el.latex).trim();
      if (latex === "") return [];
      const { text, style } = ctx.text(`<p><span>${latex.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span></p>`, DEFAULT_TEXT_DEFAULTS);
      return [{
        ...baseFields(el, ctx), ...boxFields(box), type: "text", geom: { kind: "preset", preset: "rect" }, fill: { t: "none" },
        stroke: null, shadow: null, box: DEFAULT_TEXT_BOX, textStyle: style, flipH: false, flipV: false, text,
      }];
    }
    case "video":
    case "audio":
      ctx.report.add("mediaDropped");
      return [];
    default:
      return [];
  }
}
