// ExcelJS workbook → Univer IWorkbookData (sheets.md §11.3). The ExcelJS workbook was loaded from the
// prescan's rebuilt zip (prescan.ts), so it holds cells, styles, views, columns, rows, conditional formats
// and the filter range; merges, validation, hyperlinks, defined names and notes come from the prescan's own
// reading (merges, defined names and notes are read here, validation and hyperlinks in import-features.ts).
// The result still goes through sanitizeWorkbookData before it is encoded (protocol.ts).

import type * as ExcelJS from "exceljs";
import type { ICellData, IColumnData, IRange, IRowData, IWorkbookData, IWorksheetData, LocaleType } from "@univerjs/presets";
import { blankWorksheetData, newSheetId } from "@/lib/sheets/blank";
import { SHEET_APP_VERSION, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { BOOL, DATE_SYSTEM, RESOURCE, SHEET_HIDDEN } from "@/lib/sheets/univer-constants";
import { clampRange, EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, parseA1Range, splitSheetRef } from "./a1";
import { resolveExcelColor } from "./colors";
import { safeSheetName } from "./export-workbook";
import { stripFormulaPrefixes } from "./formula-prefix";
import { sanitizeImportedLink } from "./hyperlinks";
import { clampCellText, forEachRowCell, forEachSheetRow, importCell, randomId, type CellImportContext } from "./import-cells";
import { readHyperlinks, readValidations, xmlElements, xmlText } from "./import-features";
import { readConditionalFormats, StyleTable, styleFromExcel } from "./import-styles";
import type { PrescanResult, PrescanSheet } from "./prescan";
import { isRecord, type ExcelColorLike, type ExcelJSModule } from "./types";
import { EXCEL_DEFAULT_COL_WIDTH, EXCEL_DEFAULT_ROW_PT, excelWidthToPx, ptToPx } from "./units";

export interface ImportContext {
  /** The workbook's title (the file name without its extension). */
  name: string;
  locale: LocaleType;
  /** The name a sheet gets when the file's is unusable (t("sheets.defaultSheetName")). */
  sheetName: string;
  prescan: Pick<PrescanResult, "sheets" | "definedNames" | "comments">;
}

const MIN_ROWS = 1000;
const MIN_COLUMNS = 26;
const ROW_MARGIN = 100;
const COLUMN_MARGIN = 5;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
/** Excel's largest row height (409 pt) and column width (255 characters), in pixels. */
const MAX_ROW_PX = ptToPx(409);
const MAX_COLUMN_PX = excelWidthToPx(255);
const FREEZE_MAX_ROWS = 1_000;
const FREEZE_MAX_COLUMNS = 200;
/** Merges tried per sheet, merged cells and merges per workbook (as the writer caps them), cells looked at per workbook. */
const [MERGE_MAX_PER_SHEET, MERGE_MAX_CELLS, MERGE_MAX_PER_WORKBOOK, MERGE_MAX_WORK] = [10_000, 300_000, 50_000, 600_000];
/** Defined names per workbook, each at most Excel's formula length. */
const [DEFINED_NAME_MAX, DEFINED_NAME_TEXT_MAX] = [10_000, 8_192];
const DEFINED_NAME_RE = /^[\p{L}_\\][\p{L}\p{M}\p{N}_.\\]*$/u;
const CELL_LIKE_NAME_RE = /^(?:[A-Za-z]{1,3}\d+|[Rr]\d*[Cc]\d*|[Rr]|[Cc])$/;
/**
 * Excel's reserved names: built-ins (print areas and titles, the filter database), newer-function placeholders, and
 * the hidden `_xlchart.` data of its newer chart types (those charts are dropped and reported as `charts`).
 */
const RESERVED_NAME_RE = /^_xl(?:nm|fn|chart)\./i;
/** Notes per sheet, and a note's size as Univer's note panel opens it. */
const [NOTE_MAX, NOTE_WIDTH, NOTE_HEIGHT] = [20_000, 160, 72];

interface PlannedSheet {
  ws: ExcelJS.Worksheet;
  id: string;
  name: string;
  /** The prescan's entry for the sheet, and its index in the workbook's <sheet> list (-1 without one). */
  source: PrescanSheet | undefined;
  index: number;
}

interface Extent {
  row: number;
  col: number;
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** View, freeze, zoom, direction, gridlines and tab colour; a split pane (not a freeze) is reported. */
function sheetLook(ws: ExcelJS.Worksheet, data: IWorksheetData, lossy: Set<SheetLossyItem>): void {
  const view: Partial<ExcelJS.WorksheetView> & Record<string, unknown> = Array.isArray(ws.views) && isRecord(ws.views[0]) ? ws.views[0] : {};
  if (view.state === "frozen") {
    // A frozen pane is always drawn whole: a crafted file must not freeze a million rows.
    const xSplit = Math.min(FREEZE_MAX_COLUMNS, Math.max(0, Math.floor(Number(view.xSplit) || 0)));
    const ySplit = Math.min(FREEZE_MAX_ROWS, Math.max(0, Math.floor(Number(view.ySplit) || 0)));
    data.freeze = { xSplit, ySplit, startRow: ySplit || -1, startColumn: xSplit || -1 };
  } else if (view.state === "split") {
    lossy.add("splitPanes");
  }
  data.rightToLeft = view.rightToLeft === true ? BOOL.TRUE : BOOL.FALSE;
  data.showGridlines = view.showGridLines === false ? BOOL.FALSE : BOOL.TRUE;
  const zoom = positive(view.zoomScale);
  if (zoom !== undefined) data.zoomRatio = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom / 100));
  const tab = ws.properties?.tabColor;
  data.tabColor = isRecord(tab) ? resolveExcelColor(tab as ExcelColorLike) ?? "" : "";
  data.hidden = ws.state === "veryHidden" ? SHEET_HIDDEN.VERY_HIDDEN : ws.state === "hidden" ? SHEET_HIDDEN.HIDDEN : SHEET_HIDDEN.VISIBLE;
}

function readColumns(ws: ExcelJS.Worksheet, data: IWorksheetData, styles: StyleTable, extent: Extent): void {
  const columns: IWorksheetData["columnData"] = {};
  for (const column of ws.columns ?? []) {
    const index = typeof column.number === "number" ? column.number - 1 : -1;
    if (index < 0 || index >= EXCEL_MAX_COLUMNS) continue;
    const entry: Partial<IColumnData> = {};
    const width = positive(column.width);
    const px = width === undefined ? undefined : Math.min(MAX_COLUMN_PX, excelWidthToPx(width));
    if (px !== undefined && px !== data.defaultColumnWidth) entry.w = px;
    if (column.hidden === true) entry.hd = BOOL.TRUE;
    const s = styles.idForExcel(column.style);
    if (s) entry.s = s;
    if (Object.keys(entry).length === 0) continue;
    columns[index] = entry;
    extent.col = Math.max(extent.col, index);
  }
  data.columnData = columns;
}

function readRowsAndCells(ws: ExcelJS.Worksheet, data: IWorksheetData, ctx: CellImportContext, extent: Extent): void {
  const rowData: IWorksheetData["rowData"] = {};
  const cellData: Record<number, Record<number, ICellData>> = {};
  forEachSheetRow(ws, (row, r) => {
    const entry: Partial<IRowData> = {};
    const height = positive(row.height);
    const px = height === undefined ? undefined : Math.min(MAX_ROW_PX, ptToPx(height));
    if (px !== undefined && px !== data.defaultRowHeight) {
      // A height the file states is kept as set: an auto height Univer computes later would replace it.
      entry.h = px;
      entry.ia = BOOL.FALSE;
    }
    if (row.hidden === true) entry.hd = BOOL.TRUE;
    const rowStyle: Partial<ExcelJS.Style> = { numFmt: row.numFmt, font: row.font, alignment: row.alignment, border: row.border, fill: row.fill };
    const s = ctx.styles.idFor(styleFromExcel(rowStyle));
    if (s) entry.s = s;
    if (Object.keys(entry).length > 0) {
      rowData[r] = entry;
      extent.row = Math.max(extent.row, r);
    }
    forEachRowCell(row, (cell, c) => {
      const imported = importCell(cell, r, c, ctx);
      if (!imported) return;
      (cellData[r] ??= {})[c] = imported;
      extent.row = Math.max(extent.row, r);
      extent.col = Math.max(extent.col, c);
    });
  });
  data.rowData = rowData;
  data.cellData = cellData;
}

/** ExcelJS read every sheet under the prescan's `loadName`; the file's own name is the prescan's `name`. */
function planSheets(wbx: ExcelJS.Workbook, ctx: ImportContext): PlannedSheet[] {
  const used = new Set<string>();
  const indexByLoadName = new Map(ctx.prescan.sheets.map((sheet, index) => [sheet.loadName, index] as const));
  return wbx.worksheets.map((ws) => {
    const index = indexByLoadName.get(ws.name) ?? -1;
    const source = index >= 0 ? ctx.prescan.sheets[index] : undefined;
    return { ws, id: newSheetId(), name: safeSheetName(source ? source.name : ws.name, used, ctx.sheetName), source, index };
  });
}

// ── Merges ───────────────────────────────────────────────────────────────────────────────────────

export interface MergeBudget {
  cells: number;
  merges: number;
  /** Cells the overlap test may still look at. */
  work: number;
}

export function newMergeBudget(): MergeBudget {
  return { cells: MERGE_MAX_CELLS, merges: MERGE_MAX_PER_WORKBOOK, work: MERGE_MAX_WORK };
}

/** Whether `range` holds a taken cell; every cell looked at, up to the first taken one, is charged to `budget.work`. */
function overlapsTaken(range: IRange, taken: ReadonlySet<number>, budget: MergeBudget): boolean {
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startColumn; c <= range.endColumn; c++) {
      budget.work--;
      if (taken.has(r * EXCEL_MAX_COLUMNS + c)) return true;
    }
  }
  return false;
}

/**
 * A sheet's <mergeCells>: merges within the budget, overlapping ones dropped (the first wins, as in Excel). A
 * dropped merge costs the cells looked at too, so a flood of large merges that overlap late stops early.
 */
export function readMerges(xml: string | undefined, budget: MergeBudget): IRange[] {
  const out: IRange[] = [];
  if (!xml) return out;
  const taken = new Set<number>();
  let tried = 0;
  for (const el of xmlElements(xml, "mergeCell")) {
    if (tried >= MERGE_MAX_PER_SHEET || budget.merges <= 0 || budget.work <= 0) break;
    const range = parseA1Range(el.attrs.ref ?? "");
    if (!range) continue;
    const cells = (range.endRow - range.startRow + 1) * (range.endColumn - range.startColumn + 1);
    if (cells < 2 || cells > budget.cells) continue;
    tried++;
    budget.merges--;
    if (overlapsTaken(range, taken, budget)) continue;
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startColumn; c <= range.endColumn; c++) taken.add(r * EXCEL_MAX_COLUMNS + c);
    }
    budget.cells -= cells;
    out.push(range);
  }
  return out;
}

// ── Defined names ────────────────────────────────────────────────────────────────────────────────

export interface ImportedDefinedName {
  id: string;
  name: string;
  formulaOrRefString: string;
  localSheetId?: string;
  hidden?: boolean;
}

/** Splits "A!$A$1,'B, c'!$B$2" at the commas outside quotes. */
function areasOf(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === "'") quoted = !quoted;
    if (ch === "," && !quoted) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

/** "Sheet1!$A$1:$B$2,'My sheet'!$C$3": every area names a sheet and a range (Univer keeps those without "="). */
function isReferenceList(text: string): boolean {
  return areasOf(text).every((area) => {
    const { sheetName, ref } = splitSheetRef(area.trim());
    return sheetName !== null && parseA1Range(ref) !== null;
  });
}

/**
 * The workbook's <definedNames>. Excel's reserved names (RESERVED_NAME_RE) are left out silently; any other name
 * left out (one Excel would refuse, a duplicate, a link to another file, a sheet the file does not have, past the
 * caps) is reported as `definedNames`. A hidden name keeps its flag, though Univer lists it like any other.
 */
export function readDefinedNames(xml: string, sheetIdByIndex: readonly string[], lossy: Set<SheetLossyItem>): ImportedDefinedName[] {
  const out: ImportedDefinedName[] = [];
  const seen = new Set<string>();
  for (const el of xmlElements(xml, "definedName")) {
    if (out.length >= DEFINED_NAME_MAX) {
      lossy.add("definedNames");
      break;
    }
    const name = (el.attrs.name ?? "").trim();
    if (RESERVED_NAME_RE.test(name)) continue;
    const key = `${el.attrs.localSheetId ?? ""}:${name.toLowerCase()}`;
    const raw = el.body ?? "";
    const valid = name.length <= 255 && DEFINED_NAME_RE.test(name) && !CELL_LIKE_NAME_RE.test(name) && !seen.has(key);
    const text = valid && raw.length <= DEFINED_NAME_TEXT_MAX ? stripFormulaPrefixes(xmlText(raw).trim().replace(/^=/, "")) : "";
    const local = el.attrs.localSheetId === undefined ? -1 : Number(el.attrs.localSheetId);
    const scoped = Number.isInteger(local) && local >= 0;
    if (text === "" || text.includes("[") || (scoped && !sheetIdByIndex[local])) {
      lossy.add("definedNames");
      continue;
    }
    seen.add(key);
    const entry: ImportedDefinedName = { id: randomId(), name, formulaOrRefString: isReferenceList(text) ? text : `=${text}` };
    if (scoped) entry.localSheetId = sheetIdByIndex[local];
    if (el.attrs.hidden === "1" || el.attrs.hidden === "true") entry.hidden = true;
    out.push(entry);
  }
  return out;
}

// ── Notes and filter ─────────────────────────────────────────────────────────────────────────────

/** SHEET_NOTE_PLUGIN data of one sheet: `{ [row]: { [col]: note } }`. */
export function notesResource(comments: ReadonlyMap<string, string> | undefined): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  let budget = NOTE_MAX;
  for (const [ref, text] of comments ?? []) {
    if (budget-- <= 0) break;
    const range = parseA1Range(ref);
    if (!range) continue;
    const { startRow: row, startColumn: col } = range;
    out[row] ??= {};
    out[row][col] = { id: randomId(), row, col, width: NOTE_WIDTH, height: NOTE_HEIGHT, note: clampCellText(text) };
  }
  return out;
}

/** The auto-filter range (ExcelJS reads the ref only; criteria are reported by the prescan). */
export function filterRange(ws: ExcelJS.Worksheet): IRange | null {
  const value: unknown = ws.autoFilter;
  if (typeof value === "string") return clampRange(parseA1Range(value));
  if (isRecord(value) && typeof value.from === "string" && typeof value.to === "string") {
    return clampRange(parseA1Range(`${value.from}:${value.to}`));
  }
  return null;
}

// ── The workbook ─────────────────────────────────────────────────────────────────────────────────

function resource(name: string, data: unknown): { name: string; data: string } | null {
  return isRecord(data) && Object.keys(data).length > 0 ? { name, data: JSON.stringify(data) } : null;
}

/** The workbook as Univer data, plus what the import left out (§11.8). */
export function importExcelWorkbook(
  _ExcelJS: ExcelJSModule,
  wbx: ExcelJS.Workbook,
  ctx: ImportContext,
): { wb: IWorkbookData; lossy: Set<SheetLossyItem> } {
  const lossy = new Set<SheetLossyItem>();
  const date1904 = wbx.properties?.date1904 === true;
  const planned = planSheets(wbx, ctx);
  // In-workbook links name sheets as the file does; a defined name's localSheetId is an index in its <sheet> list.
  const sheetIdByName = new Map<string, string>();
  const sheetIdByIndex = ctx.prescan.sheets.map(() => "");
  for (const { id, source, index } of planned) {
    if (!source) continue;
    if (!sheetIdByName.has(source.name)) sheetIdByName.set(source.name, id);
    sheetIdByIndex[index] = id;
  }
  const names = readDefinedNames(ctx.prescan.definedNames, sheetIdByIndex, lossy);
  const definedNameIdByName = new Map<string, string>();
  for (const entry of names) if (!definedNameIdByName.has(entry.name)) definedNameIdByName.set(entry.name, entry.id);
  const styles = new StyleTable();
  const mergeBudget: MergeBudget = newMergeBudget();
  const sheets: Record<string, IWorksheetData> = {};
  const dv: Record<string, unknown> = {};
  const cf: Record<string, unknown> = {};
  const notes: Record<string, unknown> = {};
  const filters: Record<string, unknown> = {};

  for (const { ws, id, name, source } of planned) {
    const data = blankWorksheetData(id, name);
    const props = ws.properties ?? {};
    data.defaultColumnWidth = Math.min(MAX_COLUMN_PX, excelWidthToPx(positive(props.defaultColWidth) ?? EXCEL_DEFAULT_COL_WIDTH));
    data.defaultRowHeight = Math.min(MAX_ROW_PX, ptToPx(positive(props.defaultRowHeight) ?? EXCEL_DEFAULT_ROW_PT));
    sheetLook(ws, data, lossy);
    const extent: Extent = { row: 0, col: 0 };
    const links = readHyperlinks(source?.blocks.hyperlinks, source?.rels ?? new Map(), (href) =>
      sanitizeImportedLink(href, sheetIdByName, definedNameIdByName));
    readColumns(ws, data, styles, extent);
    readRowsAndCells(ws, data, { date1904, styles, links, lossy }, extent);
    data.mergeData = readMerges(source?.blocks.mergeCells, mergeBudget);
    for (const merge of data.mergeData) {
      extent.row = Math.max(extent.row, merge.endRow);
      extent.col = Math.max(extent.col, merge.endColumn);
    }
    data.rowCount = Math.min(EXCEL_MAX_ROWS, Math.max(MIN_ROWS, extent.row + 1 + ROW_MARGIN, data.freeze.ySplit + 1));
    data.columnCount = Math.min(EXCEL_MAX_COLUMNS, Math.max(MIN_COLUMNS, extent.col + 1 + COLUMN_MARGIN, data.freeze.xSplit + 1));
    const rules = readValidations(source?.blocks.dataValidations, lossy);
    if (rules.length > 0) dv[id] = rules;
    const formats = readConditionalFormats(ws, lossy);
    if (formats.length > 0) cf[id] = formats;
    const sheetNotes = notesResource(source ? ctx.prescan.comments.get(source.path) : undefined);
    if (Object.keys(sheetNotes).length > 0) notes[id] = sheetNotes;
    const ref = filterRange(ws);
    if (ref) filters[id] = { ref };
    sheets[id] = data;
  }

  const sheetOrder = planned.map((p) => p.id);
  // A workbook needs a visible sheet (Excel refuses one without): the first shows when none does.
  if (sheetOrder.length > 0 && !sheetOrder.some((id) => sheets[id].hidden === SHEET_HIDDEN.VISIBLE)) {
    sheets[sheetOrder[0]].hidden = SHEET_HIDDEN.VISIBLE;
  }
  if (planned.length === 0) {
    // A workbook of chart sheets only: an empty sheet (the charts are already reported).
    const id = newSheetId();
    sheets[id] = blankWorksheetData(id, ctx.sheetName);
    sheetOrder.push(id);
  }
  const definedNames: Record<string, unknown> = {};
  for (const entry of names) definedNames[entry.id] = entry;
  const resources = [
    resource(RESOURCE.DATA_VALIDATION, dv),
    resource(RESOURCE.CONDITIONAL_FORMATTING, cf),
    resource(RESOURCE.NOTE, notes),
    resource(RESOURCE.FILTER, filters),
    resource(RESOURCE.DEFINED_NAME, definedNames),
  ].filter((entry): entry is { name: string; data: string } => entry !== null);
  const wb: IWorkbookData = {
    id: SHEET_UNIT_ID,
    name: ctx.name,
    appVersion: SHEET_APP_VERSION,
    locale: ctx.locale,
    dateSystem: date1904 ? DATE_SYSTEM.DATE_1904 : DATE_SYSTEM.DATE_1900,
    styles: styles.styles,
    sheetOrder,
    sheets,
    resources,
  };
  return { wb, lossy };
}
