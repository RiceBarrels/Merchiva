"use client";

// Sheets read hooks (sheets.md §7.2). An open spreadsheet's live rows (snapshot, op log, presence, edit lease) are
// subscribed by its SheetSyncSession through lib/sheets/sync/connection.ts, not here; this file answers "are
// spreadsheets published?" and loads the bytes of one saved version for preview and restore.
//
// Works before `spacetime generate` and against a module without the sheet tables: the status is `not_published`,
// nothing is subscribed, and useSheetVersionState is ready with no state.

import { useCallback, useState, useSyncExternalStore } from "react";
import { DocsBackendMonitor, type DocsBackendStatus, type DocsProbeConnection } from "@/lib/docs/backend-probe";
import { isDocumentId } from "@/lib/docs/ids";
import { mapVersionState } from "@/lib/sheets/mappers";
import { sheetsProbeQueries } from "@/lib/sheets/queries";
import { tables } from "@/lib/spacetimedb/generated";
import { useTable } from "@/lib/spacetimedb/hooks";
import { DOCS_BINDINGS_GENERATED, useLiveSpacetimeConnection } from "@/lib/spacetimedb/hooks/useDocs";

// ── Backend availability ─────────────────────────────────────────────────────

const SHEET_TABLE_ACCESSORS = ["documentEditLease", "documentVersionState"] as const;

/** Whether `lib/spacetimedb/generated` contains the sheet tables (and the Docs tables they build on). */
export const SHEETS_BINDINGS_GENERATED: boolean =
  DOCS_BINDINGS_GENERATED &&
  SHEET_TABLE_ACCESSORS.every((accessor) => Boolean((tables as unknown as Record<string, unknown>)[accessor]));

// Same monitor as Docs with the Sheets query set: a module with Docs but without the sheet tables reports
// not_published here only.
const backendMonitor = new DocsBackendMonitor({ bindingsGenerated: SHEETS_BINDINGS_GENERATED, queries: sheetsProbeQueries });

const getServerBackendStatus = (): DocsBackendStatus => (SHEETS_BINDINGS_GENERATED ? "checking" : "not_published");

/** Whether spreadsheets can be used against the current SpacetimeDB connection. */
export function useSheetsBackendStatus(): DocsBackendStatus {
  const conn: DocsProbeConnection | null = useLiveSpacetimeConnection();
  const subscribe = useCallback((onChange: () => void) => backendMonitor.subscribe(conn, onChange), [conn]);
  const getSnapshot = useCallback((): DocsBackendStatus => backendMonitor.status(conn), [conn]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerBackendStatus);
}

// ── Version bytes ────────────────────────────────────────────────────────────

type RowsResult = readonly [readonly unknown[], boolean];

/** Nothing to subscribe: no rows and nothing to wait for. */
const DISABLED: RowsResult = Object.freeze([Object.freeze([]), true] as const);
/** Subscribed, but this version's rows have not arrived yet. */
const WAITING: RowsResult = Object.freeze([Object.freeze([]), false] as const);

interface Phase {
  /** The version id the last render subscribed to (null: none). */
  versionId: string | null;
  /** One disabled render between two ids, which resets useTable's `applied` flag. */
  resetting: boolean;
  /** What useTable returned when this phase began: the previous query's snapshot, which never counts. */
  stale: unknown;
}

/**
 * `document_version_state WHERE version_id = <id>`: one row, the primary key. spacetimedb/react useTable returns the
 * previous query's snapshot on the render where the query or `enabled` changes, and never resets its `applied` flag
 * on a query change while enabled, so — as useScopedDocTable in lib/spacetimedb/hooks.ts does — the tuple returned
 * when a phase begins never counts, and a switch between two ids goes through one disabled render first.
 */
function useVersionStateRows(versionId: string | null): RowsResult {
  const [phase, setPhase] = useState<Phase>(() => ({ versionId, resetting: false, stale: null }));
  const moved = phase.versionId !== versionId;
  const resetting = moved ? versionId !== null && phase.versionId !== null && !phase.resetting : phase.resetting;
  const result = useTable(tables.documentVersionState.where((row) => row.versionId.eq(versionId ?? "")), {
    enabled: versionId !== null && !resetting,
  });
  if (moved) setPhase({ versionId, resetting, stale: result });
  // A new snapshot while resetting: the disabled render committed and its effect reset `applied`. Subscribe now.
  else if (resetting && result !== phase.stale) setPhase({ versionId, resetting: false, stale: result });
  if (versionId === null) return DISABLED;
  return moved || resetting || result === phase.stale ? WAITING : result;
}

// Without the bindings `tables.documentVersionState` does not exist: never subscribe (a module constant, so the
// hook order never changes).
const useVersionStateRowsIfGenerated: (versionId: string | null) => RowsResult = SHEETS_BINDINGS_GENERATED
  ? useVersionStateRows
  : () => DISABLED;

export interface SheetVersionState {
  /** The version's encodeSheetSnapshot bytes; null while loading, and when there is no such version (or no access). */
  state: Uint8Array | null;
  isReady: boolean;
}

/**
 * The bytes of one sheet version (`document_version_state`, reader-scoped). `versionId` null or not a version id →
 * ready with no state; the sheet tables not published → the same.
 */
export function useSheetVersionState(versionId: string | null): SheetVersionState {
  const status = useSheetsBackendStatus();
  const id = versionId && isDocumentId(versionId) ? versionId.toLowerCase() : null;
  const [rows, rowsReady] = useVersionStateRowsIfGenerated(status === "ready" ? id : null);
  if (id === null || status === "not_published") return { state: null, isReady: true };
  if (status !== "ready") return { state: null, isReady: false };
  // At most one row (the primary key); `state` keeps the cached row's byte array, so it is stable across renders.
  for (const raw of rows) {
    const row = mapVersionState(raw);
    if (row.versionId === id) return { state: row.state, isReady: true };
  }
  return { state: null, isReady: rowsReady };
}
