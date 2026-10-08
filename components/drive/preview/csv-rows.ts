// The rows the CSV preview shows: the start of a CSV / TSV file split into cells (quoted fields,
// doubled quotes and line breaks inside quotes, CRLF / LF / CR), up to a row and column cap. The
// preview reads only a prefix of the file, so a record cut off at the end of the prefix is left out.
//
// Cells are shown as plain text, never evaluated: a cell starting with "=" is just text here.
// Pure (no React).

import { driveExtension, normalizeDriveMime } from "@/lib/drive/rules";

export const CSV_PREVIEW_MAX_ROWS = 200;
export const CSV_PREVIEW_MAX_COLUMNS = 100;

export type CsvDelimiter = "," | ";" | "\t";

export interface CsvPrefix {
  /** At most `maxRows` rows of at most `maxColumns` cells each. */
  rows: string[][];
  /** The widest row shown (after the column cap). */
  columns: number;
  /** Rows exist beyond the ones shown (the cap, or the rest of a truncated file). */
  moreRows: boolean;
  /** Some row had more cells than `maxColumns`. */
  moreColumns: boolean;
}

const TSV_MIMES: ReadonlySet<string> = new Set(["text/tab-separated-values"]);
const CANDIDATES: readonly CsvDelimiter[] = [",", ";", "\t"];
/** Only this much of the first record is looked at to choose the delimiter. */
const SNIFF_CHARS = 4096;

/**
 * The delimiter: a tab for a .tsv file or a tab-separated type, else whichever of comma, semicolon (the European
 * "CSV") and tab appears most often outside quotes in the first record; a comma when none does or on a tie.
 */
export function csvDelimiterOf(text: string, file: { mimeType: string; name: string }): CsvDelimiter {
  if (TSV_MIMES.has(normalizeDriveMime(file.mimeType)) || driveExtension(file.name) === "tsv") return "\t";
  const counts = new Map<CsvDelimiter, number>(CANDIDATES.map((d) => [d, 0]));
  let quoted = false;
  const end = Math.min(text.length, SNIFF_CHARS);
  for (let i = 0; i < end; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && counts.has(ch as CsvDelimiter)) counts.set(ch as CsvDelimiter, (counts.get(ch as CsvDelimiter) ?? 0) + 1);
  }
  let best: CsvDelimiter = ",";
  for (const d of CANDIDATES) if ((counts.get(d) ?? 0) > (counts.get(best) ?? 0)) best = d;
  return best;
}

export interface ParseCsvOptions {
  delimiter: CsvDelimiter;
  /** `text` is the whole file. When false (a prefix), a record running into the end of `text` is dropped. */
  complete: boolean;
  maxRows?: number;
  maxColumns?: number;
}

/** Splits `text` into rows (see the file comment). A byte-order mark and a final line break add nothing. */
export function parseCsvPrefix(text: string, opts: ParseCsvOptions): CsvPrefix {
  const maxRows = Math.max(0, opts.maxRows ?? CSV_PREVIEW_MAX_ROWS);
  const maxColumns = Math.max(1, opts.maxColumns ?? CSV_PREVIEW_MAX_COLUMNS);
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let moreColumns = false;
  let row: string[] = [];
  let field = "";
  let quoted = false;
  /** The current field began with a quote (so the quote closes it, and later quotes are literal). */
  let fieldQuoted = false;
  /** Anything read since the last completed record. */
  let pending = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldQuoted = false;
  };
  const endRow = (): boolean => {
    endField();
    if (row.length > maxColumns) moreColumns = true;
    rows.push(row.length > maxColumns ? row.slice(0, maxColumns) : row);
    row = [];
    pending = false;
    return rows.length >= maxRows;
  };

  let i = 0;
  let capped = maxRows === 0;
  while (!capped && i < source.length) {
    const ch = source[i];
    pending = true;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && field === "" && !fieldQuoted) {
      quoted = true;
      fieldQuoted = true;
    } else if (ch === opts.delimiter) {
      endField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      capped = endRow();
    } else {
      field += ch;
    }
    i++;
  }

  // The last record counts when the whole file was read (an unclosed quote then runs to the end, as spreadsheet
  // apps read it). In a prefix it is cut off, and shown only when it is the only record there is.
  if (!capped && pending && (opts.complete || rows.length === 0)) capped = endRow();
  const moreRows = !opts.complete || (capped && i < source.length);
  const columns = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return { rows, columns, moreRows, moreColumns };
}
