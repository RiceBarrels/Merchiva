// One slide element → pptxgenjs calls (slides.md §10.2). Positions and sizes are pt / 72 = inches; font sizes,
// margins and paragraph spacing stay pt. Everything the format cannot hold is simplified and counted in the report:
// gradients become their first stop, charts are left out, rounded picture corners become square, a custom path
// with text becomes a shape plus a separate transparent text box. Pictures come pre-fetched (ctx.images), so this
// stays synchronous and testable with a recording slide.
//
// pptxgenjs 4.0.1 quirks handled here (pptxgenjs/dist/pptxgen.es.js):
// - addText reads `margin` as [left, right, bottom, top] (:5383-5387), not the documented [t, r, b, l].
// - a link in addText's own options is written as r:id="rIdundefined" (only run links get a relationship), so an
//   element link on a text box goes onto its runs (textJsonToRuns `link`); addShape and addImage link correctly,
//   but addImage writes the link's Target unescaped, so a picture's link is escaped here (pptxImageLink).
// - shadow 0 values fall back to defaults (blur 8, offset 4, angle 270, opacity 0.75), so tiny values stand in.
// - table cell margins are pt only when the first value is ≥ 1, otherwise inches (:5328-5333).
// - any length ≥ 100 is taken as EMU already (getSmartParseNumber :631-642, inch2Emu :684-692), so a length of
//   100 in (7,200 pt) or more goes in as whole EMU (pptxLength); the model allows ±20,000 pt.
import type PptxGenJS from "pptxgenjs";

import type { SlidesExportImage } from "@/lib/slides/export/image-data";
import { runsToCellText, textJsonToRuns } from "@/lib/slides/export/pptx-text";
import {
  TABLE_CELL_INSET, cropFrame, hasCrop, pptxHex, pptxTransparency, tableCellLook, tableGrid,
} from "@/lib/slides/export/render-rules";
import type { ReportCounter } from "@/lib/slides/export/report";
import { parsePath, scalePath, type PathCommand } from "@/lib/slides/geometry/svg-path";
import { safeHref } from "@/lib/slides/model/safe-values";
import type {
  DashStyle, Fill, ImageElement, LineElement, Shadow, ShapeElement, SlideElement, Stroke, TableElement, TextElement, ThemeSpec,
} from "@/lib/slides/model/types";
import { blankTextJson, isEmptyText } from "@/lib/slides/text/plain";

export interface PptxSlideLike {
  background?: PptxGenJS.BackgroundProps;
  hidden?: boolean;
  addText: PptxGenJS.Slide["addText"];
  addShape: PptxGenJS.Slide["addShape"];
  addImage: PptxGenJS.Slide["addImage"];
  addTable: PptxGenJS.Slide["addTable"];
  addNotes: PptxGenJS.Slide["addNotes"];
}

export interface PptxExportContext {
  theme: ThemeSpec;
  /** Picture data by src; null = it could not be fetched. */
  images: ReadonlyMap<string, SlidesExportImage | null>;
  /** Preset names pptxgenjs writes natively (the values of its ShapeType). */
  shapeNames: ReadonlySet<string>;
  report: ReportCounter;
}

type ShapeName = PptxGenJS.SHAPE_NAME;
type Points = NonNullable<PptxGenJS.ShapeProps["points"]>;
type BoxElement = TextElement | ShapeElement;

const round = (n: number, digits = 4) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};
const EMU_PER_INCH = 914_400;

/** A length in inches as pptxgenjs reads it: inches below 100, whole EMU from there on (see the note above). */
export function pptxLength(inches: number): number {
  const rounded = round(inches);
  return rounded < 100 ? rounded : Math.round(inches * EMU_PER_INCH);
}

/** pt → a pptxgenjs length (inches, or EMU from 100 in). */
export const inch = (pt: number) => pptxLength(pt / 72);

const DASH: Record<DashStyle, NonNullable<PptxGenJS.ShapeLineProps["dashType"]>> = {
  solid: "solid",
  dash: "dash",
  dot: "sysDot",
  dashDot: "dashDot",
};

function frameOf(el: { x: number; y: number; w: number; h: number }) {
  return { x: inch(el.x), y: inch(el.y), w: inch(Math.max(0, el.w)), h: inch(Math.max(0, el.h)) };
}

function turnOf(el: { rot: number; flipH?: boolean; flipV?: boolean }) {
  return { rotate: el.rot ? round(el.rot, 2) : undefined, flipH: el.flipH || undefined, flipV: el.flipV || undefined };
}

function linkOf(el: SlideElement): PptxGenJS.HyperlinkProps | undefined {
  const url = safeHref(el.link);
  return url ? { url } : undefined;
}

const XML_ENTITIES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/**
 * An element link for addImage, XML-escaped here: pptxgenjs escapes the Target of run and shape links but writes a
 * picture's raw (addImageDefinition → slideObjectRelationsToXml), so `&` in a query string made the slide's .rels
 * part malformed, and a `"` (which a mailto: URL keeps) closed the attribute and added relationships of its own.
 */
export function pptxImageLink(el: SlideElement): PptxGenJS.HyperlinkProps | undefined {
  const link = linkOf(el);
  return link?.url ? { url: link.url.replace(/[&<>"']/g, (ch) => XML_ENTITIES[ch]) } : undefined;
}

export function pptxLine(stroke: Stroke | null, theme: ThemeSpec): PptxGenJS.ShapeLineProps | undefined {
  if (!stroke || stroke.width <= 0) return undefined;
  const line: PptxGenJS.ShapeLineProps = { color: pptxHex(stroke.color, theme), width: round(stroke.width, 2), dashType: DASH[stroke.dash] };
  const transparency = pptxTransparency(stroke.alpha);
  if (transparency !== undefined) line.transparency = transparency;
  if (stroke.head && stroke.head !== "none") line.beginArrowType = stroke.head;
  if (stroke.tail && stroke.tail !== "none") line.endArrowType = stroke.tail;
  return line;
}

export function pptxShadow(shadow: Shadow | null, theme: ThemeSpec): PptxGenJS.ShadowProps | undefined {
  if (!shadow || shadow.alpha <= 0) return undefined;
  const degrees = Math.round((Math.atan2(shadow.y, shadow.x) * 180) / Math.PI);
  const angle = ((degrees % 360) + 360) % 360;
  return {
    type: "outer",
    color: pptxHex(shadow.color, theme),
    opacity: Math.min(1, Math.max(0.01, shadow.alpha)),
    blur: Math.max(0.01, shadow.blur),
    offset: Math.max(0.01, round(Math.hypot(shadow.x, shadow.y), 2)),
    angle: angle === 0 ? 1 : angle,
  };
}

/** A solid-colour fill; a gradient becomes its first stop (counted). Image and "none" fills give undefined. */
function solidFill(fill: Fill, ctx: PptxExportContext): PptxGenJS.ShapeFillProps | undefined {
  if (fill.t === "solid") {
    return { color: pptxHex(fill.color, ctx.theme), transparency: pptxTransparency(fill.alpha) };
  }
  if (fill.t === "linear" && fill.stops.length > 0) {
    ctx.report.add("gradientSolid");
    return { color: pptxHex(fill.stops[0].color, ctx.theme), transparency: pptxTransparency(fill.stops[0].alpha) };
  }
  return undefined;
}

/** Path commands (already in inches, local to the shape box) as pptxgenjs custom-geometry points. */
export function custGeomPoints(cmds: readonly PathCommand[]): Points {
  const at = pptxLength;
  const points: Points = [];
  for (const cmd of cmds) {
    switch (cmd.c) {
      case "M":
        points.push({ x: at(cmd.x), y: at(cmd.y), moveTo: true });
        break;
      case "L":
        points.push({ x: at(cmd.x), y: at(cmd.y) });
        break;
      case "C":
        points.push({ x: at(cmd.x), y: at(cmd.y), curve: { type: "cubic", x1: at(cmd.x1), y1: at(cmd.y1), x2: at(cmd.x2), y2: at(cmd.y2) } });
        break;
      case "Q":
        points.push({ x: at(cmd.x), y: at(cmd.y), curve: { type: "quadratic", x1: at(cmd.x1), y1: at(cmd.y1) } });
        break;
      case "Z":
        points.push({ close: true });
        break;
    }
  }
  return points;
}

/** The preset to write, or custom-geometry points for a path that has no native preset. */
function geometryOf(el: BoxElement, ctx: PptxExportContext): { shape: ShapeName; points?: Points } {
  const geom = el.geom;
  if (geom.kind === "preset") return { shape: (ctx.shapeNames.has(geom.preset) ? geom.preset : "rect") as ShapeName };
  if (geom.srcPreset && ctx.shapeNames.has(geom.srcPreset)) return { shape: geom.srcPreset as ShapeName };
  const cmds = parsePath(geom.d);
  if (!cmds || geom.vw <= 0 || geom.vh <= 0) return { shape: "rect" as ShapeName };
  const points = custGeomPoints(scalePath(cmds, el.w / geom.vw / 72, el.h / geom.vh / 72));
  // pptxgenjs supports "custGeom" at runtime; its SHAPE_NAME union leaves it out.
  return { shape: "custGeom" as ShapeName, points };
}

/** Crop fractions that make a `iw`×`ih` picture cover a `w`×`h` frame, centred (CSS background-size: cover). */
export function coverCrop(iw: number, ih: number, w: number, h: number): ImageElement["crop"] {
  if (iw <= 0 || ih <= 0 || w <= 0 || h <= 0) return { l: 0, t: 0, r: 0, b: 0 };
  const picture = iw / ih;
  const box = w / h;
  if (picture > box) {
    const side = (1 - box / picture) / 2;
    return { l: side, t: 0, r: side, b: 0 };
  }
  const side = (1 - picture / box) / 2;
  return { l: 0, t: side, r: 0, b: side };
}

/** pptxgenjs props that show the `crop` part of a picture in the frame (the full picture is drawn, then cropped). */
function croppedProps(frame: { w: number; h: number }, w: number, h: number, crop: ImageElement["crop"]): Partial<PptxGenJS.ImageProps> {
  if (!hasCrop(crop)) return {};
  const c = cropFrame(w, h, crop);
  return { w: inch(c.fullW), h: inch(c.fullH), sizing: { type: "crop", x: inch(c.offX), y: inch(c.offY), w: frame.w, h: frame.h } };
}

/** An image fill has no pptxgenjs shape equivalent: the picture goes underneath, clipped where the format can. */
function addImageFill(slide: PptxSlideLike, el: BoxElement, ctx: PptxExportContext): void {
  if (el.fill.t !== "image") return;
  const data = ctx.images.get(el.fill.src) ?? null;
  if (!data) {
    ctx.report.add("imageMissing");
    return;
  }
  const preset = el.geom.kind === "preset" ? el.geom.preset : null;
  if (preset !== "rect" && preset !== "ellipse") ctx.report.add("maskApprox");
  const frame = frameOf(el);
  const crop = el.fill.mode === "cover" ? coverCrop(data.width, data.height, el.w, el.h) : { l: 0, t: 0, r: 0, b: 0 };
  slide.addImage({
    data: data.dataUrl,
    ...frame,
    ...turnOf(el),
    rounding: preset === "ellipse" || undefined,
    ...croppedProps(frame, el.w, el.h, crop),
  });
}

/** Text box insets in pptxgenjs's addText order: [left, right, bottom, top]. */
export function pptxTextMargin(inset: readonly [number, number, number, number]): [number, number, number, number] {
  const [l, t, r, b] = inset;
  return [round(l, 2), round(r, 2), round(b, 2), round(t, 2)];
}

function addBoxElement(slide: PptxSlideLike, el: BoxElement, ctx: PptxExportContext): void {
  addImageFill(slide, el, ctx);
  const { shape, points } = geometryOf(el, ctx);
  const frame = { ...frameOf(el), ...turnOf(el), objectName: el.name || undefined };
  const paint = { fill: solidFill(el.fill, ctx), line: pptxLine(el.stroke, ctx.theme), shadow: pptxShadow(el.shadow, ctx.theme) };
  if (isEmptyText(el.text)) {
    slide.addShape(shape, { ...frame, ...paint, points, hyperlink: linkOf(el) });
    return;
  }
  const runs = textJsonToRuns(el.text, el.textStyle, ctx.theme, { fontScale: el.box.fontScale, link: el.link });
  const text: PptxGenJS.TextPropsOptions = {
    ...frame,
    valign: el.box.vAlign,
    margin: pptxTextMargin(el.box.inset),
    fit: el.box.autofit === "grow" ? "resize" : "none",
    wrap: el.box.wrap,
    vert: el.box.vertical ? "eaVert" : undefined,
  };
  if (points) {
    // Custom geometry exists only on addShape, so the text goes into a transparent box on top (same frame).
    slide.addShape(shape, { ...frame, ...paint, points, hyperlink: linkOf(el) });
    slide.addText(runs, text);
    ctx.report.add("pathTextSplit");
    return;
  }
  slide.addText(runs, { ...text, ...paint, shape });
}

function addLineElement(slide: PptxSlideLike, el: LineElement, ctx: PptxExportContext): void {
  const line = pptxLine(el.stroke, ctx.theme);
  if (!line) return;
  // The "line" preset runs from its box's top-left to bottom-right; flips point it from (x1, y1) to (x2, y2), so the
  // head (DrawingML headEnd) stays at the start.
  slide.addShape("line" as ShapeName, {
    x: inch(Math.min(el.x1, el.x2)),
    y: inch(Math.min(el.y1, el.y2)),
    w: inch(Math.abs(el.x2 - el.x1)),
    h: inch(Math.abs(el.y2 - el.y1)),
    flipH: el.x2 < el.x1 || undefined,
    flipV: el.y2 < el.y1 || undefined,
    line,
    objectName: el.name || undefined,
    hyperlink: linkOf(el),
  });
}

function addPictureElement(slide: PptxSlideLike, el: ImageElement, ctx: PptxExportContext): void {
  const data = ctx.images.get(el.src) ?? null;
  if (!data) {
    ctx.report.add("imageMissing");
    return;
  }
  const frame = frameOf(el);
  const props: PptxGenJS.ImageProps = {
    data: data.dataUrl,
    ...frame,
    ...turnOf(el),
    rounding: el.mask === "ellipse" || undefined,
    altText: el.alt || undefined,
    hyperlink: pptxImageLink(el),
    objectName: el.name || undefined,
    ...croppedProps(frame, el.w, el.h, el.crop),
  };
  slide.addImage(props);
  if (el.mask === "roundRect") ctx.report.add("maskApprox");
  const outline = pptxLine(el.stroke, ctx.theme);
  if (outline) {
    const shape = (el.mask === "ellipse" ? "ellipse" : el.mask === "roundRect" ? "roundRect" : "rect") as ShapeName;
    slide.addShape(shape, { ...frame, ...turnOf(el), line: outline });
  }
}

/** Cell margins in pptxgenjs's [top, right, bottom, left] order, in pt when possible (see the note above). */
function cellMargin(): [number, number, number, number] {
  const [l, t, r, b] = TABLE_CELL_INSET;
  const pt: [number, number, number, number] = [t, r, b, l];
  return pt[0] >= 1 ? pt : [t / 72, r / 72, b / 72, l / 72];
}

function addTableElement(slide: PptxSlideLike, el: TableElement, ctx: PptxExportContext): void {
  const grid = tableGrid(el);
  const { border } = el.style;
  const side: PptxGenJS.BorderProps =
    border.width > 0 ? { type: "solid", color: pptxHex(border.color, ctx.theme), pt: round(border.width, 2) } : { type: "none" };
  const rows: PptxGenJS.TableRow[] = grid.rows.map((line) =>
    line.map((gc) => {
      const look = tableCellLook(el, gc);
      const runs = textJsonToRuns(gc.cell?.text ?? blankTextJson(), el.style.textStyle, ctx.theme, { color: look.color, bold: look.bold });
      return {
        text: runsToCellText(runs),
        options: {
          colspan: gc.colSpan > 1 ? gc.colSpan : undefined,
          rowspan: gc.rowSpan > 1 ? gc.rowSpan : undefined,
          valign: gc.cell?.vAlign ?? "top",
          border: [side, side, side, side],
          margin: cellMargin(),
          fill: look.fill ? { color: pptxHex(look.fill, ctx.theme) } : undefined,
        },
      };
    }),
  );
  const frame = frameOf(el);
  // `h` is only the frame's recorded height (pptxgenjs writes 1 in without it); the explicit rowH decide the rows.
  slide.addTable(rows, {
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    colW: grid.colWidths.map(inch),
    rowH: grid.rowHeights.map(inch),
    objectName: el.name || undefined,
  });
}

export function addElementToSlide(slide: PptxSlideLike, el: SlideElement, ctx: PptxExportContext): void {
  switch (el.type) {
    case "text":
    case "shape":
      return addBoxElement(slide, el, ctx);
    case "line":
      return addLineElement(slide, el, ctx);
    case "image":
      return addPictureElement(slide, el, ctx);
    case "table":
      return addTableElement(slide, el, ctx);
    case "chart":
      ctx.report.add("chartSkipped");
      return;
  }
}
