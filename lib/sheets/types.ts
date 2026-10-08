// Sheets client domain types (sheets.md §4.1, §8, §8.1, §11.8). Type-only: no Univer runtime.

import type { IWorkbookData } from "@univerjs/presets";
import type { DocSyncStatus } from "@/lib/docs/sync-types";

/**
 * One persisted Univer mutation as it travels through the op log. Built by capture (JSON-cloned params)
 * and checked on receive by acceptRemoteOp (lib/sheets/univer/mutation-filter.ts): a decoded batch's items
 * are untrusted until then.
 */
export interface SheetOp {
  mutationId: string;
  params: Record<string, unknown>;
}

/** The JSON inside one gzipped `document_update.payload` row of a spreadsheet. */
export interface SheetOpBatch {
  v: 1;
  /** Univer model version of the writer (SHEET_APP_VERSION). A newer value stops the reader (update required). */
  app: string;
  /** = the pushSheetOps seq of this batch (1, 2, 3… per lease grant). */
  seq: number;
  ops: SheetOp[];
}

/** The JSON inside a gzipped spreadsheet snapshot or version state. */
export interface SheetSnapshotEnvelope {
  v: 1;
  app: string;
  wb: IWorkbookData;
}

/** Same states as the Docs provider, so the shared save-status chrome reads it unchanged. */
export type SheetSyncStatus = DocSyncStatus;

/** A selected range: 0-based, inclusive (Univer's IRange). */
export interface SheetSelection {
  sheetId: string;
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

/** The editor model the sync engine drives (Univer in the browser, a headless double in tests). */
export interface SheetModelAdapter {
  /** Replace the whole model. The caller has sanitized `data`. */
  load(data: IWorkbookData): void;
  /** Execute accepted + sanitized ops. failedAt = index of the first failing op, -1 when all applied. */
  applyRemote(ops: readonly SheetOp[]): { applied: number; failedAt: number };
  save(): IWorkbookData;
  /** save() with shared formulas materialized, for xlsx export. */
  saveForExport(): IWorkbookData;
  onLocalOp(listener: (op: SheetOp) => void): () => void;
  /** A local mutation that cannot be synced as an op: the holder compacts once the queue drains. */
  onNeedsSnapshot(listener: (mutationId: string) => void): () => void;
  setEditable(editable: boolean): void;
  getSelection(): SheetSelection | null;
  onSelectionChange(listener: (selection: SheetSelection | null) => void): () => void;
  highlightPeer(peer: { color: string; selection: SheetSelection } | null): void;
  dispose(): void;
}

/** Parts of a workbook an .xlsx round trip cannot keep; each maps to `sheets.lossy.items.<item>`. */
export type SheetLossyItem =
  | "charts" | "pivotTables" | "macros" | "sparklines" | "images" | "shapes" | "threadedComments" | "externalLinks"
  | "slicers" | "tables" | "protection" | "iconSets" | "filterCriteria" | "arrayFormulas" | "splitPanes"
  | "dataValidationLimit" | "unsupportedValidation" | "richLinks" | "definedNames";

/** Every SheetLossyItem, in the order the lossy dialogs list them. */
export const SHEET_LOSSY_ITEMS: readonly SheetLossyItem[] = [
  "charts", "pivotTables", "macros", "sparklines", "images", "shapes", "threadedComments", "externalLinks",
  "slicers", "tables", "protection", "iconSets", "filterCriteria", "arrayFormulas", "splitPanes",
  "dataValidationLimit", "unsupportedValidation", "richLinks", "definedNames",
];

/**
 * `[sheet.<code>]` codes: the module's SheetErrorCode (spacetimedb/src/drive/sheet-logic.ts) plus the client's
 * `offline` (no live connection when a sheet reducer was called).
 */
export type SheetErrorCode =
  | "lease" | "not_sheet" | "stale" | "too_large" | "invalid" | "sequence" | "quota" | "versions_full" | "offline";

/** A `document_version_state` row: the bytes of one sheet version (the `document_version` row keeps the metadata). */
export interface SheetVersionStateRow {
  versionId: string;
  documentId: string;
  organizationId: string;
  state: Uint8Array;
  byteLength: number;
}
