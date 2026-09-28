// CSV in and out (sheets.md §11.5, §11.7). Import is RFC 4180 (quoted fields, doubled quotes, line breaks
// inside quotes, CRLF / LF / CR) with the delimiter detected from the first records (or Excel's "sep=" line),
// and never produces a formula: text that starts with "=" stays text. Only plain decimal numbers become
// numbers — not "007" (a code, not seven) and not more than 15 significant digits (a card or account number
// would lose its last digits). Export is formula-injection safe: a text cell that a spreadsheet program would
// run as a formula gets a leading apostrophe.

import type { ICellData, IWorkbookData, LocaleType } from "@univerjs/presets";
import { decodeImportText } from "@/lib/docs/import/decode";
import { blankWorksheetData, newSheetId } from "@/lib/sheets/blank";
import { SHEET_APP_VERSION, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import { CELL_TYPE } from "@/lib/sheets/univer-constants";
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS } from "./a1";
import { clampCellText } from "./import-cells";
import { SpreadsheetReadError } from "./types";

const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"] as const;
const SAMPLE_CHARS = 64 * 1024;
const SAMPLE_RECORDS = 20;
const SEP_LINE_RE = /^sep=(.)\r?\n/i;
// Fraction digits only after a dot: `\d+\.?\d*` backtracks quadratically on a long digit run that ends in text.
const CSV_NUMBER_RE = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const MAX_SIGNIFICANT_DIGITS = 15;
const NEEDS_QUOTES_RE = /[",\r\n]/;
/** = + - @ tab CR (and their full-width forms), after any leading spaces: what a spreadsheet may run as a formula. */
const INJECTION_RE = /^(?:[\t\r]|[  ]*[=+\-@＝＋－＠])/;
/** A formatted number as a numeric cell displays it (sign, currency, grouping, decimals, exponent, percent). */
const NUMERIC_DISPLAY_RE = /^[-+]?\p{Sc}?\s?[\d\s.,'  ]*\d(?:[eE][+-]?\d+)?\s?%?\s?\p{Sc}?$/u;

export interface ParseCsvOptions {
  /** Field delimiter; detected when absent. */
  delimiter?: string;
  /** Most fields (cells, empty ones included) the file may hold; more → SpreadsheetReadError("too_many_cells"). */
  maxCells?: number;
}

/** Field counts per record of `text` for one delimiter, quote-aware, over the first records. */
function sampleCounts(text: string, delimiter: string): number[] {
  const counts: number[] = [];
  let fields = 1;
  let quoted = false;
  for (let i = 0; i < text.length && counts.length < SAMPLE_RECORDS; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++;
        else quoted = false;
      }
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) fields++;
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      counts.push(fields);
      fields = 1;
    }
  }
  if (counts.length < SAMPLE_RECORDS && fields > 1) counts.push(fields);
  return counts;
}

/** The delimiter whose field count is most consistent across the first records (comma on a tie or no signal). */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, SAMPLE_CHARS);
  let best: string = ",";
  let bestScore = 0;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = sampleCounts(sample, delimiter);
    if (counts.length === 0) continue;
    const tally = new Map<number, number>();
    for (const n of counts) tally.set(n, (tally.get(n) ?? 0) + 1);
    let mode = 1;
    let modeCount = 0;
    for (const [n, count] of tally) if (count > modeCount || (count === modeCount && n > mode)) [mode, modeCount] = [n, count];
    if (mode < 2) continue;
    const score = (modeCount / counts.length) * 1000 + Math.min(mode, 999);
    if (score > bestScore) [best, bestScore] = [delimiter, score];
  }
  return best;
}

/** RFC 4180 records of `text` (a leading BOM and a final line break are ignored). */
export function parseCsv(input: string, options: ParseCsvOptions = {}): string[][] {
  let text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  let delimiter = options.delimiter;
  const sep = SEP_LINE_RE.exec(text);
  if (!delimiter && sep) {
    delimiter = sep[1];
    text = text.slice(sep[0].length);
  }
  delimiter ??= detectDelimiter(text);
  const maxCells = options.maxCells ?? Number.POSITIVE_INFINITY;
  const rows: string[][] = [];
  let row: string[] = [];
  let cells = 0;
  let i = 0;
  const push = (value: string) => {
    if (++cells > maxCells || row.length >= EXCEL_MAX_COLUMNS) throw new SpreadsheetReadError("too_many_cells");
    row.push(value);
  };
  const endRow = () => {
    if (rows.length >= EXCEL_MAX_ROWS) throw new SpreadsheetReadError("too_many_cells");
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    let value = "";
    if (text[i] === '"') {
      let j = i + 1;
      const parts: string[] = [];
      for (;;) {
        const close = text.indexOf('"', j);
        if (close === -1) {
          parts.push(text.slice(j));
          j = text.length;
          break;
        }
        parts.push(text.slice(j, close));
        if (text[close + 1] === '"') {
          parts.push('"');
          j = close + 2;
        } else {
          j = close + 1;
          break;
        }
      }
      value = parts.join("");
      // Lenient: anything between the closing quote and the next delimiter is kept.
      let k = j;
      while (k < text.length && text[k] !== delimiter && text[k] !== "\n" && text[k] !== "\r") k++;
      value += text.slice(j, k);
      i = k;
    } else {
      let k = i;
      while (k < text.length && text[k] !== delimiter && text[k] !== "\n" && text[k] !== "\r") k++;
      value = text.slice(i, k);
      i = k;
    }
    push(value);
    if (i >= text.length) break;
    const ch = text[i];
    if (ch === delimiter) {
      i++;
      if (i >= text.length) push("");
      continue;
    }
    i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    endRow();
  }
  if (row.length > 0) endRow();
  return rows;
}

/** Whether a CSV field is a plain decimal number that survives as a double. */
export function isCsvNumber(value: string): boolean {
  if (!CSV_NUMBER_RE.test(value)) return false;
  const unsigned = value.replace(/^-/, "");
  if (/^0\d/.test(unsigned)) return false;
  const mantissa = unsigned.split(/[eE]/)[0].replace(".", "").replace(/^0+/, "");
  return mantissa.length <= MAX_SIGNIFICANT_DIGITS && Number.isFinite(Number(value));
}

/** One CSV field as a cell: a number, else text (never a formula); null when empty. */
export function csvCell(value: string): ICellData | null {
  if (value === "") return null;
  if (isCsvNumber(value)) return { v: Number(value), t: CELL_TYPE.NUMBER };
  return { v: clampCellText(value), t: CELL_TYPE.STRING };
}

/** One sheet holding `rows`. */
export function csvToWorkbook(rows: readonly (readonly string[])[], ctx: { name: string; sheetName: string; locale: LocaleType }): IWorkbookData {
  const sheetId = newSheetId();
  const sheet = blankWorksheetData(sheetId, ctx.sheetName);
  const cellData: Record<number, Record<number, ICellData>> = {};
  let columns = 0;
  rows.forEach((fields, r) => {
    fields.forEach((field, c) => {
      const cell = csvCell(field);
      if (cell) (cellData[r] ??= {})[c] = cell;
    });
    columns = Math.max(columns, fields.length);
  });
  sheet.cellData = cellData;
  sheet.rowCount = Math.min(EXCEL_MAX_ROWS, Math.max(sheet.rowCount, rows.length + 100));
  sheet.columnCount = Math.min(EXCEL_MAX_COLUMNS, Math.max(sheet.columnCount, columns + 5));
  return {
    id: SHEET_UNIT_ID,
    name: ctx.name,
    appVersion: SHEET_APP_VERSION,
    locale: ctx.locale,
    styles: {},
    sheetOrder: [sheetId],
    sheets: { [sheetId]: sheet },
    resources: [],
  };
}

/** A .csv file's text: BOM, UTF-16, strict UTF-8, then the legacy encodings of `languages` (lib/docs/import/decode). */
export function decodeCsvBytes(bytes: Uint8Array, languages?: readonly string[]): string {
  return decodeImportText(bytes, "txt", languages ? { languages } : {});
}

// ── Export ───────────────────────────────────────────────────────────────────────────────────────

/** RFC 4180 text: fields holding a quote, comma, CR or LF are quoted; records end with CRLF. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => row.map((field) => (NEEDS_QUOTES_RE.test(field) ? `"${field.replace(/"/g, '""')}"` : field)).join(","))
    .join("\r\n");
}

/**
 * Prefix "'" when a non-numeric cell starts with = + - @ TAB or CR (CSV formula injection). A real number
 * (`t` 2, or a finite numeric `v`) whose displayed text is a formatted number is never prefixed, so -5 stays
 * numeric; a number format that displays formula-like text is prefixed like any text.
 */
export function csvSafeCell(display: string, raw: { v?: unknown; t?: number | null } | null): string {
  if (!INJECTION_RE.test(display)) return display;
  const numeric = raw !== null && (raw.t === CELL_TYPE.NUMBER || (typeof raw.v === "number" && Number.isFinite(raw.v)));
  return numeric && NUMERIC_DISPLAY_RE.test(display.trim()) ? display : `'${display}`;
}

/**
 * The downloadable CSV of a sheet's displayed values (§11.7): each cell made injection safe against its raw
 * value, RFC 4180, with a UTF-8 BOM so spreadsheet programs read it as UTF-8.
 */
export function sheetToSafeCsv(
  display: readonly (readonly string[])[],
  rawAt: (row: number, col: number) => { v?: unknown; t?: number | null } | null,
): string {
  return `﻿${toCsv(display.map((row, r) => row.map((cell, c) => csvSafeCell(cell ?? "", rawAt(r, c)))))}`;
}
