// The empty workbook a new spreadsheet starts from. createSheetDocument seeds the document's snapshot with
// it (createDriveDocument requires a gzip seed for a sheet), so a sheet is never opened without content.
// Pure: type-only Univer imports.

import type { IWorkbookData, IWorksheetData, LocaleType } from "@univerjs/presets";
import { SHEET_APP_VERSION, SHEET_UNIT_ID } from "./constants";
import { BOOL, SHEET_HIDDEN } from "./univer-constants";

/** Univer's defaults for a new worksheet (1000 × 20 grid, 88 px columns, 24 px rows). */
export const BLANK_SHEET_ROWS = 1000;
export const BLANK_SHEET_COLUMNS = 20;
const DEFAULT_COLUMN_WIDTH = 88;
const DEFAULT_ROW_HEIGHT = 24;
const ROW_HEADER_WIDTH = 46;
const COLUMN_HEADER_HEIGHT = 20;

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A new worksheet id: "s" + 12 random base-36 characters. */
export function newSheetId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let id = "s";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/** One empty, visible worksheet. */
export function blankWorksheetData(id: string, name: string): IWorksheetData {
  return {
    id,
    name,
    tabColor: "",
    hidden: SHEET_HIDDEN.VISIBLE,
    freeze: { xSplit: 0, ySplit: 0, startRow: -1, startColumn: -1 },
    rowCount: BLANK_SHEET_ROWS,
    columnCount: BLANK_SHEET_COLUMNS,
    zoomRatio: 1,
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: DEFAULT_COLUMN_WIDTH,
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    mergeData: [],
    cellData: {},
    rowData: {},
    columnData: {},
    rowHeader: { width: ROW_HEADER_WIDTH, hidden: BOOL.FALSE },
    columnHeader: { height: COLUMN_HEADER_HEIGHT, hidden: BOOL.FALSE },
    showGridlines: BOOL.TRUE,
    rightToLeft: BOOL.FALSE,
  };
}

/**
 * A workbook with one empty sheet. `name` is the workbook title, `sheetName` the first tab
 * (t("sheets.defaultSheetName") with n = 1), `locale` the Univer locale of the creator.
 */
export function blankWorkbookData(opts: { name: string; locale: LocaleType; sheetName: string }): IWorkbookData {
  const sheetId = newSheetId();
  return {
    id: SHEET_UNIT_ID,
    name: opts.name,
    appVersion: SHEET_APP_VERSION,
    locale: opts.locale,
    styles: {},
    sheetOrder: [sheetId],
    sheets: { [sheetId]: blankWorksheetData(sheetId, opts.sheetName) },
    resources: [],
  };
}
