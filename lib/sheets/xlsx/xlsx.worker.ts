// The xlsx module worker (sheets.md §11.1): reads .xlsx / .csv files and writes .xlsx files off the main
// thread with the bare ExcelJS build (UMD, no core-js polyfills; the S0 spike loaded it in a module worker
// under Turbopack dev and the static export). It posts { type: "ready" } once loaded, so client.ts can tell a
// worker that started from one that failed to; client.ts terminates it after one request or at its timeout.

import ExcelJS from "exceljs/dist/exceljs.bare.min.js";
import { handleXlsxRequest, isXlsxWorkerRequest, type XlsxWorkerResponse } from "./protocol";
import type { ExcelJSModule } from "./types";

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: XlsxWorkerResponse, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;
const lib = ExcelJS as ExcelJSModule;

scope.onmessage = (event) => {
  const request = event.data;
  if (!isXlsxWorkerRequest(request)) return;
  handleXlsxRequest(lib, request)
    .then(({ response, transfer }) => scope.postMessage(response, transfer))
    .catch(() => scope.postMessage({ type: "result", id: request.id, ok: false, error: "corrupt" }));
};

scope.postMessage({ type: "ready" });
