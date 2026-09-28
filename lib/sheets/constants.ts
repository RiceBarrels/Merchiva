// Sheets editor constants (sheets.md §4.9, §8). Pure: no Univer runtime, no React.
//
// The server limits live in spacetimedb/src/drive/sheet-logic.ts and the Docs block of
// spacetimedb/src/index.ts; every mirror below is checked against them by
// scripts/tests/sheets/lease-parity.test.ts.

/** Univer unit id of every spreadsheet. Ops carry it as `params.unitId`, so a copy replays the same log. */
export const SHEET_UNIT_ID = "merchiva-sheet";
/** Unit id of the read-only version preview (sheets.md §10.7). Ops for it are never captured. */
export const SHEET_PREVIEW_UNIT_ID = "merchiva-sheet-preview";
/** Univer model version written into every snapshot envelope and op batch (`app`). */
export const SHEET_APP_VERSION = "1.0.2";

/** Client timings and size caps of the sync engine. The byte caps mirror the server (parity-tested). */
export const SHEET_TUNING = {
  pushDebounceMs: 150,
  pushMaxWaitMs: 1000,
  retryBaseMs: 1000,
  retryMaxMs: 30_000,
  compactMaxRows: 150,
  compactMaxBytes: 1_048_576,
  compactMinIntervalMs: 30_000,
  compactIdleMs: 20_000,
  autoVersionIntervalMs: 600_000,
  presenceHeartbeatMs: 15_000,
  presenceThrottleMs: 1000,
  /** = DOC_UPDATE_MAX_BYTES: one pushed op batch, compressed. */
  updateMaxBytes: 1_048_576,
  /** = DOC_STATE_MAX_BYTES: one snapshot or version state, compressed. */
  stateMaxBytes: 8_388_608,
  /** Snapshot size that raises the "getting large" banner. */
  stateWarnBytes: 6_291_456,
  /** = SHEET_LOG_MAX_BYTES: Σ op-log bytes of one sheet before a compaction is required. */
  logMaxBytes: 16_777_216,
} as const;
export type SheetTuning = { -readonly [K in keyof typeof SHEET_TUNING]: number };

/**
 * The formula engine runs in a module Web Worker (lib/sheets/univer/formula.worker.ts). It needs
 * `@univerjs/engine-formula` as a direct dependency, which landed at exactly 1.0.2 (W0.0).
 */
export const FORMULA_WORKER_ENABLED = true;

/** Largest .xlsx / .xlsm accepted for import. */
export const SHEET_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
/** Largest .csv accepted for import. */
export const SHEET_CSV_MAX_BYTES = 10 * 1024 * 1024;
/** Cells an import may hold on a fine pointer (desktop). */
export const SHEET_IMPORT_MAX_CELLS = 2_000_000;
/** Cells an import may hold on a coarse pointer or inside the native app (WebKit workers share the page process). */
export const SHEET_IMPORT_MAX_CELLS_COARSE = 300_000;
/** Σ actually inflated bytes of the xlsx parts the prescan reads. */
export const SHEET_IMPORT_MAX_INFLATED_BYTES = 200 * 1024 * 1024;
/** Largest encoded snapshot an import may produce (below stateMaxBytes, so the first edits still fit). */
export const SHEET_IMPORT_MAX_STATE_BYTES = 6 * 1024 * 1024;

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const XLSM_MIME = "application/vnd.ms-excel.sheet.macroEnabled.12";
export const CSV_MIME = "text/csv";
/** `accept` of the import file inputs. */
export const SHEET_ACCEPT = [".xlsx", ".xlsm", ".csv", XLSX_MIME, XLSM_MIME, CSV_MIME].join(",");

/** = SHEET_ORG_MAX_BYTES (server bigint): Σ sheet bytes per organization. */
export const SHEET_ORG_MAX_BYTES = 268_435_456;
/** = SHEET_VERSION_AUTO_KEEP: autosaved versions kept per sheet. */
export const SHEET_VERSION_AUTO_KEEP = 10;
/** = SHEET_VERSION_MAX_BYTES: Σ version-state bytes of one sheet. */
export const SHEET_VERSION_MAX_BYTES = 67_108_864;
/** = DOC_TEXT_MAX_CHARS: the search text stored with a snapshot (UTF-16 units). */
export const SHEET_TEXT_MAX_CHARS = 200_000;
