// The xlsx worker's protocol (sheets.md §11.1) and the one function that answers a request, shared by the
// module worker (xlsx.worker.ts) and client.ts's in-thread fallback, which both hand it the bare ExcelJS
// build. A read runs prescan → ExcelJS → import → sanitize → encode, so the main thread receives an encoded,
// sanitized snapshot plus its search text and never touches the file's bytes again; a write returns the
// .xlsx bytes. Both transfer their buffers. No DOM globals.

import type * as ExcelJS from "exceljs";
import type { IWorkbookData, LocaleType } from "@univerjs/presets";
import { encodeSheetSnapshot, SheetCodecError } from "@/lib/sheets/codec";
import {
  SHEET_CSV_MAX_BYTES, SHEET_IMPORT_MAX_BYTES, SHEET_IMPORT_MAX_INFLATED_BYTES, SHEET_IMPORT_MAX_STATE_BYTES,
} from "@/lib/sheets/constants";
import { sanitizeWorkbookData } from "@/lib/sheets/sanitize";
import { serializeSheetText } from "@/lib/sheets/serialize-text";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { csvToWorkbook, decodeCsvBytes, parseCsv } from "./csv";
import { exportXlsxBytes, safeSheetName } from "./export-workbook";
import { importExcelWorkbook } from "./import-workbook";
import { orderedLossy } from "./lossy";
import { prescanXlsx } from "./prescan";
import { isRecord, SpreadsheetReadError, type ExcelJSModule, type XlsxErrorCode } from "./types";

export type { XlsxErrorCode } from "./types";

export type SpreadsheetFileKind = "xlsx" | "csv";

/** What a read produced besides the encoded snapshot. */
export interface ReadSummary {
  /** The file name without its extension. */
  title: string;
  sheetCount: number;
  /** Non-empty cells (the document's wordCount). */
  cellCount: number;
  /** The search text stored with the snapshot (serializeSheetText). */
  plainText: string;
}

export type XlsxWorkerRequest =
  | {
    type: "read"; id: number; bytes: ArrayBuffer; fileName: string; kind: SpreadsheetFileKind;
    /** Univer locale of the new workbook. */
    locale: string;
    /** Name of a sheet whose own is unusable (a CSV's, when the file name gives none). */
    sheetName: string;
    maxCells: number;
    /** App language tags, for decoding a CSV in a legacy encoding. */
    languages?: string[];
  }
  | { type: "write"; id: number; wb: IWorkbookData };

export type XlsxWorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; ok: true; state?: Uint8Array; summary?: ReadSummary; bytes?: Uint8Array; lossy: SheetLossyItem[] }
  | { type: "result"; id: number; ok: false; error: XlsxErrorCode };

/** A file name without its extension (and path), trimmed. */
export function spreadsheetTitle(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  return base.replace(/\.(xlsx|xlsm|csv)$/i, "").trim();
}

interface ReadInput {
  fileName: string;
  kind: SpreadsheetFileKind;
  locale: string;
  sheetName: string;
  maxCells: number;
  languages?: string[];
}

async function readWorkbook(ExcelJSLib: ExcelJSModule, bytes: Uint8Array, input: ReadInput): Promise<{ wb: IWorkbookData; lossy: Set<SheetLossyItem> }> {
  const title = spreadsheetTitle(input.fileName);
  const locale = input.locale as LocaleType;
  if (input.kind === "csv") {
    if (bytes.length > SHEET_CSV_MAX_BYTES) throw new SpreadsheetReadError("too_large");
    const rows = parseCsv(decodeCsvBytes(bytes, input.languages), { maxCells: input.maxCells });
    const sheetName = safeSheetName(title, new Set(), input.sheetName);
    return { wb: csvToWorkbook(rows, { name: title, sheetName, locale }), lossy: new Set() };
  }
  if (bytes.length > SHEET_IMPORT_MAX_BYTES) throw new SpreadsheetReadError("too_large");
  const prescan = await prescanXlsx(bytes, { maxInflatedBytes: SHEET_IMPORT_MAX_INFLATED_BYTES, maxCells: input.maxCells });
  const workbook = new ExcelJSLib.Workbook();
  try {
    await workbook.xlsx.load(prescan.bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw new SpreadsheetReadError("corrupt");
  }
  const { wb, lossy } = importExcelWorkbook(ExcelJSLib, workbook, { name: title, locale, sheetName: input.sheetName, prescan });
  for (const item of prescan.lossy) lossy.add(item);
  return { wb, lossy };
}

/**
 * Reads a spreadsheet file into an encoded, sanitized snapshot. Rejects with SpreadsheetReadError (and
 * SheetCodecError when sanitizing finds the result too complex, which a response reports as too_many_cells).
 */
export async function readSpreadsheetBytes(
  ExcelJSLib: ExcelJSModule,
  bytes: Uint8Array,
  input: ReadInput,
): Promise<{ state: Uint8Array; summary: ReadSummary; lossy: SheetLossyItem[]; wb: IWorkbookData }> {
  const { wb, lossy } = await readWorkbook(ExcelJSLib, bytes, input);
  sanitizeWorkbookData(wb);
  const state = encodeSheetSnapshot(wb);
  // Too much content, not too large a file: too_large names the file's size (sheets.import.tooLarge).
  if (state.length > SHEET_IMPORT_MAX_STATE_BYTES) throw new SpreadsheetReadError("too_many_cells", "Too much content");
  const { plainText, cellCount } = serializeSheetText(wb);
  const summary: ReadSummary = { title: spreadsheetTitle(input.fileName), sheetCount: wb.sheetOrder.length, cellCount, plainText };
  return { state, summary, lossy: orderedLossy(lossy), wb };
}

function errorCode(err: unknown): XlsxErrorCode {
  if (err instanceof SpreadsheetReadError) return err.code;
  if (err instanceof SheetCodecError) return err.reason === "too_big" ? "too_many_cells" : "corrupt";
  return "corrupt";
}

/** A buffer the response can transfer: `bytes` itself when it spans its whole buffer, else a copy. */
function transferable(bytes: Uint8Array): Uint8Array {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer ? bytes : bytes.slice();
}

export function isXlsxWorkerRequest(value: unknown): value is XlsxWorkerRequest {
  if (!isRecord(value) || typeof value.id !== "number") return false;
  if (value.type === "write") return isRecord(value.wb);
  return value.type === "read" && value.bytes instanceof ArrayBuffer && typeof value.fileName === "string"
    && (value.kind === "xlsx" || value.kind === "csv") && typeof value.locale === "string"
    && typeof value.sheetName === "string" && typeof value.maxCells === "number";
}

/** Answers one request; `transfer` lists the buffers to move with the response. */
export async function handleXlsxRequest(
  ExcelJSLib: ExcelJSModule,
  request: XlsxWorkerRequest,
): Promise<{ response: XlsxWorkerResponse; transfer: ArrayBuffer[] }> {
  try {
    if (request.type === "write") {
      const { bytes, lossy } = await exportXlsxBytes(ExcelJSLib, request.wb);
      const out = transferable(bytes);
      return { response: { type: "result", id: request.id, ok: true, bytes: out, lossy: orderedLossy(lossy) }, transfer: [out.buffer as ArrayBuffer] };
    }
    const { state, summary, lossy } = await readSpreadsheetBytes(ExcelJSLib, new Uint8Array(request.bytes), request);
    const out = transferable(state);
    return { response: { type: "result", id: request.id, ok: true, state: out, summary, lossy }, transfer: [out.buffer as ArrayBuffer] };
  } catch (err) {
    return { response: { type: "result", id: request.id, ok: false, error: errorCode(err) }, transfer: [] };
  }
}
