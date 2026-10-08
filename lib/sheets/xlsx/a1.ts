// A1 references (sheets.md §11.1). Row and column indexes here are 0-based, like Univer's IRange (inclusive
// start and end); the A1 text is 1-based, like Excel. Parsing rejects anything outside the Excel grid.

import type { IRange } from "@univerjs/presets";

export const EXCEL_MAX_ROWS = 1_048_576;
export const EXCEL_MAX_COLUMNS = 16_384;

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;
const COLUMN_RE = /^\$?([A-Za-z]{1,3})$/;
const ROW_RE = /^\$?(\d{1,7})$/;
const SHEET_REF_RE = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.*)$/s;
const PLAIN_SHEET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const LOOKS_LIKE_REF_RE = /^(?:[A-Za-z]{1,3}\d+|[Rr]\d*[Cc]\d*|TRUE|FALSE)$/i;

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function colToLetters(col: number): string {
  let n = Math.floor(col) + 1;
  if (!Number.isFinite(n) || n < 1) return "A";
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** "A" → 0, "AA" → 26 (case-insensitive); -1 when not letters or beyond column XFD. */
export function lettersToCol(letters: string): number {
  if (!/^[A-Za-z]{1,3}$/.test(letters)) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n <= EXCEL_MAX_COLUMNS ? n - 1 : -1;
}

/** (0, 0) → "A1"; with `absolute`, "$A$1". */
export function toA1Cell(row: number, col: number, absolute = false): string {
  const d = absolute ? "$" : "";
  return `${d}${colToLetters(col)}${d}${Math.floor(row) + 1}`;
}

/** "B3" / "$B$3" → { row: 2, col: 1 }; null when malformed or off the grid. */
export function parseA1Cell(ref: string): { row: number; col: number } | null {
  const match = CELL_RE.exec(ref.trim());
  if (!match) return null;
  const col = lettersToCol(match[1]);
  const row = Number(match[2]) - 1;
  if (col < 0 || row < 0 || row >= EXCEL_MAX_ROWS) return null;
  return { row, col };
}

/**
 * "A1", "A1:C3" (either corner order), whole columns "A:C" and whole rows "2:4" (with or without `$`) →
 * a normalized IRange; null when malformed or off the grid.
 */
export function parseA1Range(ref: string): IRange | null {
  const parts = ref.trim().split(":");
  if (parts.length === 1) {
    const cell = parseA1Cell(parts[0]);
    return cell ? { startRow: cell.row, endRow: cell.row, startColumn: cell.col, endColumn: cell.col } : null;
  }
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  const c1 = parseA1Cell(a);
  const c2 = parseA1Cell(b);
  if (c1 && c2) {
    return {
      startRow: Math.min(c1.row, c2.row), endRow: Math.max(c1.row, c2.row),
      startColumn: Math.min(c1.col, c2.col), endColumn: Math.max(c1.col, c2.col),
    };
  }
  const col1 = COLUMN_RE.exec(a.trim());
  const col2 = COLUMN_RE.exec(b.trim());
  if (col1 && col2) {
    const s = lettersToCol(col1[1]);
    const e = lettersToCol(col2[1]);
    if (s < 0 || e < 0) return null;
    return { startRow: 0, endRow: EXCEL_MAX_ROWS - 1, startColumn: Math.min(s, e), endColumn: Math.max(s, e) };
  }
  const row1 = ROW_RE.exec(a.trim());
  const row2 = ROW_RE.exec(b.trim());
  if (row1 && row2) {
    const s = Number(row1[1]) - 1;
    const e = Number(row2[1]) - 1;
    if (s < 0 || e < 0 || s >= EXCEL_MAX_ROWS || e >= EXCEL_MAX_ROWS) return null;
    return { startRow: Math.min(s, e), endRow: Math.max(s, e), startColumn: 0, endColumn: EXCEL_MAX_COLUMNS - 1 };
  }
  return null;
}

/** A range whose bounds are integers inside the Excel grid, start ≤ end, clamped; null when unusable. */
export function clampRange(range: Partial<IRange> | null | undefined): IRange | null {
  if (!range || typeof range !== "object") return null;
  const values = [range.startRow, range.endRow, range.startColumn, range.endColumn];
  if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [r1, r2, c1, c2] = (values as number[]).map((v) => Math.floor(v));
  const startRow = Math.max(0, Math.min(r1, r2));
  const endRow = Math.min(EXCEL_MAX_ROWS - 1, Math.max(r1, r2));
  const startColumn = Math.max(0, Math.min(c1, c2));
  const endColumn = Math.min(EXCEL_MAX_COLUMNS - 1, Math.max(c1, c2));
  if (startRow > endRow || startColumn > endColumn) return null;
  return { startRow, endRow, startColumn, endColumn };
}

/** IRange → "A1" (one cell) or "A1:C3"; with `absolute`, "$A$1:$C$3". */
export function toA1Range(range: IRange, absolute = false): string {
  const start = toA1Cell(range.startRow, range.startColumn, absolute);
  if (range.startRow === range.endRow && range.startColumn === range.endColumn) return start;
  return `${start}:${toA1Cell(range.endRow, range.endColumn, absolute)}`;
}

/** A space-separated sqref ("A1:B2 D4") → its ranges; malformed parts are skipped. */
export function parseSqref(sqref: string): IRange[] {
  const out: IRange[] = [];
  for (const part of sqref.trim().split(/\s+/)) {
    if (part === "") continue;
    const range = parseA1Range(part);
    if (range) out.push(range);
  }
  return out;
}

/** A sheet name as a formula / reference prefix wants it: bare when it may be, else quoted with '' escapes. */
export function quoteSheetName(name: string): string {
  if (PLAIN_SHEET_NAME_RE.test(name) && !LOOKS_LIKE_REF_RE.test(name)) return name;
  return `'${name.replace(/'/g, "''")}'`;
}

/** "'It''s'!A1" → { sheetName: "It's", ref: "A1" }; "A1" → { sheetName: null, ref: "A1" }. */
export function splitSheetRef(value: string): { sheetName: string | null; ref: string } {
  const match = SHEET_REF_RE.exec(value.trim());
  if (!match) return { sheetName: null, ref: value.trim() };
  const sheetName = match[1] !== undefined ? match[1].replace(/''/g, "'") : match[2];
  return { sheetName, ref: match[3] };
}
