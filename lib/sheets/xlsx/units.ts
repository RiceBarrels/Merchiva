// Unit conversions between Excel and Univer (sheets.md §11.1). Excel measures columns in characters of the
// default font's widest digit (Calibri 11: 7 px), rows in points, and dates as serial day numbers; Univer
// measures sizes in 96-DPI pixels. A file's column width (<col width>, <sheetFormatPr defaultColWidth>, and
// ExcelJS's `width`, which is that attribute) already includes the 5 px of cell padding, so it converts by
// ECMA-376 Part 1 §18.3.1.13, not by the "characters × 7 + 5" of Excel's column-width dialog. The date epochs
// are ExcelJS's own (utils.js dateToExcel / excelToDate: 25569 for 1900, 25569 - 1462 = 24107 for 1904), so a
// date read by ExcelJS and written back by it lands on the same serial. Dates are UTC, as ExcelJS reads them.

/** Excel's default column width as a file stores it (8.43 characters in the dialog, 64 px). */
export const EXCEL_DEFAULT_COL_WIDTH = 9.140625;
/** Excel's default row height, in points. */
export const EXCEL_DEFAULT_ROW_PT = 15;

/** The widest digit of Calibri 11 at 96 DPI, in pixels. */
const MAX_DIGIT_PX = 7;
const MS_PER_DAY = 86_400_000;
const EPOCH_1900 = 25_569;
const OFFSET_1904 = 1_462;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A file's column width → pixels: Truncate(((256 × width + Truncate(128 / 7)) / 256) × 7). */
export function excelWidthToPx(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.trunc(((256 * width + Math.trunc(128 / MAX_DIGIT_PX)) / 256) * MAX_DIGIT_PX);
}

/** Pixels → a file's column width, in 1/256 characters: the inverse of excelWidthToPx for every whole px. */
export function pxToExcelWidth(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return 0;
  return Math.trunc((px * 256) / MAX_DIGIT_PX) / 256;
}

/** Points → pixels. */
export function ptToPx(pt: number): number {
  if (!Number.isFinite(pt) || pt <= 0) return 0;
  return Math.round((pt * 4) / 3);
}

/** Pixels → points (2 decimals): the inverse of ptToPx. */
export function pxToPt(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return 0;
  return round2((px * 3) / 4);
}

/** The serial day number of a UTC date in the 1900 or 1904 date system. */
export function excelSerialFromDate(date: Date, date1904: boolean): number {
  return EPOCH_1900 + date.getTime() / MS_PER_DAY - (date1904 ? OFFSET_1904 : 0);
}

/** The UTC date of a serial day number in the 1900 or 1904 date system. */
export function dateFromExcelSerial(serial: number, date1904: boolean): Date {
  return new Date(Math.round((serial - EPOCH_1900 + (date1904 ? OFFSET_1904 : 0)) * MS_PER_DAY));
}
