// ExcelJS cells → Univer cells (sheets.md §11.3.2). Values keep their Excel type (numbers, text, booleans as
// 1 | 0, dates as serial numbers with a date format, errors as their text); formulas keep their cached
// result and lose the file format's `_xlfn.` prefixes (formula-prefix.ts); rich text becomes a cell document.
// Hyperlinks do not come from ExcelJS: the prescan strips <hyperlinks> (ExcelJS keeps neither in-workbook
// locations nor tooltips) and reads them itself, so a link arrives here already sanitized, by cell.
//
// Rows and cells are read from ExcelJS's own arrays: its eachRow / eachCell either skip style-only rows and
// cells or create an object for every gap (a single cell in column XFD would create 16,384). Those arrays are
// sparse and the file sets their length, so they are walked by the keys present, never index by index.

import type * as ExcelJS from "exceljs";
import type { FormulaType, ICellData, IDocumentData, IParagraph, IStyleBase, ITextRun } from "@univerjs/presets";
import { BOOL, CELL_TYPE, CUSTOM_RANGE_HYPERLINK } from "@/lib/sheets/univer-constants";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS } from "./a1";
import { stripFormulaPrefixes } from "./formula-prefix";
import { fontStyleFrom, type StyleTable } from "./import-styles";
import { DEFAULT_DATE_FORMAT } from "./number-formats";
import { isRecord } from "./types";
import { excelSerialFromDate } from "./units";

/** Excel's limit on the characters of one cell (also Univer's practical one), and on a formula's. */
export const CELL_TEXT_MAX_CHARS = 32_767;
const FORMULA_MAX_CHARS = 8_192;
/** Styled runs kept per rich-text cell; the text itself is always kept whole. */
const RUNS_MAX = 2_000;
const FT_ARRAY: FormulaType.ARRAY = 2;
const VT_MERGE: ExcelJS.ValueType.Merge = 1;
const NUMERIC_TEXT_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const LINE_BREAK_RE = /\r\n?|\n/g;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A cell's hyperlink, already sanitized to a Univer link. */
export interface SheetCellLink {
  url: string;
  tooltip: string;
}

export interface CellImportContext {
  date1904: boolean;
  styles: StyleTable;
  /** This sheet's links by `row:col` (0-based). */
  links: ReadonlyMap<string, SheetCellLink>;
  lossy: Set<SheetLossyItem>;
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/** A short random id (rich-text range ids). */
export function randomId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/** A paragraph id as Univer mints them ("para_" + 12 random characters). */
function paragraphId(): string {
  return `para_${randomId(12)}`;
}

/** Cuts at `max` UTF-16 units without splitting a surrogate pair. */
export function clampCellText(text: string, max = CELL_TEXT_MAX_CHARS): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

// ── ExcelJS internals (4.4.0, lib/doc/worksheet.js and row.js) ───────────────────────────────────

/**
 * Visits the entries of a sparse array at indexes below `limit`, in index order, in time proportional to the
 * entries present. Array.prototype.forEach visits every index up to the length, which the file decides:
 * `<row r="4294967294">` gives ExcelJS a rows array of length 2^32 - 2 (a minute of looping for one row).
 */
function forEachPresent<T>(list: unknown, limit: number, visit: (value: T, index: number) => void): void {
  if (!Array.isArray(list)) return;
  const items = list as unknown[];
  for (const key of Object.keys(items)) {
    // Array indexes come first, ascending; a row without a usable number sits at a key such as "NaN" or "-1".
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= limit || String(index) !== key) continue;
    const value = items[index];
    if (value) visit(value as T, index);
  }
}

/** Visits the worksheet's rows inside the grid (ExcelJS's `_rows`, index = row number - 1). */
export function forEachSheetRow(ws: ExcelJS.Worksheet, visit: (row: ExcelJS.Row, r: number) => void): void {
  forEachPresent((ws as unknown as { _rows?: unknown })._rows, EXCEL_MAX_ROWS, visit);
}

/** Visits a row's cells inside the grid (ExcelJS's `_cells`, index = column number - 1). */
export function forEachRowCell(row: ExcelJS.Row, visit: (cell: ExcelJS.Cell, c: number) => void): void {
  forEachPresent((row as unknown as { _cells?: unknown })._cells, EXCEL_MAX_COLUMNS, visit);
}

// ── Values ───────────────────────────────────────────────────────────────────────────────────────

function isDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

type Scalar = Pick<ICellData, "v" | "t">;

/** A cached formula result, or a plain value, as `{ v, t }`; {} when there is none. */
function scalarOf(value: unknown, date1904: boolean): Scalar & { date?: boolean } {
  if (typeof value === "number") return Number.isFinite(value) ? { v: value, t: CELL_TYPE.NUMBER } : {};
  if (typeof value === "string") return { v: clampCellText(value), t: CELL_TYPE.STRING };
  if (typeof value === "boolean") return { v: value ? BOOL.TRUE : BOOL.FALSE, t: CELL_TYPE.BOOLEAN };
  if (isDate(value)) return { v: excelSerialFromDate(value, date1904), t: CELL_TYPE.NUMBER, date: true };
  if (isRecord(value) && typeof value.error === "string") return { v: clampCellText(value.error, 64), t: CELL_TYPE.STRING };
  return {};
}

interface RunPiece {
  text: string;
  ts?: IStyleBase;
}

/**
 * A cell document for `pieces` (text runs, each with its own style): Excel line breaks become Univer
 * paragraph marks, the text ends with "\r\n", and `link` spans the whole text when given.
 */
export function cellDocument(pieces: readonly RunPiece[], link?: SheetCellLink): { doc: IDocumentData; plain: string } | null {
  let text = "";
  let plain = "";
  const textRuns: ITextRun[] = [];
  for (const piece of pieces) {
    const room = CELL_TEXT_MAX_CHARS - plain.length;
    if (room <= 0) break;
    const raw = clampCellText(piece.text, room);
    plain += raw;
    const converted = raw.replace(LINE_BREAK_RE, "\r");
    if (converted === "") continue;
    if (piece.ts && Object.keys(piece.ts).length > 0 && textRuns.length < RUNS_MAX) {
      textRuns.push({ st: text.length, ed: text.length + converted.length, ts: piece.ts });
    }
    text += converted;
  }
  if (text === "") return null;
  const paragraphs: IParagraph[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "\r") paragraphs.push({ startIndex: i, paragraphId: paragraphId() });
  paragraphs.push({ startIndex: text.length, paragraphId: paragraphId() });
  const body: NonNullable<IDocumentData["body"]> = { dataStream: `${text}\r\n`, textRuns, paragraphs };
  if (link) {
    const properties: Record<string, string> = { url: link.url };
    if (link.tooltip !== "") properties.tooltip = link.tooltip;
    body.customRanges = [
      { startIndex: 0, endIndex: text.length - 1, rangeType: CUSTOM_RANGE_HYPERLINK, rangeId: randomId(), properties },
    ];
  }
  return { doc: { id: "d", documentStyle: {}, body }, plain };
}

function richPieces(value: unknown): RunPiece[] | null {
  if (!isRecord(value) || !Array.isArray(value.richText)) return null;
  const pieces: RunPiece[] = [];
  for (const run of value.richText) {
    if (!isRecord(run) || typeof run.text !== "string") continue;
    const ts = isRecord(run.font) ? fontStyleFrom(run.font as Partial<ExcelJS.Font>) : undefined;
    pieces.push(ts ? { text: run.text, ts } : { text: run.text });
  }
  return pieces;
}

function isFormulaValue(value: unknown): value is { formula?: string; sharedFormula?: string; shareType?: string; ref?: string } {
  return isRecord(value) && (typeof value.formula === "string" || typeof value.sharedFormula === "string");
}

/** The Univer data of the cell's value (no style); null for an empty cell. */
function valueData(cell: ExcelJS.Cell, ctx: CellImportContext): (ICellData & { date?: boolean }) | null {
  const value: unknown = cell.value;
  if (value === null || value === undefined) return null;
  if (isFormulaValue(value)) {
    // `cell.formula` is a shared-formula follower's formula, translated to its own address.
    const formula = typeof cell.formula === "string" ? cell.formula.trim().replace(/^=/, "") : "";
    const result = scalarOf(cell.result, ctx.date1904);
    // No formula (a follower whose master is missing) or one longer than Excel allows: the cached value only.
    if (formula === "" || formula.length > FORMULA_MAX_CHARS) return result.v === undefined ? null : result;
    const out: ICellData & { date?: boolean } = { f: `=${stripFormulaPrefixes(formula)}`, ...result };
    if (value.shareType === "array" && typeof value.ref === "string" && value.ref !== "") {
      out.ft = FT_ARRAY;
      out.ref = value.ref;
      ctx.lossy.add("arrayFormulas");
    }
    return out;
  }
  const pieces = richPieces(value);
  if (pieces) {
    const rich = cellDocument(pieces);
    return rich ? { v: rich.plain, t: CELL_TYPE.STRING, p: rich.doc } : null;
  }
  if (isRecord(value) && "hyperlink" in value) {
    // ExcelJS never reads <hyperlinks> here (the prescan strips them); keep the text, not the link.
    const text = value.text;
    const textPieces = richPieces(text);
    if (textPieces) {
      const rich = cellDocument(textPieces);
      return rich ? { v: rich.plain, t: CELL_TYPE.STRING, p: rich.doc } : null;
    }
    return typeof text === "string" && text !== "" ? { v: clampCellText(text), t: CELL_TYPE.STRING } : null;
  }
  const scalar = scalarOf(value, ctx.date1904);
  if (scalar.v === undefined) return null;
  if (scalar.t === CELL_TYPE.STRING && cell.style?.numFmt === "@" && NUMERIC_TEXT_RE.test(String(scalar.v).trim())) {
    return { v: scalar.v, t: CELL_TYPE.FORCE_STRING };
  }
  return scalar;
}

/** The text a link is drawn on: the rich text, else the value as the cell shows it unformatted. */
function linkText(data: ICellData): string {
  const stream = data.p?.body?.dataStream;
  if (typeof stream === "string") return stream.replace(/\r\n$/, "").replace(/\r/g, "\n");
  if (data.t === CELL_TYPE.BOOLEAN) return data.v === BOOL.TRUE ? "TRUE" : "FALSE";
  return data.v === null || data.v === undefined ? "" : String(data.v);
}

function withLink(data: ICellData, link: SheetCellLink): ICellData {
  // A formula keeps its formula: Univer draws a formula's result, never a document.
  if (typeof data.f === "string" && data.f !== "") return data;
  const text = linkText(data);
  if (text === "") return data;
  const runs = data.p?.body?.textRuns ?? [];
  const pieces: RunPiece[] = runs.length > 0 && data.p?.body
    ? splitRuns(data.p.body.dataStream.replace(/\r\n$/, ""), runs)
    : [{ text }];
  const rich = cellDocument(pieces, link);
  return rich ? { ...data, p: rich.doc } : data;
}

/** A document's text cut back into styled pieces (paragraph marks become line breaks again). */
function splitRuns(stream: string, runs: readonly ITextRun[]): RunPiece[] {
  const pieces: RunPiece[] = [];
  let pos = 0;
  const text = (from: number, to: number) => stream.slice(from, to).replace(/\r/g, "\n");
  for (const run of runs) {
    if (run.st > pos) pieces.push({ text: text(pos, run.st) });
    pieces.push(run.ts ? { text: text(run.st, run.ed), ts: run.ts } : { text: text(run.st, run.ed) });
    pos = Math.max(pos, run.ed);
  }
  if (pos < stream.length) pieces.push({ text: text(pos, stream.length) });
  return pieces;
}

/**
 * One ExcelJS cell at (row, col), 0-based, as Univer cell data; null when it holds neither a value nor a
 * style. A merged non-master cell keeps its style only. Dates get "yyyy-mm-dd" when their format says nothing.
 */
export function importCell(cell: ExcelJS.Cell, row: number, col: number, ctx: CellImportContext): ICellData | null {
  let styleId = ctx.styles.idForExcel(cell.style);
  if (cell.type === VT_MERGE) return styleId ? { s: styleId } : null;
  const valued = valueData(cell, ctx);
  let data: ICellData | null = null;
  if (valued) {
    const { date, ...rest } = valued;
    data = rest;
    if (date && !ctx.styles.get(styleId)?.n) {
      styleId = ctx.styles.idFor({ ...(ctx.styles.get(styleId) ?? {}), n: { pattern: DEFAULT_DATE_FORMAT } });
    }
    const link = ctx.links.get(cellKey(row, col));
    if (link) data = withLink(data, link);
  }
  if (styleId) data = { ...(data ?? {}), s: styleId };
  return data;
}
