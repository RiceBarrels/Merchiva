// Univer styles → ExcelJS styles (sheets.md §11.4, the inverse of §11.3.3). Univer composes a cell's look
// from layers (workbook default < sheet default < row < column < cell, a later layer's key wins); an Excel
// cell format is complete, so the writer composes the layers first and converts the result once per
// distinct combination (ExcelStyleCache).

import type * as ExcelJS from "exceljs";
import type {
  BaselineOffset,
  BorderStyleTypes,
  IBorderData,
  IBorderStyleData,
  IStyleBase,
  IStyleData,
  TextDecoration,
  TextDirection,
} from "@univerjs/presets";
import { BOOL, BORDER_STYLE, H_ALIGN, V_ALIGN, WRAP } from "@/lib/sheets/univer-constants";
import { univerColorToArgb } from "./colors";
import { normalizeNumFmt } from "./number-formats";

// Literal mirrors of enum members univer-constants.ts does not carry; the annotations make tsc check them.
const VA_SUBSCRIPT: BaselineOffset.SUBSCRIPT = 2;
const VA_SUPERSCRIPT: BaselineOffset.SUPERSCRIPT = 3;
const TD_LTR: TextDirection.LEFT_TO_RIGHT = 1;
const TD_RTL: TextDirection.RIGHT_TO_LEFT = 2;
const UL_DOUBLE: TextDecoration.DOUBLE = 10;
const UL_SINGLE_ACCOUNTING: TextDecoration.SINGLE_ACCOUNTING = 18;
const UL_DOUBLE_ACCOUNTING: TextDecoration.DOUBLE_ACCOUNTING = 19;

/** Univer BorderStyleTypes → Excel border style (NONE has none). */
export const EXCEL_BORDER_BY_UNIVER: Readonly<Partial<Record<number, ExcelJS.BorderStyle>>> = {
  [BORDER_STYLE.THIN]: "thin",
  [BORDER_STYLE.HAIR]: "hair",
  [BORDER_STYLE.DOTTED]: "dotted",
  [BORDER_STYLE.DASHED]: "dashed",
  [BORDER_STYLE.DASH_DOT]: "dashDot",
  [BORDER_STYLE.DASH_DOT_DOT]: "dashDotDot",
  [BORDER_STYLE.DOUBLE]: "double",
  [BORDER_STYLE.MEDIUM]: "medium",
  [BORDER_STYLE.MEDIUM_DASHED]: "mediumDashed",
  [BORDER_STYLE.MEDIUM_DASH_DOT]: "mediumDashDot",
  [BORDER_STYLE.MEDIUM_DASH_DOT_DOT]: "mediumDashDotDot",
  [BORDER_STYLE.SLANT_DASH_DOT]: "slantDashDot",
  [BORDER_STYLE.THICK]: "thick",
};

/** Excel border style → Univer BorderStyleTypes (the inverse, for the reader). */
export const UNIVER_BORDER_BY_EXCEL: Readonly<Record<ExcelJS.BorderStyle, BorderStyleTypes>> = {
  thin: BORDER_STYLE.THIN,
  hair: BORDER_STYLE.HAIR,
  dotted: BORDER_STYLE.DOTTED,
  dashed: BORDER_STYLE.DASHED,
  dashDot: BORDER_STYLE.DASH_DOT,
  dashDotDot: BORDER_STYLE.DASH_DOT_DOT,
  double: BORDER_STYLE.DOUBLE,
  medium: BORDER_STYLE.MEDIUM,
  mediumDashed: BORDER_STYLE.MEDIUM_DASHED,
  mediumDashDot: BORDER_STYLE.MEDIUM_DASH_DOT,
  mediumDashDotDot: BORDER_STYLE.MEDIUM_DASH_DOT_DOT,
  slantDashDot: BORDER_STYLE.SLANT_DASH_DOT,
  thick: BORDER_STYLE.THICK,
};

const H_ALIGN_TO_EXCEL: Readonly<Partial<Record<number, ExcelJS.Alignment["horizontal"]>>> = {
  [H_ALIGN.LEFT]: "left",
  [H_ALIGN.CENTER]: "center",
  [H_ALIGN.RIGHT]: "right",
  [H_ALIGN.JUSTIFIED]: "justify",
  [H_ALIGN.BOTH]: "justify",
  [H_ALIGN.DISTRIBUTED]: "distributed",
};

const V_ALIGN_TO_EXCEL: Readonly<Partial<Record<number, ExcelJS.Alignment["vertical"]>>> = {
  [V_ALIGN.TOP]: "top",
  [V_ALIGN.MIDDLE]: "middle",
  [V_ALIGN.BOTTOM]: "bottom",
};

/** Univer's padding per Excel indent level (the reader writes `pd.l = indent * 9`). */
export const INDENT_PX = 9;
const MAX_INDENT = 250;
const MIN_FONT_PT = 1;
const MAX_FONT_PT = 409;

/** = Univer's Nullable (which includes void). */
type Nullable<T> = T | null | undefined | void;

function colorOf(style: Parameters<typeof univerColorToArgb>[0]): Partial<ExcelJS.Color> | undefined {
  const argb = univerColorToArgb(style);
  return argb ? { argb } : undefined;
}

function underlineOf(style: IStyleBase): ExcelJS.Font["underline"] | undefined {
  const ul = style.ul;
  if (!ul || ul.s !== BOOL.TRUE) return undefined;
  if (ul.t === UL_DOUBLE) return "double";
  if (ul.t === UL_SINGLE_ACCOUNTING) return "singleAccounting";
  if (ul.t === UL_DOUBLE_ACCOUNTING) return "doubleAccounting";
  return true;
}

/** The font of a style or a rich-text run; undefined when the style sets no font property. */
export function excelFontFrom(style: Nullable<IStyleBase>): Partial<ExcelJS.Font> | undefined {
  if (!style || typeof style !== "object") return undefined;
  const font: Partial<ExcelJS.Font> = {};
  if (typeof style.ff === "string" && style.ff.trim() !== "") font.name = style.ff.trim();
  if (typeof style.fs === "number" && Number.isFinite(style.fs) && style.fs > 0) {
    font.size = Math.min(MAX_FONT_PT, Math.max(MIN_FONT_PT, style.fs));
  }
  if (style.bl === BOOL.TRUE) font.bold = true;
  if (style.it === BOOL.TRUE) font.italic = true;
  const underline = underlineOf(style);
  if (underline !== undefined) font.underline = underline;
  if (style.st?.s === BOOL.TRUE) font.strike = true;
  if (style.va === VA_SUPERSCRIPT) font.vertAlign = "superscript";
  else if (style.va === VA_SUBSCRIPT) font.vertAlign = "subscript";
  const color = colorOf(style.cl);
  if (color) font.color = color;
  return Object.keys(font).length > 0 ? font : undefined;
}

function borderSide(side: Nullable<IBorderStyleData>): Partial<ExcelJS.Border> | undefined {
  if (!side || typeof side !== "object") return undefined;
  const style = EXCEL_BORDER_BY_UNIVER[side.s];
  if (!style) return undefined;
  const color = colorOf(side.cl);
  return color ? { style, color } : { style };
}

export function excelBorderFrom(bd: Nullable<IBorderData>): Partial<ExcelJS.Borders> | undefined {
  if (!bd || typeof bd !== "object") return undefined;
  const border: Partial<ExcelJS.Borders> = {};
  const top = borderSide(bd.t);
  const left = borderSide(bd.l);
  const bottom = borderSide(bd.b);
  const right = borderSide(bd.r);
  if (top) border.top = top;
  if (left) border.left = left;
  if (bottom) border.bottom = bottom;
  if (right) border.right = right;
  const down = borderSide(bd.tl_br);
  const up = borderSide(bd.bl_tr);
  if (down || up) border.diagonal = { ...(down ?? up), up: Boolean(up), down: Boolean(down) };
  return Object.keys(border).length > 0 ? border : undefined;
}

function excelAlignmentFrom(style: IStyleData): Partial<ExcelJS.Alignment> | undefined {
  const alignment: Partial<ExcelJS.Alignment> = {};
  const horizontal = typeof style.ht === "number" ? H_ALIGN_TO_EXCEL[style.ht] : undefined;
  if (horizontal) alignment.horizontal = horizontal;
  const vertical = typeof style.vt === "number" ? V_ALIGN_TO_EXCEL[style.vt] : undefined;
  if (vertical) alignment.vertical = vertical;
  if (style.tb === WRAP.WRAP) alignment.wrapText = true;
  if (style.stf === BOOL.TRUE) alignment.shrinkToFit = true;
  const tr = style.tr;
  if (tr && typeof tr === "object") {
    if (tr.v === BOOL.TRUE) alignment.textRotation = "vertical";
    else if (typeof tr.a === "number" && Number.isFinite(tr.a) && tr.a !== 0) {
      alignment.textRotation = Math.max(-90, Math.min(90, Math.round(tr.a)));
    }
  }
  const padLeft = style.pd?.l;
  if (typeof padLeft === "number" && padLeft >= INDENT_PX) {
    alignment.indent = Math.min(MAX_INDENT, Math.round(padLeft / INDENT_PX));
  }
  if (style.td === TD_RTL) alignment.readingOrder = "rtl";
  else if (style.td === TD_LTR) alignment.readingOrder = "ltr";
  return Object.keys(alignment).length > 0 ? alignment : undefined;
}

/** A composed Univer cell style → an ExcelJS cell style ({} when it sets nothing Excel keeps). */
export function excelStyleFrom(style: Nullable<IStyleData>): Partial<ExcelJS.Style> {
  if (!style || typeof style !== "object") return {};
  const out: Partial<ExcelJS.Style> = {};
  const font = excelFontFrom(style);
  if (font) out.font = font;
  const fill = colorOf(style.bg);
  if (fill) out.fill = { type: "pattern", pattern: "solid", fgColor: fill };
  const border = excelBorderFrom(style.bd);
  if (border) out.border = border;
  const alignment = excelAlignmentFrom(style);
  if (alignment) out.alignment = alignment;
  const numFmt = normalizeNumFmt(style.n?.pattern);
  if (numFmt) out.numFmt = numFmt;
  return out;
}

/**
 * The differential format of a conditional-formatting highlight. Excel paints a solid dxf fill with its
 * background colour, so the fill carries the colour as both bgColor and fgColor.
 */
export function dxfStyleFrom(style: Nullable<IStyleBase>): Partial<ExcelJS.Style> {
  if (!style || typeof style !== "object") return {};
  const out: Partial<ExcelJS.Style> = {};
  const font = excelFontFrom(style);
  if (font) out.font = font;
  const fill = colorOf(style.bg);
  if (fill) out.fill = { type: "pattern", pattern: "solid", fgColor: fill, bgColor: fill };
  const border = excelBorderFrom(style.bd);
  if (border) out.border = border;
  const numFmt = normalizeNumFmt(style.n?.pattern);
  if (numFmt) out.numFmt = numFmt;
  return out;
}

/** Univer's composeStyles: a shallow merge in which a later layer's key wins. */
export function composeUniverStyles(layers: ReadonlyArray<Nullable<IStyleData>>): IStyleData {
  const out: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;
    for (const [key, value] of Object.entries(layer)) if (value !== undefined) out[key] = value;
  }
  return out as IStyleData;
}

/**
 * Resolves `s` references (a style id of `wb.styles`, or an inline style) and memoizes the ExcelJS style of
 * each layer combination. The returned objects are shared between cells: never mutate them (and never use
 * ExcelJS's per-property cell setters, which would).
 */
export class ExcelStyleCache {
  private readonly styles: Readonly<Record<string, Nullable<IStyleData>>>;
  private readonly cache = new Map<string, Partial<ExcelJS.Style>>();
  private readonly inlineIds = new WeakMap<object, number>();
  private nextInline = 1;

  constructor(styles: Nullable<Record<string, Nullable<IStyleData>>>) {
    this.styles = styles && typeof styles === "object" ? styles : {};
  }

  /** The Univer style `s` points at, or null. */
  resolve(s: unknown): IStyleData | null {
    if (typeof s === "string") {
      const style = Object.hasOwn(this.styles, s) ? this.styles[s] : null;
      return style && typeof style === "object" ? style : null;
    }
    return s && typeof s === "object" && !Array.isArray(s) ? (s as IStyleData) : null;
  }

  private keyOf(s: unknown): string {
    if (typeof s === "string") return `i${s}`;
    if (!s || typeof s !== "object") return "";
    let id = this.inlineIds.get(s);
    if (id === undefined) {
      id = this.nextInline++;
      this.inlineIds.set(s, id);
    }
    return `o${id}`;
  }

  /** The ExcelJS style of the layers (lowest first); `forceText` adds the "@" (text) format. */
  excel(layers: readonly unknown[], forceText = false): Partial<ExcelJS.Style> {
    const key = `${layers.map((s) => this.keyOf(s)).join("|")}${forceText ? "|@" : ""}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const style = excelStyleFrom(composeUniverStyles(layers.map((s) => this.resolve(s))));
    if (forceText) style.numFmt = "@";
    this.cache.set(key, style);
    return style;
  }
}
