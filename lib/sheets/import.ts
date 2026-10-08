// Drive's "Open as spreadsheet" and New ▸ Import (sheets.md §0.2, §10.8): an .xlsx / .xlsm / .csv file becomes
// a new spreadsheet document in the target folder. The file is read by the xlsx worker (or its in-thread
// fallback) into an encoded, sanitized snapshot, so this module never parses it; the caller shows what the
// import left out from `lossy` (sheets.lossy.items.*) and maps a failure with spreadsheetReadErrorKey
// (SpreadsheetReadError) or sheetOrDocErrorKey (a reducer error).

import type { DriveDocTarget } from "@/lib/drive/types";
import {
  createSheetFromState, currentAppLocale, defaultSheetName, SHEET_IMPORT_TEMPLATE_ID, sheetTitleFromFileName, sheetTranslator,
  univerLocaleOf, type CreateSheetOptions,
} from "./create";
import type { SheetLossyItem } from "./types";
import { readSpreadsheetFile } from "./xlsx/client";

export interface SheetImportOutcome {
  documentId: string;
  /** Parts of the file the spreadsheet does not keep (the lossy report's length). */
  warnings: number;
  lossy: SheetLossyItem[];
}

export interface SheetImportOptions extends CreateSheetOptions {
  /** Cells the file may hold; default: this device's limit (importCellLimit). */
  maxCells?: number;
  /**
   * Called once the file is read, right before the create reducer goes out (not when the read fails): a caller's
   * timeout for the server's reply starts here, as reading a large file may legitimately take long.
   */
  beforeCreate?(): void;
}

/**
 * Imports `file` as a new spreadsheet in `target` (titled `target.title`, else the file name). Rejects with
 * SpreadsheetReadError when the file cannot be read, or with the create reducer's error.
 */
export async function importSheetFile(file: File, target: DriveDocTarget, opts?: SheetImportOptions): Promise<SheetImportOutcome> {
  const locale = opts?.locale ?? currentAppLocale();
  const t = sheetTranslator(opts, locale);
  const result = await readSpreadsheetFile(file, {
    locale: univerLocaleOf(locale),
    sheetName: defaultSheetName(t),
    maxCells: opts?.maxCells,
    // A CSV in a legacy encoding is decoded for the app's language before the browser's.
    languages: [locale],
  });
  const title = target.title?.trim() || result.title || sheetTitleFromFileName(file.name);
  opts?.beforeCreate?.();
  const documentId = await createSheetFromState(result, target, { templateId: SHEET_IMPORT_TEMPLATE_ID, title });
  return { documentId, warnings: result.lossy.length, lossy: result.lossy };
}
