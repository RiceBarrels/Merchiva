// Univer workbook → ExcelJS workbook (sheets.md §11.4). The input is adapter.saveForExport() (formulas
// materialized); the output is written with `workbook.xlsx.writeBuffer()` in the xlsx worker (or the
// in-thread fallback). Parts an .xlsx cannot keep are reported through `lossy` (§11.8). The ExcelJS module
// is a parameter: the worker passes the bare browser build, tests the Node build.

import type * as ExcelJS from "exceljs";
import type { IRange, IWorkbookData, IWorksheetData } from "@univerjs/presets";
import { SHEET_IMPORT_MAX_CELLS_COARSE } from "@/lib/sheets/constants";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { BOOL, DATE_SYSTEM, RESOURCE, SHEET_HIDDEN } from "@/lib/sheets/univer-constants";
import { clampRange, EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, parseA1Range, quoteSheetName, splitSheetRef, toA1Range } from "./a1";
import { hexToArgb } from "./colors";
import { indexKeys, writeNotes, writeSheetCells, type CellWriteContext } from "./export-cells";
import { writeConditionalFormats, writeDataValidations, type FeatureContext } from "./export-features";
import { ExcelStyleCache } from "./export-styles";
import { lossyForExport } from "./lossy";
import { isRecord, readWorkbookResource, SpreadsheetReadError, type ExcelJSModule } from "./types";
import { pxToExcelWidth, pxToPt } from "./units";

/** Excel's limit on a sheet name. */
export const EXCEL_SHEET_NAME_MAX = 31;
/** The file's creator metadata (the product name, not UI copy). */
const WORKBOOK_CREATOR = "Merchiva";
/** Univer's defaults for a sheet that does not say (lib/sheets/blank.ts). */
const UNIVER_DEFAULT_COLUMN_PX = 88;
const UNIVER_DEFAULT_ROW_PX = 24;
/** ExcelJS keeps a defined name cell by cell: names past this many cells, summed over all of them, are left out. */
const DEFINED_NAMES_MAX_CELLS = 200_000;
/** A name Excel accepts: a letter of any script, an underscore or a backslash first; at most 255 characters. */
const DEFINED_NAME_MAX_CHARS = 255;
const DEFINED_NAME_RE = /^[\p{L}_\\][\p{L}\p{M}\p{N}_.\\]*$/u;
const CELL_LIKE_NAME_RE = /^(?:[A-Za-z]{1,3}\d+|[Rr]\d*[Cc]\d*|[Rr]|[Cc])$/;
/** Excel's reserved names (built-ins, newer-function placeholders, newer-chart data): never the user's, never written. */
const RESERVED_NAME_RE = /^_xl(?:nm|fn|chart)\./i;
/**
 * ExcelJS makes a cell object for every merged cell and checks each new merge against every earlier one
 * (quadratic): merged cells and merges per workbook, and merges tried per sheet, are capped; the rest is left out.
 */
const MERGE_MAX_CELLS = SHEET_IMPORT_MAX_CELLS_COARSE;
const MERGE_MAX_PER_WORKBOOK = 50_000;
const MERGE_MAX_PER_SHEET = 10_000;
/** What Excel refuses in a sheet name, control characters included. */
const SHEET_NAME_FORBIDDEN_RE = /[[\]:*?/\\\u0000-\u001f\u007f]/g;

function clampChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

function trimQuotes(text: string): string {
  return text.replace(/^'+|'+$/g, "").trim();
}

/**
 * A name Excel accepts: no []:*?/\ or control characters, no leading or trailing apostrophe, at most 31
 * characters, not "History", unique among `used` (case-insensitive: taken names are lower-cased into it),
 * deduplicated with " (2)", " (3)"… `fallback` replaces a name with nothing left.
 */
export function safeSheetName(name: unknown, used: Set<string>, fallback: string): string {
  let base = trimQuotes(clampChars(trimQuotes(String(name ?? "").replace(SHEET_NAME_FORBIDDEN_RE, "")), EXCEL_SHEET_NAME_MAX));
  if (base === "" || base.toLowerCase() === "history") base = fallback;
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = `${trimQuotes(clampChars(base, EXCEL_SHEET_NAME_MAX - suffix.length))}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

interface PlannedSheet {
  id: string;
  sheet: Partial<IWorksheetData>;
  name: string;
  state: ExcelJS.WorksheetState;
}

function planSheets(wb: IWorkbookData): PlannedSheet[] {
  const sheets = isRecord(wb.sheets) ? wb.sheets : {};
  const order = Array.isArray(wb.sheetOrder) ? wb.sheetOrder : [];
  const used = new Set<string>();
  const seen = new Set<string>();
  const out: PlannedSheet[] = [];
  for (const id of order) {
    const sheet = typeof id === "string" && Object.hasOwn(sheets, id) ? sheets[id] : undefined;
    if (!isRecord(sheet) || seen.has(id)) continue;
    seen.add(id);
    const hidden = Number(sheet.hidden);
    const state = hidden === SHEET_HIDDEN.VERY_HIDDEN ? "veryHidden" : hidden === SHEET_HIDDEN.HIDDEN ? "hidden" : "visible";
    out.push({ id, sheet, name: safeSheetName(sheet.name, used, String(out.length + 1)), state });
  }
  if (out.length === 0) throw new SpreadsheetReadError("corrupt", "The workbook has no sheets");
  // Excel refuses a workbook with no visible sheet.
  if (!out.some((entry) => entry.state === "visible")) out[0].state = "visible";
  return out;
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function sheetView(sheet: Partial<IWorksheetData>): Partial<ExcelJS.WorksheetView> {
  const zoom = Math.round((positive(sheet.zoomRatio) ?? 1) * 100);
  const common: Partial<ExcelJS.WorksheetViewCommon> = {
    rightToLeft: sheet.rightToLeft === BOOL.TRUE,
    showGridLines: sheet.showGridlines !== BOOL.FALSE,
  };
  if (zoom !== 100) common.zoomScale = Math.min(400, Math.max(10, zoom));
  const freeze: Record<string, unknown> = isRecord(sheet.freeze) ? sheet.freeze : {};
  const split = (value: unknown, max: number) => (typeof value === "number" && value > 0 ? Math.min(Math.floor(value), max - 1) : 0);
  const xSplit = split(freeze.xSplit, EXCEL_MAX_COLUMNS);
  const ySplit = split(freeze.ySplit, EXCEL_MAX_ROWS);
  return xSplit > 0 || ySplit > 0 ? { ...common, state: "frozen", xSplit, ySplit } : { ...common, state: "normal" };
}

function addWorksheet(wbx: ExcelJS.Workbook, entry: PlannedSheet): ExcelJS.Worksheet {
  const { sheet } = entry;
  const tabColor = hexToArgb(typeof sheet.tabColor === "string" ? sheet.tabColor : null);
  const properties: Partial<ExcelJS.WorksheetProperties> = {
    defaultRowHeight: pxToPt(positive(sheet.defaultRowHeight) ?? UNIVER_DEFAULT_ROW_PX),
    defaultColWidth: pxToExcelWidth(positive(sheet.defaultColumnWidth) ?? UNIVER_DEFAULT_COLUMN_PX),
    showGridLines: sheet.showGridlines !== BOOL.FALSE,
  };
  if (tabColor) properties.tabColor = { argb: tabColor };
  return wbx.addWorksheet(entry.name, { state: entry.state, properties, views: [sheetView(sheet)] });
}

/** Column widths, hidden columns and column styles. ExcelJS writes a width for every <col>, so each gets one. */
function writeColumns(ws: ExcelJS.Worksheet, sheet: Partial<IWorksheetData>, base: readonly unknown[], styles: ExcelStyleCache): void {
  const data: unknown = sheet.columnData;
  const defaultPx = positive(sheet.defaultColumnWidth) ?? UNIVER_DEFAULT_COLUMN_PX;
  for (const c of indexKeys(data, EXCEL_MAX_COLUMNS)) {
    const entry = isRecord(data) ? data[String(c)] : undefined;
    if (!isRecord(entry)) continue;
    const width = positive(entry.w);
    const hidden = entry.hd === BOOL.TRUE;
    const style = entry.s !== undefined && entry.s !== null ? styles.excel([...base, entry.s]) : {};
    const styled = Object.keys(style).length > 0;
    if (width === undefined && !hidden && !styled) continue;
    const column = ws.getColumn(c + 1);
    column.width = pxToExcelWidth(width ?? defaultPx);
    if (hidden) column.hidden = true;
    if (styled) column.style = style;
  }
}

/** A hidden or styled row without a height of its own, and the default height it gets if it holds no cells. */
interface RowFallback {
  row: ExcelJS.Row;
  pt: number;
}

/**
 * Row heights (only a height the user set: a row Univer sizes to its content is left for Excel to fit), hidden
 * rows and row styles. ExcelJS drops a row with neither cells nor a height, and any height it writes is a
 * custom one, so the hidden and styled rows without a height are returned: once every cell is written, those
 * still empty get the default height.
 */
function writeRows(ws: ExcelJS.Worksheet, sheet: Partial<IWorksheetData>, base: readonly unknown[], styles: ExcelStyleCache): RowFallback[] {
  const data: unknown = sheet.rowData;
  const defaultPt = pxToPt(positive(sheet.defaultRowHeight) ?? UNIVER_DEFAULT_ROW_PX);
  const fallbacks: RowFallback[] = [];
  for (const r of indexKeys(data, EXCEL_MAX_ROWS)) {
    const entry = isRecord(data) ? data[String(r)] : undefined;
    if (!isRecord(entry)) continue;
    // Univer's own rule (RowManager.getRowHeight): the auto height wins unless auto height is switched off.
    const unset = entry.ia === undefined || entry.ia === null;
    const auto = entry.ia === BOOL.TRUE || (unset && typeof entry.ah === "number");
    const height = auto ? undefined : positive(entry.h);
    const hidden = entry.hd === BOOL.TRUE;
    const style = entry.s !== undefined && entry.s !== null ? styles.excel([...base, entry.s]) : {};
    const styled = Object.keys(style).length > 0;
    if (height === undefined && !hidden && !styled) continue;
    const row = ws.getRow(r + 1);
    if (height !== undefined) row.height = pxToPt(height);
    else fallbacks.push({ row, pt: defaultPt });
    if (hidden) row.hidden = true;
    if (style.numFmt) row.numFmt = style.numFmt;
    if (style.font) row.font = style.font;
    if (style.alignment) row.alignment = style.alignment;
    if (style.border) row.border = style.border;
    if (style.fill) row.fill = style.fill;
  }
  return fallbacks;
}

interface MergeBudget {
  cells: number;
  merges: number;
}

/**
 * Merges clamped to the sheet's own grid, within `budget` and MERGE_MAX_PER_SHEET (after the cells: ExcelJS
 * forwards a value written into a merged cell to its master).
 */
function writeMerges(ws: ExcelJS.Worksheet, sheet: Partial<IWorksheetData>, budget: MergeBudget): void {
  const merges: unknown = sheet.mergeData;
  if (!Array.isArray(merges)) return;
  const rows = Math.min(EXCEL_MAX_ROWS, Math.floor(positive(sheet.rowCount) ?? EXCEL_MAX_ROWS));
  const columns = Math.min(EXCEL_MAX_COLUMNS, Math.floor(positive(sheet.columnCount) ?? EXCEL_MAX_COLUMNS));
  let tried = 0;
  for (const merge of merges) {
    if (tried >= MERGE_MAX_PER_SHEET || budget.merges <= 0) return;
    const range = clampRange(isRecord(merge) ? (merge as Partial<IRange>) : null);
    if (!range || range.startRow >= rows || range.startColumn >= columns) continue;
    const endRow = Math.min(range.endRow, rows - 1);
    const endColumn = Math.min(range.endColumn, columns - 1);
    const cells = (endRow - range.startRow + 1) * (endColumn - range.startColumn + 1);
    if (cells < 2 || cells > budget.cells) continue;
    tried++;
    budget.merges--;
    try {
      ws.mergeCellsWithoutStyle(range.startRow + 1, range.startColumn + 1, endRow + 1, endColumn + 1);
      budget.cells -= cells;
    } catch {
      // An overlapping merge: Excel cannot hold both, the first one wins.
    }
  }
}

/** SHEET_FILTER_PLUGIN data of one sheet: the range only (lossyForExport reports the criteria). */
function writeAutoFilter(ws: ExcelJS.Worksheet, filter: unknown): void {
  if (!isRecord(filter)) return;
  const ref = clampRange(isRecord(filter.ref) ? (filter.ref as Partial<IRange>) : null);
  if (ref) ws.autoFilter = toA1Range(ref);
}

// ── Defined names ────────────────────────────────────────────────────────────────────────────────

interface DefinedNameEntry {
  id: string;
  name: string;
  ref: string;
  /** The sheet a sheet-scoped name belongs to ("" = workbook scope): it resolves a reference with no sheet. */
  sheetId: string;
}

/**
 * The valid names of SHEET_DEFINED_NAME_PLUGIN data (`{ [id]: { id, name, formulaOrRefString, localSheetId? } }`).
 * A named entry left out (a name Excel refuses, or a second one with the same name) is reported as `definedNames`;
 * Excel's reserved names are left out silently. ExcelJS cannot write a name's `hidden` flag, so a hidden name is
 * written visible and not reported: Univer already lists it like any other, and leaving it out would break the
 * formulas that use it.
 */
function readDefinedNames(resource: unknown, lossy: Set<SheetLossyItem>): DefinedNameEntry[] {
  if (!isRecord(resource)) return [];
  const out: DefinedNameEntry[] = [];
  const seen = new Set<string>();
  for (const [key, entry] of Object.entries(resource)) {
    if (!isRecord(entry) || typeof entry.name !== "string") continue;
    const name = entry.name.trim();
    if (RESERVED_NAME_RE.test(name)) continue;
    if (typeof entry.formulaOrRefString !== "string" || name.length > DEFINED_NAME_MAX_CHARS || !DEFINED_NAME_RE.test(name)
      || CELL_LIKE_NAME_RE.test(name) || seen.has(name.toLowerCase())) {
      lossy.add("definedNames");
      continue;
    }
    seen.add(name.toLowerCase());
    const sheetId = typeof entry.localSheetId === "string" ? entry.localSheetId : "";
    out.push({ id: typeof entry.id === "string" ? entry.id : key, name, ref: entry.formulaOrRefString, sheetId });
  }
  return out;
}

/** Splits "A!$A$1,'B, c'!$B$2" at the commas outside quotes. */
function areas(ref: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of ref) {
    if (ch === "'") quoted = !quoted;
    if (ch === "," && !quoted) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((part) => part.trim()).filter(Boolean);
}

interface PlannedName {
  id: string;
  name: string;
  /** Absolute "'Sheet'!$A$1:$B$2" areas. */
  locations: string[];
}

/**
 * The names that refer to cell ranges of exported sheets, within DEFINED_NAMES_MAX_CELLS. Constant and formula
 * names cannot be written by ExcelJS and are left out, as are names on a sheet whose name holds an apostrophe
 * (ExcelJS does not escape it in the name's reference); each is reported as `definedNames`. Links to a name left
 * out are exported as text.
 */
function planDefinedNames(names: readonly DefinedNameEntry[], sheets: readonly PlannedSheet[], lossy: Set<SheetLossyItem>): PlannedName[] {
  const exported = new Map<string, string>();
  const exportedById = new Map<string, string>();
  for (const entry of sheets) {
    const original = typeof entry.sheet.name === "string" ? entry.sheet.name.toLowerCase() : "";
    if (!exported.has(original)) exported.set(original, entry.name);
    exportedById.set(entry.id, entry.name);
  }
  const out: PlannedName[] = [];
  let budget = DEFINED_NAMES_MAX_CELLS;
  for (const entry of names) {
    const parts = areas(entry.ref.trim().replace(/^=/, ""));
    const locations: string[] = [];
    let cells = 0;
    for (const part of parts) {
      const { sheetName, ref } = splitSheetRef(part);
      const target = sheetName === null ? exportedById.get(entry.sheetId) : exported.get(sheetName.toLowerCase());
      const range = parseA1Range(ref);
      if (!target || target.includes("'") || !range) break;
      cells += (range.endRow - range.startRow + 1) * (range.endColumn - range.startColumn + 1);
      if (cells > budget) break;
      locations.push(`${quoteSheetName(target)}!${toA1Range(range, true)}`);
    }
    if (locations.length === 0 || locations.length !== parts.length) {
      lossy.add("definedNames");
      continue;
    }
    budget -= cells;
    out.push({ id: entry.id, name: entry.name, locations });
  }
  return out;
}

// ── Workbook ─────────────────────────────────────────────────────────────────────────────────────

function perSheet(resource: unknown): Record<string, unknown> {
  return isRecord(resource) ? resource : {};
}

/** `wb` as an ExcelJS workbook, plus what the file leaves out. */
export function exportExcelWorkbook(ExcelJS: ExcelJSModule, wb: IWorkbookData): { workbook: ExcelJS.Workbook; lossy: Set<SheetLossyItem> } {
  const lossy = lossyForExport(wb);
  const planned = planSheets(wb);
  const wbx = new ExcelJS.Workbook();
  const now = new Date();
  wbx.creator = WORKBOOK_CREATOR;
  wbx.lastModifiedBy = WORKBOOK_CREATOR;
  wbx.created = now;
  wbx.modified = now;
  const date1904 = wb.dateSystem === DATE_SYSTEM.DATE_1904;
  wbx.properties.date1904 = date1904;
  // Cached results can be stale (and ExcelJS drops falsy ones): Excel recalculates on open.
  wbx.calcProperties.fullCalcOnLoad = true;

  const names = planDefinedNames(readDefinedNames(readWorkbookResource(wb, RESOURCE.DEFINED_NAME), lossy), planned, lossy);
  const styles = new ExcelStyleCache(wb.styles);
  const cellCtx: CellWriteContext = {
    sheetNameById: new Map(planned.map((entry) => [entry.id, entry.name] as const)),
    definedNameById: new Map(names.map((entry) => [entry.id, entry.name] as const)),
    styles,
    lossy,
  };
  const featureCtx: FeatureContext = { date1904, lossy };
  const dv = perSheet(readWorkbookResource(wb, RESOURCE.DATA_VALIDATION));
  const cf = perSheet(readWorkbookResource(wb, RESOURCE.CONDITIONAL_FORMATTING));
  const notes = perSheet(readWorkbookResource(wb, RESOURCE.NOTE));
  const filters = perSheet(readWorkbookResource(wb, RESOURCE.FILTER));
  const mergeBudget: MergeBudget = { cells: MERGE_MAX_CELLS, merges: MERGE_MAX_PER_WORKBOOK };

  for (const entry of planned) {
    const ws = addWorksheet(wbx, entry);
    const base = [wb.defaultStyle, entry.sheet.defaultStyle];
    writeColumns(ws, entry.sheet, base, styles);
    const rowFallbacks = writeRows(ws, entry.sheet, base, styles);
    writeSheetCells(ws, entry.sheet, base, cellCtx);
    writeMerges(ws, entry.sheet, mergeBudget);
    writeDataValidations(ws, dv[entry.id], featureCtx);
    writeConditionalFormats(ws, cf[entry.id], featureCtx);
    writeNotes(ws, notes[entry.id]);
    writeAutoFilter(ws, filters[entry.id]);
    // Values, merges and notes all make cells: only a row still without any needs a height to be written.
    for (const { row, pt } of rowFallbacks) if (row.cellCount === 0) row.height = pt;
  }
  for (const entry of names) for (const location of entry.locations) wbx.definedNames.add(location, entry.name);
  const activeTab = Math.max(0, planned.findIndex((entry) => entry.state === "visible"));
  wbx.views = [{ x: 0, y: 0, width: 10_000, height: 20_000, firstSheet: 0, activeTab, visibility: "visible" }];
  return { workbook: wbx, lossy };
}

/**
 * exportExcelWorkbook, then the .xlsx bytes. `writeBuffer` yields a Node or polyfilled Buffer (possibly a
 * view into a shared pool) or an ArrayBuffer; the result always owns its whole buffer, so it can be
 * transferred to another thread.
 */
export async function exportXlsxBytes(ExcelJS: ExcelJSModule, wb: IWorkbookData): Promise<{ bytes: Uint8Array; lossy: Set<SheetLossyItem> }> {
  const { workbook, lossy } = exportExcelWorkbook(ExcelJS, wb);
  const out: unknown = await workbook.xlsx.writeBuffer();
  if (out instanceof ArrayBuffer) return { bytes: new Uint8Array(out), lossy };
  if (out instanceof Uint8Array) {
    const whole = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength && out.buffer instanceof ArrayBuffer;
    return { bytes: whole ? new Uint8Array(out.buffer) : new Uint8Array(out), lossy };
  }
  throw new SpreadsheetReadError("corrupt", "The spreadsheet writer returned no bytes");
}
