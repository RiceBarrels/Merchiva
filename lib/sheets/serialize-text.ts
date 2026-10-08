// Plain text of a workbook for search and the Drive excerpt (sheets.md §4.8). It is stored as the
// snapshot's plainText; `cellCount` becomes document.wordCount. There is no parser for it: the grid is
// always read from the snapshot itself.
//
// Format: for each visible sheet in tab order, a line with the sheet name, then one line per non-empty row
// with that row's non-empty cells in column order, joined by a tab. Sheets are separated by a blank line.
// Pure: type-only Univer imports.

import type { ICellData, IWorkbookData, IWorksheetData } from "@univerjs/presets";
import { SHEET_TEXT_MAX_CHARS } from "./constants";
import { CELL_TYPE, SHEET_HIDDEN } from "./univer-constants";

const U32_MAX = 0xffffffff;
/** C0/C1 controls (tab, CR, LF included): a cell's text must stay on its own line and column. */
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;
const TRAILING_PARAGRAPH_RE = /\r?\n?$/;

type Matrix = Record<string, Record<string, ICellData | null | undefined> | null | undefined>;

function sortedIndexes(obj: object): number[] {
  return Object.keys(obj)
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b);
}

function richText(cell: ICellData): string | null {
  const stream = cell.p?.body?.dataStream;
  return typeof stream === "string" ? stream.replace(TRAILING_PARAGRAPH_RE, "") : null;
}

function valueText(cell: ICellData): string {
  const v = cell.v;
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (cell.t === CELL_TYPE.BOOLEAN && (v === 1 || v === 0 || v === "1" || v === "0")) return Number(v) === 1 ? "TRUE" : "FALSE";
  return String(v);
}

/** Display text of one cell: rich text, else the cached value, else the formula. */
export function sheetCellText(cell: ICellData | null | undefined): string {
  if (!cell || typeof cell !== "object") return "";
  const rich = richText(cell);
  const text = rich !== null && rich !== "" ? rich : valueText(cell) || (typeof cell.f === "string" ? cell.f : "");
  return text.replace(CONTROL_RE, " ");
}

/** A cell with a value, a formula (own or shared) or rich text. */
function hasContent(cell: ICellData | null | undefined): boolean {
  if (!cell || typeof cell !== "object") return false;
  return (cell.v !== null && cell.v !== undefined && cell.v !== "")
    || (typeof cell.f === "string" && cell.f !== "")
    || (typeof cell.si === "string" && cell.si !== "")
    || (cell.p !== null && typeof cell.p === "object");
}

function isVisible(sheet: Partial<IWorksheetData>): boolean {
  const hidden = sheet.hidden;
  return hidden === undefined || hidden === null || Number(hidden) === SHEET_HIDDEN.VISIBLE;
}

/** Cuts at `max` UTF-16 units without splitting a surrogate pair. */
function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * The search text and non-empty cell count of `wb`. Hidden sheets are left out of the text but counted.
 * The text is clamped to `maxChars` (DOC_TEXT_MAX_CHARS); the count to u32.
 */
export function serializeSheetText(wb: IWorkbookData, maxChars = SHEET_TEXT_MAX_CHARS): { plainText: string; cellCount: number } {
  const blocks: string[] = [];
  let length = 0;
  let cellCount = 0;
  const order = Array.isArray(wb.sheetOrder) ? wb.sheetOrder : [];
  const sheets = wb.sheets ?? {};
  for (const sheetId of order) {
    const sheet = sheets[sheetId];
    if (!sheet || typeof sheet !== "object") continue;
    const visible = isVisible(sheet);
    const writing = visible && length <= maxChars;
    const lines: string[] = writing ? [String(sheet.name ?? "").replace(CONTROL_RE, " ")] : [];
    const matrix = (sheet.cellData ?? {}) as Matrix;
    for (const rowIndex of sortedIndexes(matrix)) {
      const row = matrix[String(rowIndex)];
      if (!row || typeof row !== "object") continue;
      const cells: string[] = [];
      for (const colIndex of sortedIndexes(row)) {
        const cell = row[String(colIndex)];
        if (!hasContent(cell)) continue;
        cellCount++;
        if (writing) {
          const text = sheetCellText(cell);
          if (text !== "") cells.push(text);
        }
      }
      if (writing && cells.length > 0) lines.push(cells.join("\t"));
    }
    if (writing) {
      const block = lines.join("\n");
      blocks.push(block);
      length += block.length + 2;
    }
  }
  return { plainText: clampText(blocks.join("\n\n"), maxChars), cellCount: Math.min(cellCount, U32_MAX) };
}
