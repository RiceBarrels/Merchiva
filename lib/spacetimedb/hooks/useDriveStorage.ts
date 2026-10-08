"use client";

// Storage accounting for Drive: the org's `org_storage_usage` row (Docs / Slides and app-file totals), its
// `app_file` rows and the `document_size` rows the reader may see. Used by useDrive only.
//
// Probed apart from Drive (lib/drive/queries.ts storageProbeQueries) so Drive keeps working against a module
// without these tables: the status is then `not_published`, nothing is subscribed, the org usage is null and
// every lookup is empty, so the breakdown counts only Drive files and Sheets.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DocsBackendMonitor, type DocsBackendStatus, type DocsProbeConnection } from "@/lib/docs/backend-probe";
import { mapAppFile, mapDocumentSize, mapOrgStorageUsage } from "@/lib/drive/mappers";
import { storageProbeQueries } from "@/lib/drive/queries";
import { appFileLookups, documentSizeMap, type AppFileLookups } from "@/lib/drive/storage-rows";
import type { OrgStorageUsage } from "@/lib/drive/types";
import { tables } from "@/lib/spacetimedb/generated";
import { useAppFileRows, useDocumentSizeRows, useOrgStorageUsageRows } from "@/lib/spacetimedb/hooks";
import { DOCS_BINDINGS_GENERATED, useLiveSpacetimeConnection } from "@/lib/spacetimedb/hooks/useDocs";

export const STORAGE_TABLE_ACCESSORS = ["appFile", "orgStorageUsage", "documentSize"] as const;

/** Whether `lib/spacetimedb/generated` contains the storage-accounting tables. */
export const STORAGE_BINDINGS_GENERATED: boolean =
  DOCS_BINDINGS_GENERATED &&
  STORAGE_TABLE_ACCESSORS.every((accessor) => Boolean((tables as unknown as Record<string, unknown>)[accessor]));

const storageMonitor = new DocsBackendMonitor({ bindingsGenerated: STORAGE_BINDINGS_GENERATED, queries: storageProbeQueries });

const getServerStorageStatus = (): DocsBackendStatus => (STORAGE_BINDINGS_GENERATED ? "checking" : "not_published");

/** Whether the connected module has the storage-accounting tables. */
export function useDriveStorageBackendStatus(enabled: boolean): DocsBackendStatus {
  const conn: DocsProbeConnection | null = useLiveSpacetimeConnection();
  const probeConn = enabled ? conn : null;
  const subscribe = useCallback((onChange: () => void) => storageMonitor.subscribe(probeConn, onChange), [probeConn]);
  const getSnapshot = useCallback((): DocsBackendStatus => storageMonitor.status(probeConn), [probeConn]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerStorageStatus);
}

export interface DriveStorageData extends AppFileLookups {
  /** True once the rows are in, or there is nothing to wait for (no scope, or a module without the tables). */
  settled: boolean;
  /** Whether the module has the tables, so a missing org_storage_usage row means 0 rather than unknown. */
  measured: boolean;
  /** null without the row (or the table). */
  orgUsage: OrgStorageUsage | null;
  /** Document id → content plus kept versions (`document_size`), only documents the reader may open. */
  documentSizes: ReadonlyMap<string, number>;
}

/** `organizationId`: the store to read, or null to read nothing (Drive gated off or unpublished). */
export function useDriveStorage(organizationId: string | null): DriveStorageData {
  const status = useDriveStorageBackendStatus(organizationId !== null);
  const scopedOrgId = status === "ready" ? organizationId : null;
  const [usageRows, usageReady]: readonly [readonly unknown[], boolean] = useOrgStorageUsageRows(scopedOrgId);
  const [appRows, appReady]: readonly [readonly unknown[], boolean] = useAppFileRows(scopedOrgId);
  const [sizeRows, sizesReady]: readonly [readonly unknown[], boolean] = useDocumentSizeRows(scopedOrgId);

  const orgUsage = useMemo(() => {
    for (const row of usageRows) {
      const mapped = mapOrgStorageUsage(row);
      if (mapped.organizationId === scopedOrgId) return mapped;
    }
    return null;
  }, [usageRows, scopedOrgId]);
  const documentSizes = useMemo(() => documentSizeMap(sizeRows.map((row) => mapDocumentSize(row)), scopedOrgId), [sizeRows, scopedOrgId]);
  const appBytesTotal = orgUsage?.appBytes ?? null;
  const lookups = useMemo(
    () => appFileLookups(appRows.map((row) => mapAppFile(row)), scopedOrgId, appBytesTotal),
    [appRows, scopedOrgId, appBytesTotal],
  );

  const settled =
    organizationId === null || status === "not_published" || (status === "ready" && usageReady && appReady && sizesReady);
  const measured = status === "ready";
  return useMemo(
    () => ({ settled, measured, orgUsage, documentSizes, appFileSizes: lookups.appFileSizes, appBytesBySource: lookups.appBytesBySource }),
    [settled, measured, orgUsage, documentSizes, lookups],
  );
}
