// Excel styles and conditional formats → Univer (sheets.md §11.3.3, §11.3.4; the inverse of export-styles.ts
// and of export-features.ts's conditional formats, which share the dxf mapping). An Excel cell format is
// complete (font, fill, borders, alignment, number format), while Univer stores a style per cell by id in
// `wb.styles`: StyleTable converts each distinct ExcelJS style once (ExcelJS shares one style object between
// every cell of the same format, so the conversion is memoized by object) and deduplicates the results by
// content. Excel's defaults (Calibri 11, automatic text colour, no fill) are left out, so an unformatted cell
// gets no style at all. Protection is dropped: the lease is the access model.

import type * as ExcelJS from "exceljs";
import type {
  BaselineOffset, IBorderData, IBorderStyleData, IRange, IStyleBase, IStyleData, ITextDecoration, TextDecoration, TextDirection,
} from "@univerjs/presets";
import type { IConditionFormattingRule, IConditionalFormattingRuleConfig, IValueConfig } from "@univerjs/preset-sheets-conditional-formatting";
import { newSheetId } from "@/lib/sheets/blank";
import type { SheetLossyItem } from "@/lib/sheets/types";
import {
  BOOL, CF_NUMBER_OP, CF_RULE_TYPE, CF_SUB_TYPE, CF_TEXT_OP, CF_TIME_OP, CF_VALUE_TYPE, H_ALIGN, V_ALIGN, WRAP,
} from "@/lib/sheets/univer-constants";
import { clampRange, parseSqref, toA1Cell } from "./a1";
import { resolveExcelColor } from "./colors";
import { INDENT_PX, UNIVER_BORDER_BY_EXCEL } from "./export-styles";
import { stripFormulaPrefixes } from "./formula-prefix";
import { normalizeNumFmt } from "./number-formats";
import { isRecord, worksheetFeatures, type ExcelColorLike } from "./types";

// Literal mirrors of enum members univer-constants.ts does not carry; the annotations make tsc check them.
const VA_SUBSCRIPT: BaselineOffset.SUBSCRIPT = 2;
const VA_SUPERSCRIPT: BaselineOffset.SUPERSCRIPT = 3;
const TD_LTR: TextDirection.LEFT_TO_RIGHT = 1;
const TD_RTL: TextDirection.RIGHT_TO_LEFT = 2;
const UL_DOUBLE: TextDecoration.DOUBLE = 10;
const UL_SINGLE_ACCOUNTING: TextDecoration.SINGLE_ACCOUNTING = 18;
const UL_DOUBLE_ACCOUNTING: TextDecoration.DOUBLE_ACCOUNTING = 19;

/** Excel's default font: left out of every style (Univer's own default takes its place). */
const DEFAULT_FONT_NAME = "calibri";
const DEFAULT_FONT_SIZE = 11;
const FONT_NAME_MAX = 100;
const MIN_FONT_PT = 1;
const MAX_FONT_PT = 409;
/** Excel's "automatic" text colour: theme 1 (text 1) without a tint, or the system foreground. */
const AUTO_TEXT_THEME = 1;
const SYSTEM_FOREGROUND_INDEX = 64;
const BLACK = "#000000";
/** Linear on any input: fraction digits only after a dot (`\d+\.?\d*` backtracks quadratically). */
const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
/** Conditional formats per sheet and ranges per format (untrusted files could hold millions), formula length. */
const [CF_MAX_RULES, CF_MAX_RANGES, CF_FORMULA_MAX] = [5_000, 1_000, 8_192];

const H_ALIGN_FROM_EXCEL: Readonly<Record<string, IStyleData["ht"]>> = {
  left: H_ALIGN.LEFT,
  center: H_ALIGN.CENTER,
  right: H_ALIGN.RIGHT,
  justify: H_ALIGN.JUSTIFIED,
  distributed: H_ALIGN.DISTRIBUTED,
  fill: H_ALIGN.LEFT,
  centerContinuous: H_ALIGN.CENTER,
};

const V_ALIGN_FROM_EXCEL: Readonly<Record<string, IStyleData["vt"]>> = {
  top: V_ALIGN.TOP,
  middle: V_ALIGN.MIDDLE,
  bottom: V_ALIGN.BOTTOM,
  distributed: V_ALIGN.MIDDLE,
  justify: V_ALIGN.MIDDLE,
};

function own<T>(map: Readonly<Record<string, T>>, key: unknown): T | undefined {
  return typeof key === "string" && Object.hasOwn(map, key) ? map[key] : undefined;
}

function isAutomaticTextColor(color: ExcelColorLike): boolean {
  if (typeof color.argb === "string") return false;
  const untinted = typeof color.tint !== "number" || color.tint === 0;
  return (color.theme === AUTO_TEXT_THEME && untinted) || color.indexed === SYSTEM_FOREGROUND_INDEX;
}

function colorOf(color: unknown): string | null {
  return isRecord(color) ? resolveExcelColor(color as ExcelColorLike) : null;
}

function underlineOf(underline: unknown): ITextDecoration | undefined {
  if (underline === true || underline === "single") return { s: BOOL.TRUE };
  if (underline === "double") return { s: BOOL.TRUE, t: UL_DOUBLE };
  if (underline === "singleAccounting") return { s: BOOL.TRUE, t: UL_SINGLE_ACCOUNTING };
  if (underline === "doubleAccounting") return { s: BOOL.TRUE, t: UL_DOUBLE_ACCOUNTING };
  return undefined;
}

/** A font (a cell's, or a rich-text run's) as Univer style keys; {} when it sets nothing non-default. */
export function fontStyleFrom(font: Partial<ExcelJS.Font> | null | undefined): IStyleBase {
  const out: IStyleBase = {};
  if (!isRecord(font)) return out;
  if (typeof font.name === "string") {
    const name = font.name.trim().slice(0, FONT_NAME_MAX);
    if (name !== "" && name.toLowerCase() !== DEFAULT_FONT_NAME) out.ff = name;
  }
  if (typeof font.size === "number" && Number.isFinite(font.size) && font.size !== DEFAULT_FONT_SIZE) {
    out.fs = Math.min(MAX_FONT_PT, Math.max(MIN_FONT_PT, font.size));
  }
  if (font.bold === true) out.bl = BOOL.TRUE;
  if (font.italic === true) out.it = BOOL.TRUE;
  const underline = underlineOf(font.underline);
  if (underline) out.ul = underline;
  if (font.strike === true) out.st = { s: BOOL.TRUE };
  if (font.vertAlign === "superscript") out.va = VA_SUPERSCRIPT;
  else if (font.vertAlign === "subscript") out.va = VA_SUBSCRIPT;
  if (isRecord(font.color) && !isAutomaticTextColor(font.color as ExcelColorLike)) {
    const rgb = colorOf(font.color);
    if (rgb) out.cl = { rgb };
  }
  return out;
}

/** The colour a fill paints: a pattern's foreground (Excel's "pattern colour" for solid fills), a gradient's first stop. */
function fillColor(fill: unknown, dxf: boolean): string | null {
  if (!isRecord(fill)) return null;
  if (fill.type === "gradient") {
    const stops = fill.stops;
    return Array.isArray(stops) && isRecord(stops[0]) ? colorOf(stops[0].color) : null;
  }
  if (fill.type !== "pattern" || fill.pattern === "none") return null;
  // A differential (conditional-format) solid fill paints its background colour.
  if (dxf) return colorOf(fill.bgColor) ?? colorOf(fill.fgColor);
  return colorOf(fill.fgColor) ?? (fill.pattern === "solid" ? null : colorOf(fill.bgColor));
}

function borderSide(side: unknown): IBorderStyleData | undefined {
  if (!isRecord(side)) return undefined;
  const s = own(UNIVER_BORDER_BY_EXCEL, side.style);
  if (s === undefined) return undefined;
  return { s, cl: { rgb: colorOf(side.color) ?? BLACK } };
}

export function borderStyleFrom(border: unknown): IBorderData | undefined {
  if (!isRecord(border)) return undefined;
  const out: IBorderData = {};
  const top = borderSide(border.top);
  const left = borderSide(border.left);
  const bottom = borderSide(border.bottom);
  const right = borderSide(border.right);
  if (top) out.t = top;
  if (left) out.l = left;
  if (bottom) out.b = bottom;
  if (right) out.r = right;
  const diagonal = border.diagonal;
  const side = borderSide(diagonal);
  if (side && isRecord(diagonal)) {
    if (diagonal.up === true) out.bl_tr = side;
    if (diagonal.down === true) out.tl_br = { ...side };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function alignmentInto(alignment: unknown, out: IStyleData): void {
  if (!isRecord(alignment)) return;
  const ht = own(H_ALIGN_FROM_EXCEL, alignment.horizontal);
  if (ht !== undefined) out.ht = ht;
  const vt = own(V_ALIGN_FROM_EXCEL, alignment.vertical);
  if (vt !== undefined) out.vt = vt;
  if (alignment.wrapText === true) out.tb = WRAP.WRAP;
  if (alignment.shrinkToFit === true) out.stf = BOOL.TRUE;
  const rotation = alignment.textRotation;
  if (rotation === "vertical" || rotation === 255) out.tr = { a: 0, v: BOOL.TRUE };
  else if (typeof rotation === "number" && Number.isFinite(rotation) && rotation !== 0) {
    // ExcelJS reads Excel's 91–180 (clockwise) as -1…-90.
    const a = rotation > 90 ? 90 - rotation : rotation;
    if (a >= -90 && a <= 90) out.tr = { a: Math.round(a) };
  }
  if (typeof alignment.indent === "number" && Number.isFinite(alignment.indent) && alignment.indent > 0) {
    out.pd = { l: Math.round(Math.min(250, alignment.indent)) * INDENT_PX };
  }
  if (alignment.readingOrder === "rtl") out.td = TD_RTL;
  else if (alignment.readingOrder === "ltr") out.td = TD_LTR;
}

/** An ExcelJS cell / row / column style → a Univer style, or null when every property is Excel's default. */
export function styleFromExcel(style: Partial<ExcelJS.Style> | null | undefined): IStyleData | null {
  if (!isRecord(style)) return null;
  const out: IStyleData = { ...fontStyleFrom(style.font) };
  const bg = fillColor(style.fill, false);
  if (bg) out.bg = { rgb: bg };
  const bd = borderStyleFrom(style.border);
  if (bd) out.bd = bd;
  alignmentInto(style.alignment, out);
  const pattern = normalizeNumFmt(typeof style.numFmt === "string" ? style.numFmt : null);
  if (pattern) out.n = { pattern };
  return Object.keys(out).length > 0 ? out : null;
}

/** A conditional-format differential style (font, fill, borders) → the IStyleBase a highlight rule applies. */
export function dxfStyleToUniver(style: unknown): IStyleBase {
  if (!isRecord(style)) return {};
  const out: IStyleBase = { ...fontStyleFrom(isRecord(style.font) ? (style.font as Partial<ExcelJS.Font>) : null) };
  // A dxf states its font colour even when it is "automatic": keep an explicit colour only.
  const bg = fillColor(style.fill, true);
  if (bg) out.bg = { rgb: bg };
  const bd = borderStyleFrom(style.border);
  if (bd) out.bd = bd;
  return out;
}

/** JSON with sorted keys at every level: equal styles give equal keys. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The workbook's `styles` table under construction: "s1", "s2"… one id per distinct style. */
export class StyleTable {
  readonly styles: Record<string, IStyleData> = {};
  private readonly byKey = new Map<string, string>();
  private readonly byExcel = new WeakMap<object, string | null>();

  /** The id of `style` (added on first use), or null for no style. */
  idFor(style: IStyleData | null | undefined): string | null {
    if (!style || Object.keys(style).length === 0) return null;
    const key = canonicalJson(style);
    const hit = this.byKey.get(key);
    if (hit !== undefined) return hit;
    const id = `s${this.byKey.size + 1}`;
    this.byKey.set(key, id);
    this.styles[id] = style;
    return id;
  }

  /** The id of an ExcelJS style object, memoized by object: cells of one format share it. */
  idForExcel(style: Partial<ExcelJS.Style> | null | undefined): string | null {
    if (!isRecord(style)) return null;
    const hit = this.byExcel.get(style);
    if (hit !== undefined) return hit;
    const id = this.idFor(styleFromExcel(style));
    this.byExcel.set(style, id);
    return id;
  }

  /** The style behind an id, for callers that extend it (a date cell without a format). */
  get(id: string | null): IStyleData | null {
    return id !== null && Object.hasOwn(this.styles, id) ? this.styles[id] : null;
  }
}

// ── Conditional formatting ───────────────────────────────────────────────────────────────────────

const CELL_IS: Readonly<Record<string, string>> = {
  equal: CF_NUMBER_OP.equal, notEqual: CF_NUMBER_OP.notEqual, greaterThan: CF_NUMBER_OP.greaterThan,
  greaterThanOrEqual: CF_NUMBER_OP.greaterThanOrEqual, lessThan: CF_NUMBER_OP.lessThan,
  lessThanOrEqual: CF_NUMBER_OP.lessThanOrEqual, between: CF_NUMBER_OP.between, notBetween: CF_NUMBER_OP.notBetween,
};
const CELL_IS_SYMBOL: Readonly<Record<string, string>> = {
  equal: "=", notEqual: "<>", greaterThan: ">", greaterThanOrEqual: ">=", lessThan: "<", lessThanOrEqual: "<=",
};
const TEXT_OPERATORS: ReadonlySet<string> = new Set(["containsBlanks", "notContainsBlanks", "containsErrors", "notContainsErrors"]);
const TIME_PERIODS: ReadonlySet<string> = new Set(Object.values(CF_TIME_OP));
const CFVO_TYPES: Readonly<Record<string, IValueConfig["type"]>> = {
  num: CF_VALUE_TYPE.num, min: CF_VALUE_TYPE.min, max: CF_VALUE_TYPE.max, autoMin: CF_VALUE_TYPE.min,
  autoMax: CF_VALUE_TYPE.max, percent: CF_VALUE_TYPE.percent, percentile: CF_VALUE_TYPE.percentile,
};

function cfvo(value: unknown): IValueConfig | null {
  if (!isRecord(value) || typeof value.type !== "string" || !Object.hasOwn(CFVO_TYPES, value.type)) return null;
  const type = CFVO_TYPES[value.type];
  if (type === CF_VALUE_TYPE.min || type === CF_VALUE_TYPE.max) return { type };
  return typeof value.value === "number" && Number.isFinite(value.value) ? { type, value: value.value } : null;
}

function colorHex(value: unknown): string | null {
  return isRecord(value) ? resolveExcelColor(value as ExcelColorLike) : null;
}

/** A rule's formulas without their prefixes; none when one is longer than Excel allows. */
function formulas(rule: Record<string, unknown>): string[] {
  if (!Array.isArray(rule.formulae)) return [];
  const list = rule.formulae.filter((f): f is string => typeof f === "string" && f.trim() !== "");
  return list.some((f) => f.length > CF_FORMULA_MAX) ? [] : list.map((f) => stripFormulaPrefixes(f.trim()));
}

/** A cellIs rule: a number rule when its bounds are numbers, else the same test as a formula on the top-left cell. */
function cellIsRule(rule: Record<string, unknown>, tl: string): IConditionalFormattingRuleConfig | null {
  const operator = typeof rule.operator === "string" ? rule.operator : "";
  const f = formulas(rule);
  const two = operator === "between" || operator === "notBetween";
  if (!Object.hasOwn(CELL_IS, operator) || f.length < (two ? 2 : 1)) return null;
  const style = dxfStyleToUniver(rule.style);
  if (f.slice(0, two ? 2 : 1).every((x) => NUMBER_RE.test(x) && Number.isFinite(Number(x)))) {
    const nums = f.map(Number);
    const value = two ? [nums[0], nums[1]] : nums[0];
    return { type: CF_RULE_TYPE.highlightCell, subType: CF_SUB_TYPE.number, operator: CELL_IS[operator], value, style } as IConditionalFormattingRuleConfig;
  }
  const expression = two
    ? `${operator === "between" ? "AND" : "OR"}(${tl}${operator === "between" ? ">=" : "<"}MIN(${f[0]},${f[1]}),${tl}${operator === "between" ? "<=" : ">"}MAX(${f[0]},${f[1]}))`
    : `${tl}${CELL_IS_SYMBOL[operator]}${f[0]}`;
  return { type: CF_RULE_TYPE.highlightCell, subType: CF_SUB_TYPE.formula, value: `=${expression}`, style };
}

function cfConfig(rule: Record<string, unknown>, tl: string, lossy: Set<SheetLossyItem>): IConditionalFormattingRuleConfig | null {
  const style = dxfStyleToUniver(rule.style);
  const highlight = { type: CF_RULE_TYPE.highlightCell, style } as const;
  const f = formulas(rule);
  switch (rule.type) {
    case "cellIs":
      return cellIsRule(rule, tl);
    case "expression":
    case "containsText": case "notContainsText": case "beginsWith": case "endsWith":
    case "containsBlanks": case "notContainsBlanks": case "containsErrors": case "notContainsErrors":
      // ExcelJS keeps neither the text nor the operator of a text rule, only its formula: the formula is exact.
      if (f[0]) return { ...highlight, subType: CF_SUB_TYPE.formula, value: `=${f[0]}` };
      return typeof rule.operator === "string" && TEXT_OPERATORS.has(rule.operator)
        ? { ...highlight, subType: CF_SUB_TYPE.text, operator: rule.operator as typeof CF_TEXT_OP.containsBlanks }
        : null;
    case "top10": {
      const rank = Number(rule.rank);
      if (!Number.isFinite(rank) || rank < 1) return null;
      return { ...highlight, subType: CF_SUB_TYPE.rank, isBottom: rule.bottom === true, isPercent: rule.percent === true, value: Math.round(rank) };
    }
    case "aboveAverage":
      return { ...highlight, subType: CF_SUB_TYPE.average, operator: rule.aboveAverage === false ? CF_NUMBER_OP.lessThan : CF_NUMBER_OP.greaterThan };
    case "duplicateValues":
      return { ...highlight, subType: CF_SUB_TYPE.duplicateValues };
    case "uniqueValues":
      return { ...highlight, subType: CF_SUB_TYPE.uniqueValues };
    case "timePeriod":
      return typeof rule.timePeriod === "string" && TIME_PERIODS.has(rule.timePeriod)
        ? { ...highlight, subType: CF_SUB_TYPE.timePeriod, operator: rule.timePeriod as typeof CF_TIME_OP.today }
        : null;
    case "colorScale": {
      const points = Array.isArray(rule.cfvo) ? rule.cfvo.map(cfvo) : [];
      const colors = Array.isArray(rule.color) ? rule.color.map(colorHex) : [];
      if (points.length < 2 || points.length > 3 || points.length !== colors.length || points.includes(null) || colors.includes(null)) return null;
      return { type: CF_RULE_TYPE.colorScale, config: points.map((value, index) => ({ index, color: colors[index] as string, value: value as IValueConfig })) };
    }
    case "dataBar": {
      const [min, max] = Array.isArray(rule.cfvo) ? rule.cfvo.map(cfvo) : [];
      const color = colorHex(rule.color);
      if (!min || !max || !color) return null;
      return {
        type: CF_RULE_TYPE.dataBar, isShowValue: rule.showValue !== false,
        config: { min, max, isGradient: rule.gradient !== false, positiveColor: color, nativeColor: "#ff0000" },
      };
    }
    case "iconSet":
      lossy.add("iconSets");
      return null;
    default:
      return null;
  }
}

/** A sheet's conditional formats, highest priority first (Univer's order); at most CF_MAX_RULES of them. */
export function readConditionalFormats(ws: ExcelJS.Worksheet, lossy: Set<SheetLossyItem>): IConditionFormattingRule[] {
  const entries: Array<{ priority: number; rule: IConditionFormattingRule }> = [];
  for (const cf of worksheetFeatures(ws).conditionalFormattings) {
    if (!isRecord(cf) || typeof cf.ref !== "string" || !Array.isArray(cf.rules)) continue;
    const ranges = parseSqref(cf.ref.slice(0, CF_MAX_RANGES * 24)).slice(0, CF_MAX_RANGES).map(clampRange).filter((r): r is IRange => r !== null);
    if (ranges.length === 0) continue;
    const tl = toA1Cell(ranges[0].startRow, ranges[0].startColumn);
    for (const raw of cf.rules as unknown[]) {
      if (entries.length >= CF_MAX_RULES) break;
      if (!isRecord(raw)) continue;
      const config = cfConfig(raw, tl, lossy);
      if (!config) continue;
      const priority = typeof raw.priority === "number" ? raw.priority : Number.MAX_SAFE_INTEGER;
      entries.push({ priority, rule: { cfId: newSheetId().slice(1), ranges, stopIfTrue: raw.stopIfTrue === true, rule: config } });
    }
  }
  return entries.sort((a, b) => a.priority - b.priority).map((entry) => entry.rule);
}
