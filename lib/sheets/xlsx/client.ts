// The main-thread side of spreadsheet file IO (sheets.md §11.1, §11.6): picks the file kind and caps,
// starts the xlsx module worker (a capability probe: it must post "ready" within 5 s, else this tab stops
// trying and reads in-thread), sends one request per worker and terminates it when the answer comes or the
// 60 s timeout passes. Without a worker the same request handler runs in-thread on the bare ExcelJS build,
// so no global polyfills land on the page; there a timeout rejects but cannot stop the work already running.
// No heavy import is static: protocol.ts and ExcelJS load only for the fallback.

import type { IWorkbookData } from "@univerjs/presets";
import { isCapacitorNative } from "@/lib/capacitor";
import {
  SHEET_CSV_MAX_BYTES, SHEET_IMPORT_MAX_BYTES, SHEET_IMPORT_MAX_CELLS, SHEET_IMPORT_MAX_CELLS_COARSE, XLSM_MIME, XLSX_MIME,
} from "@/lib/sheets/constants";
import type { SheetLossyItem } from "@/lib/sheets/types";
import type { SpreadsheetFileKind, XlsxWorkerRequest, XlsxWorkerResponse } from "./protocol";
import { isRecord, SpreadsheetReadError, type ExcelJSModule, type XlsxErrorCode } from "./types";

export { SpreadsheetReadError } from "./types";
export type { SpreadsheetFileKind } from "./protocol";

export interface SpreadsheetReadResult {
  title: string;
  /** The encoded, sanitized snapshot (createSheetFromState / session.replaceContent). */
  state: Uint8Array;
  plainText: string;
  cellCount: number;
  sheetCount: number;
  lossy: SheetLossyItem[];
}

/** sessionStorage flag: the xlsx worker failed to start in this tab, so files are read in-thread. */
export const XLSX_WORKER_DISABLED_KEY = "merchiva.sheets.noXlsxWorker";
export const XLSX_WORKER_READY_MS = 5000;
export const XLSX_READ_TIMEOUT_MS = 60_000;
export const XLSX_WRITE_TIMEOUT_MS = 60_000;

/**
 * too_large is only ever the file's own size (its message shows the size and spreadsheetMaxBytes); every cap
 * on what the file holds (cells, inflated bytes, parts, sheets, the encoded snapshot) is too_many_cells.
 */
const ERROR_KEYS: Readonly<Record<XlsxErrorCode, string>> = {
  unsupported: "sheets.import.unsupported",
  too_large: "sheets.import.tooLarge",
  too_many_cells: "sheets.import.tooManyCells",
  encrypted: "sheets.import.encrypted",
  corrupt: "sheets.import.failed",
  timeout: "sheets.import.failed",
};

type ResultResponse = Extract<XlsxWorkerResponse, { type: "result" }>;

let nextRequestId = 1;

/** The kind of an import file by extension (then MIME type), or null when it is neither .xlsx/.xlsm nor .csv. */
export function spreadsheetKind(file: { name: string; type?: string }): SpreadsheetFileKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return "xlsx";
  if (name.endsWith(".csv")) return "csv";
  if (/\.[a-z0-9]{1,8}$/.test(name)) return null;
  if (file.type === XLSX_MIME || file.type === XLSM_MIME) return "xlsx";
  return file.type === "text/csv" ? "csv" : null;
}

/** The largest file of a kind (the {max} of sheets.import.tooLarge). */
export function spreadsheetMaxBytes(kind: SpreadsheetFileKind): number {
  return kind === "csv" ? SHEET_CSV_MAX_BYTES : SHEET_IMPORT_MAX_BYTES;
}

/** Cells an import may hold on this device: fewer on touch devices and in the native app, where workers share the page's memory. */
export function importCellLimit(): number {
  if (typeof window === "undefined") return SHEET_IMPORT_MAX_CELLS;
  let coarse = false;
  try {
    coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    coarse = false;
  }
  return coarse || isCapacitorNative() ? SHEET_IMPORT_MAX_CELLS_COARSE : SHEET_IMPORT_MAX_CELLS;
}

/** The i18n key of a read failure (`sheets.import.*`); anything that is not a SpreadsheetReadError reads as failed. */
export function spreadsheetReadErrorKey(err: unknown): string {
  return err instanceof SpreadsheetReadError ? ERROR_KEYS[err.code] : ERROR_KEYS.corrupt;
}

function workerDisabled(): boolean {
  try {
    return window.sessionStorage.getItem(XLSX_WORKER_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function disableWorker(): void {
  try {
    window.sessionStorage.setItem(XLSX_WORKER_DISABLED_KEY, "1");
  } catch {
    // Storage blocked: the next file tries the worker again.
  }
}

/** A started xlsx worker (it posted "ready"), or null: no Worker, disabled for this tab, or it failed to start. */
export async function createXlsxWorker(): Promise<Worker | null> {
  if (typeof window === "undefined" || typeof Worker === "undefined" || workerDisabled()) return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./xlsx.worker.ts", import.meta.url), { type: "module" });
  } catch {
    disableWorker();
    return null;
  }
  return new Promise<Worker | null>((resolve) => {
    const settle = (ok: boolean) => {
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onFail);
      worker.removeEventListener("messageerror", onFail);
      if (ok) return resolve(worker);
      worker.terminate();
      disableWorker();
      resolve(null);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isRecord(event.data) && event.data.type === "ready") settle(true);
    };
    const onFail = () => settle(false);
    const timer = window.setTimeout(onFail, XLSX_WORKER_READY_MS);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onFail);
    worker.addEventListener("messageerror", onFail);
  });
}

function isResult(value: unknown, id: number): value is ResultResponse {
  return isRecord(value) && value.type === "result" && value.id === id && typeof value.ok === "boolean";
}

function runInWorker(worker: Worker, request: XlsxWorkerRequest, transfer: Transferable[], timeoutMs: number): Promise<ResultResponse> {
  return new Promise<ResultResponse>((resolve, reject) => {
    const finish = (settle: () => void) => {
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onError);
      worker.terminate();
      settle();
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (isResult(data, request.id)) finish(() => resolve(data));
    };
    const onError = () => finish(() => reject(new SpreadsheetReadError("corrupt")));
    const timer = window.setTimeout(() => finish(() => reject(new SpreadsheetReadError("timeout"))), timeoutMs);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onError);
    worker.postMessage(request, transfer);
  });
}

async function runInThread(request: XlsxWorkerRequest, timeoutMs: number): Promise<ResultResponse> {
  const [excel, protocol] = await Promise.all([import("exceljs/dist/exceljs.bare.min.js"), import("./protocol")]);
  const work = protocol.handleXlsxRequest(excel.default as ExcelJSModule, request).then(({ response }) => response);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new SpreadsheetReadError("timeout")), timeoutMs);
  });
  try {
    const response = await Promise.race([work, timeout]);
    if (!isResult(response, request.id)) throw new SpreadsheetReadError("corrupt");
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function run(request: XlsxWorkerRequest, transfer: Transferable[], timeoutMs: number): Promise<ResultResponse> {
  const worker = await createXlsxWorker();
  return worker ? runInWorker(worker, request, transfer, timeoutMs) : runInThread(request, timeoutMs);
}

/** `first` (the app's language), then the browser's, once each: what a CSV's legacy encoding is guessed from. */
function csvLanguages(first: readonly string[] = []): string[] {
  const browser = typeof navigator === "undefined" ? []
    : Array.isArray(navigator.languages) ? navigator.languages : navigator.language ? [navigator.language] : [];
  return [...new Set([...first, ...browser].filter((tag) => typeof tag === "string" && tag !== ""))];
}

/**
 * Reads an .xlsx / .xlsm / .csv file into an encoded, sanitized snapshot. `locale` is the Univer locale of
 * the new workbook, `sheetName` the name of a sheet the file cannot name, `languages` the language tags a
 * CSV in a legacy encoding is decoded for first (the app's; the browser's follow). Rejects with SpreadsheetReadError.
 */
export async function readSpreadsheetFile(
  file: File,
  opts: { locale: string; sheetName: string; maxCells?: number; languages?: readonly string[] },
): Promise<SpreadsheetReadResult> {
  const kind = spreadsheetKind(file);
  if (!kind) throw new SpreadsheetReadError("unsupported");
  if (file.size > spreadsheetMaxBytes(kind)) throw new SpreadsheetReadError("too_large");
  if (file.size === 0) throw new SpreadsheetReadError("corrupt", "Empty file");
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new SpreadsheetReadError("corrupt", "The file could not be read");
  }
  const request: XlsxWorkerRequest = {
    type: "read",
    id: nextRequestId++,
    bytes,
    fileName: file.name,
    kind,
    locale: opts.locale,
    sheetName: opts.sheetName,
    maxCells: opts.maxCells ?? importCellLimit(),
    languages: csvLanguages(opts.languages),
  };
  const response = await run(request, [bytes], XLSX_READ_TIMEOUT_MS);
  if (!response.ok) throw new SpreadsheetReadError(response.error);
  const { state, summary } = response;
  if (!(state instanceof Uint8Array) || !summary) throw new SpreadsheetReadError("corrupt");
  return {
    title: summary.title,
    state,
    plainText: summary.plainText,
    cellCount: summary.cellCount,
    sheetCount: summary.sheetCount,
    lossy: response.lossy,
  };
}

/** The .xlsx file of a workbook (adapter.saveForExport()), and what it leaves out. Rejects with SpreadsheetReadError. */
export async function writeXlsx(wb: IWorkbookData): Promise<{ blob: Blob; lossy: SheetLossyItem[] }> {
  const response = await run({ type: "write", id: nextRequestId++, wb }, [], XLSX_WRITE_TIMEOUT_MS);
  if (!response.ok) throw new SpreadsheetReadError(response.error);
  if (!(response.bytes instanceof Uint8Array)) throw new SpreadsheetReadError("corrupt");
  return { blob: new Blob([response.bytes as Uint8Array<ArrayBuffer>], { type: XLSX_MIME }), lossy: response.lossy };
}
