// Shared types of the .xlsx reader and writer (sheets.md §11.1), plus typed adapters for the ExcelJS 4.4.0
// runtime members its typings leave out or declare too narrowly. No ExcelJS runtime import: the mappers
// receive the module as a parameter (the bare browser build in the worker, the Node build in tests).
// No DOM globals: this runs in a module worker.

import type * as ExcelJS from "exceljs";
import type { IWorkbookData } from "@univerjs/presets";

export type { SheetLossyItem } from "@/lib/sheets/types";

/** The ExcelJS module, whichever build supplied it. */
export type ExcelJSModule = typeof import("exceljs");

/** Why a file could not be read or written. */
export type XlsxErrorCode = "unsupported" | "too_large" | "too_many_cells" | "encrypted" | "corrupt" | "timeout";

/**
 * A spreadsheet file that cannot be read (or a workbook that cannot be written). Defined here rather than in
 * client.ts so the worker-side mappers can throw it without pulling in the DOM-side client.
 */
export class SpreadsheetReadError extends Error {
  readonly code: XlsxErrorCode;
  constructor(code: XlsxErrorCode, message?: string) {
    super(message ?? `Spreadsheet file error (${code})`);
    this.name = "SpreadsheetReadError";
    this.code = code;
  }
}

// ── Data validation and conditional formatting (runtime shapes the typings lack) ────────────────

/**
 * ExcelJS reads a rule without a type as "any" and writes whatever `type` it is given ("time" included),
 * so the type is wider than the 4.4.0 typings. A "date" formula may be a Date: the writer converts it
 * with dateToExcel(new Date(formula)).
 */
export type ExcelDataValidationType = ExcelJS.DataValidation["type"] | "time" | "any";

export interface ExcelDataValidation extends Omit<ExcelJS.DataValidation, "type" | "formulae"> {
  type: ExcelDataValidationType;
  formulae: Array<string | number | Date>;
}

/** `Worksheet.dataValidations` (lib/doc/data-validations.js): one key per address or range. */
export interface ExcelDataValidations {
  model: Record<string, ExcelDataValidation | undefined>;
  add(address: string, dv: ExcelDataValidation): ExcelDataValidation;
}

export interface ExcelWorksheetFeatures {
  dataValidations: ExcelDataValidations;
  conditionalFormattings: ExcelJS.ConditionalFormattingOptions[];
}

/**
 * The worksheet's data validations and conditional formattings. Both exist at runtime
 * (lib/doc/worksheet.js) but not in the typings; a worksheet without them is not one ExcelJS made.
 */
export function worksheetFeatures(ws: ExcelJS.Worksheet): ExcelWorksheetFeatures {
  const features = ws as unknown as Partial<ExcelWorksheetFeatures>;
  const dv = features.dataValidations;
  const cf = features.conditionalFormattings;
  if (!dv || typeof dv !== "object" || typeof dv.add !== "function" || !isRecord(dv.model) || !Array.isArray(cf)) {
    throw new SpreadsheetReadError("corrupt", "Unexpected worksheet shape");
  }
  return { dataValidations: dv, conditionalFormattings: cf };
}

/** Every `cellIs` operator the writer and reader handle (the typings list four). */
export type ExcelCellIsOperator =
  | "equal" | "notEqual" | "greaterThan" | "greaterThanOrEqual" | "lessThan" | "lessThanOrEqual" | "between" | "notBetween";

export interface ExcelCellIsRule extends Omit<ExcelJS.CellIsRuleType, "operator" | "formulae"> {
  operator: ExcelCellIsOperator;
  formulae: string[];
}

/** A threshold: `formula` thresholds carry the formula text (the typings say number). */
export interface ExcelCfvo {
  type: ExcelJS.CfvoTypes;
  value?: number | string;
}

/** The writer renders `color` for a data bar (databar-xform.js); the typings leave it out. */
export interface ExcelDataBarRule extends Omit<ExcelJS.DataBarRuleType, "cfvo"> {
  cfvo: ExcelCfvo[];
  color: Partial<ExcelJS.Color>;
}

export interface ExcelColorScaleRule extends Omit<ExcelJS.ColorScaleRuleType, "cfvo"> {
  cfvo: ExcelCfvo[];
}

/** A time-period rule with its formula given: the writer then skips its own, built from a parsed `ref`. */
export interface ExcelTimePeriodRule extends ExcelJS.TimePeriodRuleType {
  formulae: string[];
}

export type ExcelCfRule =
  | ExcelJS.ConditionalFormattingRule
  | ExcelCellIsRule
  | ExcelDataBarRule
  | ExcelColorScaleRule
  | ExcelTimePeriodRule;

export interface ExcelConditionalFormatting {
  ref: string;
  rules: ExcelCfRule[];
}

/** `ws.addConditionalFormatting` with the runtime-accurate rule shapes above. */
export function addConditionalFormatting(ws: ExcelJS.Worksheet, cf: ExcelConditionalFormatting): void {
  ws.addConditionalFormatting(cf as ExcelJS.ConditionalFormattingOptions);
}

// ── Cells and colours ────────────────────────────────────────────────────────────────────────────

/** An array formula master (cell-xform.js renders `t="array" ref=…`). */
export type ExcelArrayFormulaValue = ExcelJS.CellFormulaValue & { shareType: "array"; ref: string };

/** An ExcelJS colour as the reader delivers it: `indexed` and `tint` exist at runtime only. */
export type ExcelColorLike = Partial<ExcelJS.Color> & { indexed?: number; tint?: number };

// ── Plain data helpers ───────────────────────────────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The parsed JSON of the workbook resource `name`, or undefined (absent, empty or unparsable). Resources are
 * sanitized before any workbook reaches Univer, but their data is still untrusted: callers narrow it.
 */
export function readWorkbookResource(wb: IWorkbookData, name: string): unknown {
  const list = Array.isArray(wb.resources) ? wb.resources : [];
  for (const item of list) {
    if (!isRecord(item) || item.name !== name || typeof item.data !== "string" || item.data === "") continue;
    try {
      return JSON.parse(item.data) as unknown;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
