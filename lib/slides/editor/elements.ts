// New elements for the editor's Insert commands (slides.md §3, §7.2): a text box, a preset shape, a line or arrow,
// a picture and a table, sized for the deck and centred on the slide or placed at a point (a click or a drop).
// Pure: the element actions add them with addElements, which sanitizes and assigns ids and z keys.
import { blankTableCell } from "@/lib/slides/model/build";
import {
  DEFAULT_TABLE_COL_W, DEFAULT_TABLE_ROW_H, DEFAULT_TABLE_STYLE, DEFAULT_TEXT_BOX, DEFAULT_TEXT_DEFAULTS,
} from "@/lib/slides/model/defaults";
import { newSlidesId, sequentialKeys } from "@/lib/slides/model/fractional-index";
import type {
  ElementPatchEntry, NewElement, Pt, ShapeElement, ShapePreset, SlideElement, TextElement,
} from "@/lib/slides/model/types";
import { SLIDES_MAX_TABLE_COLS, SLIDES_MAX_TABLE_ROWS } from "@/lib/slides/constants";
import { blankTextJson } from "@/lib/slides/text/plain";

export interface SlideSize { w: Pt; h: Pt }
export interface Point { x: Pt; y: Pt }

/** Font sizes the size stepper walks through (pt), as in the common presentation tools. */
export const SLIDES_FONT_SIZES: readonly number[] = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];

/** A new text box at 960×540 (scaled to the deck like the layouts). */
const TEXT_BOX = { w: 320, h: 56 };
const SHAPE_BOX = { w: 200, h: 140 };
/** Half the length of a new line at 960×540. */
const LINE_HALF = 120;
/** A picture is fitted into this share of the slide (both axes). */
const IMAGE_MAX_SHARE = 0.6;
const round = (n: number) => Math.round(n * 100) / 100;

/** Presets whose natural box is square (a circle, a star, a heart…), so a new one is not stretched. */
const SQUARE_PRESETS: ReadonlySet<ShapePreset> = new Set<ShapePreset>(["ellipse", "star4", "star5", "plus", "heart", "donut", "octagon", "hexagon", "pentagon", "diamond"]);

export function isTextCapable(el: SlideElement): el is TextElement | ShapeElement {
  return el.type === "text" || el.type === "shape";
}

function scaleFor(slide: SlideSize): number {
  return Math.min(slide.w / 960, slide.h / 540);
}

/**
 * Top-left corner of a `box` placed on the slide: centred on the slide, or with its top-left at `at` (a click or a
 * drop), pulled back inside the slide when it would stick out.
 */
export function placeBox(box: SlideSize, slide: SlideSize, at?: Point | null): Point {
  if (!at) return { x: round((slide.w - box.w) / 2), y: round((slide.h - box.h) / 2) };
  const x = Math.min(Math.max(0, at.x), Math.max(0, slide.w - box.w));
  const y = Math.min(Math.max(0, at.y), Math.max(0, slide.h - box.h));
  return { x: round(x), y: round(y) };
}

function textBase(): Omit<TextElement, "id" | "z" | "type" | "x" | "y" | "w" | "h"> {
  return {
    locked: false,
    name: "",
    link: "",
    placeholder: "",
    rot: 0,
    geom: { kind: "preset", preset: "rect" },
    fill: { t: "none" },
    stroke: null,
    shadow: null,
    box: { ...DEFAULT_TEXT_BOX },
    textStyle: { ...DEFAULT_TEXT_DEFAULTS },
    flipH: false,
    flipV: false,
    text: blankTextJson(),
  };
}

/** An empty text box. */
export function newTextBox(slide: SlideSize, at?: Point | null): NewElement {
  const k = scaleFor(slide);
  const box = { w: round(TEXT_BOX.w * k), h: round(TEXT_BOX.h * k) };
  const { x, y } = placeBox(box, slide, at);
  return {
    ...textBase(),
    type: "text",
    x,
    y,
    ...box,
    textStyle: { ...DEFAULT_TEXT_DEFAULTS, size: round(DEFAULT_TEXT_DEFAULTS.size * k) },
  };
}

/** A preset shape filled with the first accent colour, its text centred in the text colour on top of it. */
export function newShape(preset: ShapePreset, slide: SlideSize, at?: Point | null): NewElement {
  const k = scaleFor(slide);
  const side = Math.min(SHAPE_BOX.w, SHAPE_BOX.h);
  const box = SQUARE_PRESETS.has(preset) ? { w: round(side * k), h: round(side * k) } : { w: round(SHAPE_BOX.w * k), h: round(SHAPE_BOX.h * k) };
  const { x, y } = placeBox(box, slide, at);
  return {
    ...textBase(),
    type: "shape",
    x,
    y,
    ...box,
    geom: { kind: "preset", preset },
    fill: { t: "solid", color: "theme:accent1" },
    stroke: { color: "theme:accent1", width: 1, dash: "solid" },
    box: { ...DEFAULT_TEXT_BOX, vAlign: "middle" },
    textStyle: { ...DEFAULT_TEXT_DEFAULTS, size: round(DEFAULT_TEXT_DEFAULTS.size * k), color: "theme:bg", align: "center" },
  };
}

/** A horizontal line across the middle of the slide; `arrow` ends it in a triangle head. */
export function newLine(arrow: boolean, slide: SlideSize): NewElement {
  const half = round(LINE_HALF * scaleFor(slide));
  const cx = round(slide.w / 2);
  const cy = round(slide.h / 2);
  return {
    type: "line",
    locked: false,
    name: "",
    link: "",
    placeholder: "",
    x1: round(cx - half),
    y1: cy,
    x2: round(cx + half),
    y2: cy,
    stroke: { color: "theme:text", width: 2, dash: "solid", head: "none", tail: arrow ? "triangle" : "none" },
  };
}

/** The size of a new picture: its natural size (CSS px taken as pt), shrunk to fit IMAGE_MAX_SHARE of the slide. */
export function fitImageBox(natural: SlideSize | null, slide: SlideSize): SlideSize {
  const maxW = slide.w * IMAGE_MAX_SHARE;
  const maxH = slide.h * IMAGE_MAX_SHARE;
  const w = natural && natural.w > 0 ? natural.w : maxW;
  const h = natural && natural.h > 0 ? natural.h : maxH * 0.75;
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: round(Math.max(1, w * k)), h: round(Math.max(1, h * k)) };
}

/** A picture element for an https `src` (already checked with safeImageSrc by the caller). */
export function newImage(src: string, natural: SlideSize | null, slide: SlideSize, at?: Point | null): NewElement {
  const box = fitImageBox(natural, slide);
  const corner = at ? { x: at.x - box.w / 2, y: at.y - box.h / 2 } : null;
  const { x, y } = placeBox(box, slide, corner);
  return {
    type: "image",
    locked: false,
    name: "",
    link: "",
    placeholder: "",
    x,
    y,
    ...box,
    rot: 0,
    src,
    crop: { l: 0, t: 0, r: 0, b: 0 },
    mask: "",
    alt: "",
    stroke: null,
    flipH: false,
    flipV: false,
  };
}

/** A `rows`×`cols` table (clamped to the table caps) with empty cells, as wide as fits the slide. */
export function newTable(rows: number, cols: number, slide: SlideSize): NewElement {
  const r = Math.min(SLIDES_MAX_TABLE_ROWS, Math.max(1, Math.floor(rows) || 1));
  const c = Math.min(SLIDES_MAX_TABLE_COLS, Math.max(1, Math.floor(cols) || 1));
  const k = scaleFor(slide);
  const colW = round(Math.min(DEFAULT_TABLE_COL_W * k, (slide.w - 80 * k) / c));
  const rowH = round(DEFAULT_TABLE_ROW_H * k);
  const rowKeys = sequentialKeys(r);
  const colKeys = sequentialKeys(c);
  const rowList = rowKeys.map((order) => ({ id: newSlidesId(), order, h: rowH }));
  const colList = colKeys.map((order) => ({ id: newSlidesId(), order, w: colW }));
  const box = { w: round(colW * c), h: round(rowH * r) };
  const { x, y } = placeBox(box, slide, null);
  return {
    type: "table",
    locked: false,
    name: "",
    link: "",
    placeholder: "",
    x,
    y,
    ...box,
    rot: 0,
    rows: rowList,
    cols: colList,
    cells: rowList.flatMap((row) => colList.map((col) => blankTableCell(row.id, col.id))),
    style: { ...DEFAULT_TABLE_STYLE, textStyle: { ...DEFAULT_TABLE_STYLE.textStyle, size: round(DEFAULT_TABLE_STYLE.textStyle.size * k) } },
  };
}

/**
 * Patches that mirror every unlocked element: text, shape and picture elements toggle flipH / flipV (the renderer
 * mirrors the geometry and picture, never the text); a line swaps its endpoints' x or y. Tables and charts don't flip.
 */
export function flipPatches(els: readonly SlideElement[], axis: "h" | "v"): ElementPatchEntry[] {
  return els.flatMap((el): ElementPatchEntry[] => {
    if (el.locked) return [];
    if (el.type === "text" || el.type === "shape" || el.type === "image") {
      return [{ id: el.id, patch: axis === "h" ? { flipH: !el.flipH } : { flipV: !el.flipV } }];
    }
    if (el.type === "line") {
      // A line mirrors about its own centre.
      const patch = axis === "h" ? { x1: el.x2, x2: el.x1 } : { y1: el.y2, y2: el.y1 };
      return [{ id: el.id, patch }];
    }
    return [];
  });
}
