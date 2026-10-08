// The responses table as one spreadsheet (.xlsx export and "Open as spreadsheet"). Loaded lazily with the sheets
// code. csvToWorkbook reads every field as CSV text and types numeric-looking text as a number, so a short-text
// answer such as "1.50" or "1e3" would become 1.5 or 1000; here a text cell of the table stays text, and only
// the table's real numbers (number, rating and scale answers) are number cells.

import type { IWorkbookData, LocaleType } from "@univerjs/presets";
import type { ResponseTable } from "@/lib/forms/export";
import { CELL_TYPE } from "@/lib/sheets/univer-constants";
import { csvToWorkbook } from "@/lib/sheets/xlsx/csv";
import { clampCellText } from "@/lib/sheets/xlsx/import-cells";

export function responseTableWorkbook(
  table: ResponseTable,
  ctx: { name: string; sheetName: string; locale: LocaleType },
): IWorkbookData {
  const rows = [table.columns.map((c) => c.header), ...table.rows.map((row) => row.map((cell) => String(cell)))];
  const wb = csvToWorkbook(rows, ctx);
  const cells = wb.sheets[wb.sheetOrder[0]]?.cellData;
  if (!cells) return wb;
  table.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const data = cells[r + 1]?.[c];
      if (typeof cell === "string" && data && data.t === CELL_TYPE.NUMBER) {
        cells[r + 1][c] = { v: clampCellText(cell), t: CELL_TYPE.STRING };
      }
    });
  });
  return wb;
}
