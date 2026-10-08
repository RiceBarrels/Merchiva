// Univer cells → ExcelJS cells (sheets.md §11.4). The input comes from adapter.saveForExport(), so every
// formula is materialized in `f` (no shared formulas are written) and gets the file format's future-function
// prefixes (formula-prefix.ts). Values keep their Univer type; rich text
// keeps its runs as Excel rich text; a cell's first writable hyperlink becomes an Excel hyperlink (Excel
// links a whole cell, so further links are dropped and reported as `richLinks`). Notes are cell comments.

import type * as ExcelJS from "exceljs";
import type { FormulaType, ICellData, IStyleData, ITextRun, IWorksheetData } from "@univerjs/presets";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { BOOL, CELL_TYPE } from "@/lib/sheets/univer-constants";
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, parseA1Range, toA1Range } from "./a1";
import { composeUniverStyles, excelFontFrom, type ExcelStyleCache } from "./export-styles";
import { addFormulaPrefixes } from "./formula-prefix";
import { univerLinkToExcel } from "./hyperlinks";
import { cellLinkUrls } from "./lossy";
import { isRecord, type ExcelArrayFormulaValue } from "./types";

/** Excel's limit on the characters of one cell. */
export const EXCEL_CELL_MAX_CHARS = 32_767;
const LINK_TOOLTIP_MAX_CHARS = 255;
const FT_ARRAY: FormulaType.ARRAY = 2;

/** The error values ExcelJS writes as `t="e"` (CellErrorValue). */
const EXCEL_ERRORS: ReadonlySet<string> = new Set(["#N/A", "#REF!", "#NAME?", "#DIV/0!", "#NULL!", "#VALUE!", "#NUM!"]);
const TRAILING_PARAGRAPH_RE = /\r?\n?$/;

export interface CellWriteContext {
  sheetNameById: ReadonlyMap<string, string>;
  definedNameById: ReadonlyMap<string, string>;
  styles: ExcelStyleCache;
  lossy: Set<SheetLossyItem>;
}

export interface ExportedCellValue {
  value: ExcelJS.CellValue;
  /** A FORCE_STRING cell: the cell also gets the "@" (text) number format. */
  forceText: boolean;
}

/** Cuts at `max` UTF-16 units without splitting a surrogate pair. */
function clampText(text: string, max = EXCEL_CELL_MAX_CHARS): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/** The keys of a sparse `{ [index]: T }` object that are indexes below `limit`, ascending. */
export function indexKeys(obj: unknown, limit: number): number[] {
  if (!isRecord(obj)) return [];
  const keys: number[] = [];
  for (const key of Object.keys(obj)) {
    if (!/^\d+$/.test(key)) continue;
    const index = Number(key);
    if (index < limit) keys.push(index);
  }
  return keys.sort((a, b) => a - b);
}

function resultOf(cell: ICellData): ExcelJS.CellFormulaValue["result"] {
  const v = cell.v;
  if (v === null || v === undefined || v === "") return undefined;
  if (cell.t === CELL_TYPE.BOOLEAN || typeof v === "boolean") return v === true || v === 1 || String(v).toUpperCase() === "TRUE";
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (cell.t === CELL_TYPE.NUMBER) {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) return n;
  }
  if (EXCEL_ERRORS.has(v)) return { error: v as ExcelJS.CellErrorValue["error"] };
  return clampText(v);
}

function formulaValue(cell: ICellData, formula: string, row: number, col: number): ExcelJS.CellValue {
  const result = resultOf(cell);
  if (cell.ft === FT_ARRAY && typeof cell.ref === "string") {
    const range = parseA1Range(cell.ref);
    if (range && range.startRow === row && range.startColumn === col) {
      const value: ExcelArrayFormulaValue = { formula, result, shareType: "array", ref: toA1Range(range) };
      return value;
    }
  }
  return { formula, result };
}

/** The dataStream of a rich-text cell without its closing paragraph mark, or null. */
function richTextOf(cell: ICellData): string | null {
  const stream = cell.p?.body?.dataStream;
  return typeof stream === "string" ? stream.replace(TRAILING_PARAGRAPH_RE, "") : null;
}

/** "\r" is Univer's paragraph break; Excel breaks lines with "\n". */
function excelText(text: string): string {
  return clampText(text.replace(/\r\n?/g, "\n"));
}

/**
 * The runs of a rich-text cell as Excel rich text, or null when no run changes the font. Each styled run's
 * font is the cell's own font with the run's properties on top: an Excel run font is complete.
 */
function richRuns(text: string, runs: unknown, base: IStyleData): ExcelJS.RichText[] | null {
  if (!Array.isArray(runs) || runs.length === 0) return null;
  const valid = (runs as unknown[])
    .filter((run): run is ITextRun => isRecord(run) && typeof run.st === "number" && typeof run.ed === "number")
    .map((run) => ({ st: Math.max(0, Math.floor(run.st)), ed: Math.min(text.length, Math.floor(run.ed)), ts: run.ts }))
    .filter((run) => run.st < run.ed)
    .sort((a, b) => a.st - b.st);
  if (!valid.some((run) => excelFontFrom(run.ts) !== undefined)) return null;
  const baseFont = excelFontFrom(base);
  const out: ExcelJS.RichText[] = [];
  const push = (from: number, to: number, font: Partial<ExcelJS.Font> | undefined) => {
    if (from >= to) return;
    const piece = excelText(text.slice(from, to));
    out.push(font ? { text: piece, font } : { text: piece });
  };
  let pos = 0;
  for (const run of valid) {
    const start = Math.max(run.st, pos);
    push(pos, start, baseFont);
    const runFont = run.ts ? excelFontFrom(composeUniverStyles([base, run.ts as IStyleData])) : baseFont;
    push(start, run.ed, runFont);
    pos = Math.max(pos, run.ed);
  }
  push(pos, text.length, baseFont);
  return out.length > 0 ? out : null;
}

function plainValue(cell: ICellData): ExportedCellValue | null {
  const v = cell.v;
  if (v === null || v === undefined || v === "") return null;
  if (cell.t === CELL_TYPE.FORCE_STRING) return { value: clampText(String(v)), forceText: true };
  if (cell.t === CELL_TYPE.BOOLEAN || typeof v === "boolean") {
    return { value: v === true || v === BOOL.TRUE || String(v).toUpperCase() === "TRUE", forceText: false };
  }
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, forceText: false } : null;
  if (cell.t === CELL_TYPE.NUMBER) {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) return { value: n, forceText: false };
  }
  return { value: clampText(v), forceText: false };
}

/**
 * The ExcelJS value of one Univer cell at (row, col), 0-based; null when it holds no value (it may still
 * carry a style). `base` is the cell's composed style, which rich-text runs build on.
 */
export function exportCellValue(cell: ICellData, row: number, col: number, base: IStyleData, ctx: CellWriteContext): ExportedCellValue | null {
  const formula = typeof cell.f === "string" ? cell.f.trim().replace(/^=/, "") : "";
  if (formula !== "") return { value: formulaValue(cell, addFormulaPrefixes(formula), row, col), forceText: false };
  const rich = richTextOf(cell);
  if (rich === null || rich === "") return plainValue(cell);
  const forceText = cell.t === CELL_TYPE.FORCE_STRING;
  const links = cellLinkUrls(cell);
  if (links.length > 1) ctx.lossy.add("richLinks");
  for (const link of links) {
    const hyperlink = univerLinkToExcel(link.url, ctx.sheetNameById, ctx.definedNameById);
    if (hyperlink === null) continue;
    const value: ExcelJS.CellHyperlinkValue = { text: excelText(rich), hyperlink };
    if (link.tooltip !== "") value.tooltip = clampText(link.tooltip, LINK_TOOLTIP_MAX_CHARS);
    return { value, forceText };
  }
  const runs = richRuns(rich, cell.p?.body?.textRuns, base);
  return { value: runs ? { richText: runs } : excelText(rich), forceText };
}

/** The `s` of the row / column entry at `index`, or undefined. */
function layerStyle(data: unknown, index: number): unknown {
  if (!isRecord(data)) return undefined;
  const entry = data[String(index)];
  return isRecord(entry) ? entry.s : undefined;
}

/**
 * Writes every cell of `sheet` into `ws`: its value, and its composed style (`baseLayers` = workbook and
 * sheet defaults, then the row, the column and the cell). Cells outside the Excel grid are skipped.
 * Returns the number of cells written. Call before merging: ExcelJS forwards a value written into a merged
 * cell to the merge's master.
 */
export function writeSheetCells(
  ws: ExcelJS.Worksheet,
  sheet: Partial<IWorksheetData>,
  baseLayers: readonly unknown[],
  ctx: CellWriteContext,
): number {
  const matrix = sheet.cellData;
  let written = 0;
  for (const r of indexKeys(matrix, EXCEL_MAX_ROWS)) {
    const row = (matrix as Record<string, unknown>)[String(r)];
    if (!isRecord(row)) continue;
    const rowStyle = layerStyle(sheet.rowData, r);
    for (const c of indexKeys(row, EXCEL_MAX_COLUMNS)) {
      const cell = row[String(c)];
      if (!isRecord(cell)) continue;
      const data = cell as ICellData;
      const layers = [...baseLayers, rowStyle, layerStyle(sheet.columnData, c), data.s];
      const styled = layers.some((s) => s !== undefined && s !== null && s !== "");
      const base = data.p ? composeUniverStyles(layers.map((s) => ctx.styles.resolve(s))) : {};
      const exported = exportCellValue(data, r, c, base, ctx);
      if (!exported && !styled) continue;
      const target = ws.getCell(r + 1, c + 1);
      const style = ctx.styles.excel(layers, exported?.forceText ?? false);
      if (Object.keys(style).length > 0) target.style = style;
      if (exported) target.value = exported.value;
      written++;
    }
  }
  return written;
}

/** SHEET_NOTE_PLUGIN data of one sheet (`{ [row]: { [col]: { note } } }`); empty cells get notes too. */
export function writeNotes(ws: ExcelJS.Worksheet, notes: unknown): void {
  if (!isRecord(notes)) return;
  for (const [rowKey, cols] of Object.entries(notes)) {
    const row = Number(rowKey);
    if (!Number.isInteger(row) || row < 0 || row >= EXCEL_MAX_ROWS || !isRecord(cols)) continue;
    for (const [colKey, note] of Object.entries(cols)) {
      const col = Number(colKey);
      if (!Number.isInteger(col) || col < 0 || col >= EXCEL_MAX_COLUMNS || !isRecord(note)) continue;
      if (typeof note.note === "string" && note.note !== "") ws.getCell(row + 1, col + 1).note = clampText(note.note);
    }
  }
}
