// Univer sheet rules → ExcelJS (sheets.md §11.4): data validation and conditional formatting. (Notes are
// written with the cells, export-cells.ts; the filter range, merges and defined names by export-workbook.ts.)
// Every resource is untrusted parsed JSON, so each rule is narrowed field by field; a rule Excel cannot
// express is skipped and, where §11.8 has an item for it, reported as lossy.

import type * as ExcelJS from "exceljs";
import type { IRange, IStyleBase } from "@univerjs/presets";
import type { SheetLossyItem } from "@/lib/sheets/types";
import {
  CF_NUMBER_OP, CF_RULE_TYPE, CF_SUB_TYPE, CF_TEXT_OP, CF_TIME_OP, CF_VALUE_TYPE, DV_ERROR_STYLE, DV_OPERATOR, DV_TYPE,
} from "@/lib/sheets/univer-constants";
import { clampRange, toA1Cell, toA1Range } from "./a1";
import { hexToArgb } from "./colors";
import { dxfStyleFrom } from "./export-styles";
import { addFormulaPrefixes } from "./formula-prefix";
import { excelSerialFromDate } from "./units";
import {
  addConditionalFormatting, isRecord, worksheetFeatures,
  type ExcelCellIsOperator, type ExcelCfRule, type ExcelCfvo, type ExcelDataValidation,
} from "./types";

export interface FeatureContext {
  date1904: boolean;
  lossy: Set<SheetLossyItem>;
}

/** Excel's limits on validation texts and on a literal list. */
const DV_PROMPT_MAX = 255;
const DV_ERROR_MAX = 225;
const DV_TITLE_MAX = 32;
const DV_LIST_MAX_CHARS = 255;
const ISO_DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const MS_PER_DAY = 86_400_000;
const EXCELJS_DATE_EPOCH = 25_569;

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value !== "" ? value.slice(0, max) : undefined;
}

/** A rule's ranges clamped to the grid (unusable ones dropped). */
export function ruleRanges(ranges: unknown): IRange[] {
  if (!Array.isArray(ranges)) return [];
  const out: IRange[] = [];
  for (const range of ranges) {
    const clamped = clampRange(isRecord(range) ? (range as Partial<IRange>) : null);
    if (clamped) out.push(clamped);
  }
  return out;
}

/** A formula operand without its "=" and with its future-function prefixes, or a literal as text; null when empty. */
function operand(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const formula = trimmed.startsWith("=") ? trimmed.slice(1).trim() : trimmed;
  return formula === "" ? null : addFormulaPrefixes(formula);
}

// ── Data validation ──────────────────────────────────────────────────────────────────────────────

/** Univer's list formula: a JSON array of strings (serializeListOptions) or legacy comma-separated text. */
function listOptions(formula: string): string[] {
  try {
    const parsed: unknown = JSON.parse(formula);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed.filter(Boolean);
  } catch {
    // the legacy form
  }
  return formula.split(",").map((item) => item.trim()).filter(Boolean);
}

/** A literal Excel list ("a,b,c" in quotes), or null when Excel cannot hold it. */
function excelList(items: string[]): string | null {
  if (items.length === 0 || items.some((item) => item.includes(","))) return null;
  const body = items.map((item) => item.replace(/"/g, '""')).join(",");
  return body.length <= DV_LIST_MAX_CHARS ? `"${body}"` : null;
}

function listFormula(formula1: unknown): string | null {
  if (typeof formula1 !== "string" || formula1.trim() === "") return null;
  const value = formula1.trim();
  return value.startsWith("=") ? operand(value) : excelList(listOptions(value));
}

/** A checkbox becomes a two-item list of its checked and unchecked values (TRUE / FALSE by default). */
function checkboxFormula(formula1: unknown, formula2: unknown): string | null {
  const item = (value: unknown, fallback: string) => {
    const s = value === undefined || value === null ? "" : String(value).trim();
    if (s === "") return fallback;
    if (s === "1" || s.toUpperCase() === "TRUE") return "TRUE";
    return s === "0" || s.toUpperCase() === "FALSE" ? "FALSE" : s;
  };
  return excelList([item(formula1, "TRUE"), item(formula2, "FALSE")]);
}

/**
 * The text ExcelJS's writer turns into `serial`: it writes dateToExcel(new Date(formula)) in the 1900 system
 * whatever the workbook uses, so the serial is carried literally. An ISO string rather than a Date, because
 * the writer merges adjacent single-cell rules by comparing them, and it sees every two Dates as equal.
 */
function dateForSerial(serial: number): string | null {
  const date = new Date((serial - EXCELJS_DATE_EPOCH) * MS_PER_DAY);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** A date operand: a serial number or ISO-like date text. A formula cannot be written as a date: null. */
function dateOperand(value: unknown, date1904: boolean): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? dateForSerial(value) : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.startsWith("=")) return null;
  if (Number.isFinite(Number(trimmed))) return dateForSerial(Number(trimmed));
  const m = ISO_DATE_RE.exec(trimmed);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return dateForSerial(excelSerialFromDate(utc, date1904));
}

/** A time operand as a day fraction ("0.5"), or a formula / number; null when unreadable. */
function timeOperand(value: unknown): string | null {
  const m = typeof value === "string" ? TIME_RE.exec(value.trim()) : null;
  if (!m) return operand(value);
  const [h, min, s] = m.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  return h < 24 && min < 60 && s < 60 ? String((h * 3600 + min * 60 + s) / 86_400) : null;
}

const TWO_OPERANDS: ReadonlySet<unknown> = new Set([DV_OPERATOR.BETWEEN, DV_OPERATOR.NOT_BETWEEN]);
const DV_OPERATORS: ReadonlySet<unknown> = new Set(Object.values(DV_OPERATOR));
const ALERT_STYLES: ReadonlySet<unknown> = new Set([DV_ERROR_STYLE.STOP, DV_ERROR_STYLE.WARNING, DV_ERROR_STYLE.INFO]);

type DvShape = Pick<ExcelDataValidation, "type" | "formulae" | "operator">;

function comparison(rule: Record<string, unknown>, type: ExcelDataValidation["type"], read: (v: unknown) => string | null): DvShape | null {
  // DataValidationOperator values are Excel's operator names.
  const operator = DV_OPERATORS.has(rule.operator) ? (rule.operator as ExcelJS.DataValidationOperator) : "between";
  const first = read(rule.formula1);
  if (first === null) return null;
  if (!TWO_OPERANDS.has(operator)) return { type, operator, formulae: [first] };
  const second = read(rule.formula2);
  return second === null ? null : { type, operator, formulae: [first, second] };
}

function validationShape(rule: Record<string, unknown>, ctx: FeatureContext): DvShape | null {
  const list = (formula: string | null): DvShape | null => (formula ? { type: "list", formulae: [formula] } : null);
  switch (rule.type) {
    case DV_TYPE.LIST:
    case DV_TYPE.LIST_MULTIPLE:
      return list(listFormula(rule.formula1));
    case DV_TYPE.CHECKBOX:
      return list(checkboxFormula(rule.formula1, rule.formula2));
    case DV_TYPE.WHOLE:
      return comparison(rule, "whole", operand);
    case DV_TYPE.DECIMAL:
      return comparison(rule, "decimal", operand);
    case DV_TYPE.TEXT_LENGTH:
      return comparison(rule, "textLength", operand);
    case DV_TYPE.DATE:
      return comparison(rule, "date", (value) => dateOperand(value, ctx.date1904));
    case DV_TYPE.TIME:
      return comparison(rule, "time", timeOperand);
    case DV_TYPE.CUSTOM: {
      const formula = operand(rule.formula1);
      return formula ? { type: "custom", formulae: [formula] } : null;
    }
    default:
      return null;
  }
}

/** One Univer validation rule → an ExcelJS rule; null when it checks nothing or Excel cannot express it. */
export function excelValidationFrom(rule: Record<string, unknown>, ctx: FeatureContext): ExcelDataValidation | null {
  const shape = validationShape(rule, ctx);
  if (!shape) {
    if (rule.type !== DV_TYPE.ANY && rule.type !== DV_TYPE.NONE) ctx.lossy.add("unsupportedValidation");
    return null;
  }
  // Univer's validator lets blanks through unless allowBlank is set falsy (`{ allowBlank = true } = rule`).
  const dv: ExcelDataValidation = { ...shape, allowBlank: rule.allowBlank === undefined || Boolean(rule.allowBlank) };
  const style = rule.errorStyle;
  // Univer rejects input only under an alert style whose message is not switched off; with none it only marks.
  if (rule.showErrorMessage !== false && ALERT_STYLES.has(style)) dv.showErrorMessage = true;
  if (style === DV_ERROR_STYLE.WARNING) dv.errorStyle = "warning";
  else if (style === DV_ERROR_STYLE.INFO) dv.errorStyle = "information";
  const error = text(rule.error, DV_ERROR_MAX);
  if (error) dv.error = error;
  const errorTitle = text(rule.errorTitle, DV_TITLE_MAX);
  if (errorTitle) dv.errorTitle = errorTitle;
  if (rule.showInputMessage === true) dv.showInputMessage = true;
  const prompt = text(rule.prompt, DV_PROMPT_MAX);
  if (prompt) dv.prompt = prompt;
  const promptTitle = text(rule.promptTitle, DV_TITLE_MAX);
  if (promptTitle) dv.promptTitle = promptTitle;
  return dv;
}

/** A sheet's validation rules: one ExcelJS entry, so one sqref, per rule range. */
export function writeDataValidations(ws: ExcelJS.Worksheet, rules: unknown, ctx: FeatureContext): void {
  if (!Array.isArray(rules)) return;
  const { dataValidations } = worksheetFeatures(ws);
  for (const rule of rules) {
    if (!isRecord(rule)) continue;
    const dv = excelValidationFrom(rule, ctx);
    if (!dv) continue;
    for (const range of ruleRanges(rule.ranges)) dataValidations.add(toA1Range(range), { ...dv, formulae: [...dv.formulae] });
  }
}

// ── Conditional formatting ───────────────────────────────────────────────────────────────────────

interface CfTarget {
  /** The first range's top-left cell: relative references in a rule formula are relative to it. */
  tl: string;
  /** Every range, absolute. */
  abs: string[];
  priority: number;
  style: Partial<ExcelJS.Style> | undefined;
}

const COMPARE_SYMBOL: Readonly<Record<string, string>> = {
  [CF_NUMBER_OP.greaterThan]: ">", [CF_NUMBER_OP.greaterThanOrEqual]: ">=", [CF_NUMBER_OP.lessThan]: "<",
  [CF_NUMBER_OP.lessThanOrEqual]: "<=", [CF_NUMBER_OP.equal]: "=", [CF_NUMBER_OP.notEqual]: "<>",
};

/** CFNumberOperator → the `cellIs` operator of the same name. */
const CELL_IS_OPERATOR: Readonly<Record<string, ExcelCellIsOperator>> = {
  [CF_NUMBER_OP.greaterThan]: "greaterThan", [CF_NUMBER_OP.greaterThanOrEqual]: "greaterThanOrEqual",
  [CF_NUMBER_OP.lessThan]: "lessThan", [CF_NUMBER_OP.lessThanOrEqual]: "lessThanOrEqual",
  [CF_NUMBER_OP.equal]: "equal", [CF_NUMBER_OP.notEqual]: "notEqual",
  [CF_NUMBER_OP.between]: "between", [CF_NUMBER_OP.notBetween]: "notBetween",
};

/** CFValueType → the threshold type of the same name. */
const CFVO_TYPE: Readonly<Record<string, ExcelJS.CfvoTypes>> = {
  [CF_VALUE_TYPE.num]: "num", [CF_VALUE_TYPE.min]: "min", [CF_VALUE_TYPE.max]: "max",
  [CF_VALUE_TYPE.percent]: "percent", [CF_VALUE_TYPE.percentile]: "percentile", [CF_VALUE_TYPE.formula]: "formula",
};

function lookup<T>(map: Readonly<Record<string, T>>, key: unknown): T | undefined {
  return typeof key === "string" && Object.hasOwn(map, key) ? map[key] : undefined;
}

/** Excel's own time-period formulas (as ExcelJS writes them), for a top-left cell. */
const TIME_PERIOD_FORMULA: Readonly<Record<string, (tl: string) => string>> = {
  [CF_TIME_OP.today]: (tl) => `FLOOR(${tl},1)=TODAY()`,
  [CF_TIME_OP.yesterday]: (tl) => `FLOOR(${tl},1)=TODAY()-1`,
  [CF_TIME_OP.tomorrow]: (tl) => `FLOOR(${tl},1)=TODAY()+1`,
  [CF_TIME_OP.last7Days]: (tl) => `AND(TODAY()-FLOOR(${tl},1)<=6,FLOOR(${tl},1)<=TODAY())`,
  [CF_TIME_OP.thisWeek]: (tl) => `AND(TODAY()-ROUNDDOWN(${tl},0)<=WEEKDAY(TODAY())-1,ROUNDDOWN(${tl},0)-TODAY()<=7-WEEKDAY(TODAY()))`,
  [CF_TIME_OP.lastWeek]: (tl) => `AND(TODAY()-ROUNDDOWN(${tl},0)>=(WEEKDAY(TODAY())),TODAY()-ROUNDDOWN(${tl},0)<(WEEKDAY(TODAY())+7))`,
  [CF_TIME_OP.nextWeek]: (tl) => `AND(ROUNDDOWN(${tl},0)-TODAY()>(7-WEEKDAY(TODAY())),ROUNDDOWN(${tl},0)-TODAY()<(15-WEEKDAY(TODAY())))`,
  [CF_TIME_OP.thisMonth]: (tl) => `AND(MONTH(${tl})=MONTH(TODAY()),YEAR(${tl})=YEAR(TODAY()))`,
  [CF_TIME_OP.lastMonth]: (tl) => `AND(MONTH(${tl})=MONTH(EDATE(TODAY(),0-1)),YEAR(${tl})=YEAR(EDATE(TODAY(),0-1)))`,
  [CF_TIME_OP.nextMonth]: (tl) => `AND(MONTH(${tl})=MONTH(EDATE(TODAY(),0+1)),YEAR(${tl})=YEAR(EDATE(TODAY(),0+1)))`,
};

function quoted(value: unknown): string {
  const s = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function textFormula(operator: unknown, value: unknown, tl: string): string | null {
  const q = quoted(value);
  switch (operator) {
    case CF_TEXT_OP.containsText: return `NOT(ISERROR(SEARCH(${q},${tl})))`;
    case CF_TEXT_OP.notContainsText: return `ISERROR(SEARCH(${q},${tl}))`;
    case CF_TEXT_OP.beginsWith: return `LEFT(${tl},LEN(${q}))=${q}`;
    case CF_TEXT_OP.endsWith: return `RIGHT(${tl},LEN(${q}))=${q}`;
    case CF_TEXT_OP.equal: return `${tl}=${q}`;
    case CF_TEXT_OP.notEqual: return `${tl}<>${q}`;
    case CF_TEXT_OP.containsBlanks: return `LEN(TRIM(${tl}))=0`;
    case CF_TEXT_OP.notContainsBlanks: return `LEN(TRIM(${tl}))>0`;
    case CF_TEXT_OP.containsErrors: return `ISERROR(${tl})`;
    case CF_TEXT_OP.notContainsErrors: return `NOT(ISERROR(${tl}))`;
    default: return null;
  }
}

function highlightRule(rule: Record<string, unknown>, t: CfTarget): ExcelCfRule | null {
  const base = { priority: t.priority, ...(t.style ? { style: t.style } : {}) };
  const expression = (formula: string | null): ExcelCfRule | null =>
    formula ? { type: "expression", formulae: [formula], ...base } : null;
  switch (rule.subType) {
    case CF_SUB_TYPE.text:
      // ExcelJS writes a containsText rule without its operator and text attributes: an expression is exact.
      return expression(textFormula(rule.operator, rule.value, t.tl));
    case CF_SUB_TYPE.number: {
      const operator = lookup(CELL_IS_OPERATOR, rule.operator);
      if (!operator) return null;
      const values = operator === "between" || operator === "notBetween"
        ? (Array.isArray(rule.value) && rule.value.length === 2 ? rule.value.map(operand) : [null])
        : [operand(rule.value)];
      if (values.some((v) => v === null)) return null;
      return { type: "cellIs", operator, formulae: values as string[], ...base };
    }
    case CF_SUB_TYPE.average: {
      if (rule.operator === CF_NUMBER_OP.greaterThan) return { type: "aboveAverage", aboveAverage: true, ...base };
      if (rule.operator === CF_NUMBER_OP.lessThan) return { type: "aboveAverage", aboveAverage: false, ...base };
      const symbol = lookup(COMPARE_SYMBOL, rule.operator);
      return expression(symbol ? `${t.tl}${symbol}AVERAGE(${t.abs.join(",")})` : null);
    }
    case CF_SUB_TYPE.rank: {
      const percent = rule.isPercent === true;
      const rank = Math.round(Number(rule.value));
      if (!Number.isFinite(rank) || rank < 1) return null;
      return { type: "top10", rank: Math.min(rank, percent ? 100 : 1000), percent, bottom: rule.isBottom === true, ...base };
    }
    case CF_SUB_TYPE.uniqueValues:
    case CF_SUB_TYPE.duplicateValues: {
      const counts = t.abs.map((range) => `COUNTIF(${range},${t.tl})`);
      const count = counts.length === 1 ? counts[0] : `(${counts.join("+")})`;
      return expression(`${count}${rule.subType === CF_SUB_TYPE.uniqueValues ? "=1" : ">1"}`);
    }
    case CF_SUB_TYPE.timePeriod: {
      const formula = lookup(TIME_PERIOD_FORMULA, rule.operator);
      if (!formula) return null;
      return { type: "timePeriod", timePeriod: rule.operator as ExcelJS.TimePeriodTypes, formulae: [formula(t.tl)], ...base };
    }
    case CF_SUB_TYPE.formula:
      return expression(operand(rule.value));
    default:
      return null;
  }
}

function cfvoFrom(value: unknown): ExcelCfvo | null {
  if (!isRecord(value)) return null;
  const type = lookup(CFVO_TYPE, value.type);
  if (type === undefined) return null;
  if (type === "min" || type === "max") return { type };
  if (type === "formula") {
    const formula = operand(value.value);
    return formula ? { type, value: formula } : null;
  }
  const n = Number(value.value);
  return Number.isFinite(n) ? { type, value: n } : null;
}

/** One Univer rule config → an ExcelJS rule; null when it cannot be written. */
export function excelCfRuleFrom(rule: Record<string, unknown>, target: CfTarget): ExcelCfRule | null {
  if (rule.type === CF_RULE_TYPE.highlightCell) return highlightRule(rule, target);
  if (rule.type === CF_RULE_TYPE.dataBar) {
    const config = isRecord(rule.config) ? rule.config : {};
    const min = cfvoFrom(config.min);
    const max = cfvoFrom(config.max);
    const argb = hexToArgb(typeof config.positiveColor === "string" ? config.positiveColor : null);
    if (!min || !max || !argb) return null;
    // Always solid: ExcelJS links a gradient bar to an x14 extension it never writes (an empty x14:id).
    return { type: "dataBar", priority: target.priority, cfvo: [min, max], color: { argb }, gradient: false, showValue: rule.isShowValue !== false };
  }
  if (rule.type === CF_RULE_TYPE.colorScale) {
    const points = (Array.isArray(rule.config) ? rule.config : []).filter(isRecord)
      .sort((a, b) => Number(a.index) - Number(b.index));
    const cfvo = points.map((point) => cfvoFrom(point.value));
    const colors = points.map((point) => hexToArgb(typeof point.color === "string" ? point.color : null));
    if (points.length < 2 || points.length > 3 || cfvo.includes(null) || colors.includes(null)) return null;
    return {
      type: "colorScale", priority: target.priority,
      cfvo: cfvo as ExcelCfvo[], color: (colors as string[]).map((argb) => ({ argb })),
    };
  }
  return null;
}

/** A sheet's conditional formats, in Univer's order (the first is the highest priority). Icon sets are lossy. */
export function writeConditionalFormats(ws: ExcelJS.Worksheet, rules: unknown, ctx: FeatureContext): void {
  if (!Array.isArray(rules)) return;
  let priority = 1;
  for (const entry of rules) {
    if (!isRecord(entry) || !isRecord(entry.rule)) continue;
    if (entry.rule.type === CF_RULE_TYPE.iconSet) {
      ctx.lossy.add("iconSets");
      continue;
    }
    const ranges = ruleRanges(entry.ranges);
    if (ranges.length === 0) continue;
    const style = isRecord(entry.rule.style) ? dxfStyleFrom(entry.rule.style as IStyleBase) : {};
    const target: CfTarget = {
      tl: toA1Cell(ranges[0].startRow, ranges[0].startColumn),
      abs: ranges.map((range) => toA1Range(range, true)),
      priority,
      style: Object.keys(style).length > 0 ? style : undefined,
    };
    const rule = excelCfRuleFrom(entry.rule, target);
    if (!rule) continue;
    addConditionalFormatting(ws, { ref: ranges.map((range) => toA1Range(range)).join(" "), rules: [rule] });
    priority++;
  }
}
