// Lookups built from the storage-accounting rows (lib/drive/mappers.ts mapAppFile / mapDocumentSize), for sizes
// next to documents and app files and the per-app totals of "Stored in apps". Pure.

import type { AppFileSource } from "@/lib/storage/sources";
import type { AppFileRecord, DocumentSize } from "./types";

/** What Drive shows for one app file, found by appFileKeyHash(url) (lib/storage/uploadthing-key.ts). */
export interface AppFileSize { sizeBytes: number; source: AppFileSource; mimeType: string }

/** Document id → its content plus kept versions (`document_size.bytes` already holds both), for `organizationId`. */
export function documentSizeMap(sizes: readonly DocumentSize[], organizationId: string | null): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  if (!organizationId) return map;
  for (const size of sizes) {
    if (size.organizationId !== organizationId || !size.documentId) continue;
    map.set(size.documentId, size.bytes);
  }
  return map;
}

export interface AppFileLookups {
  /** keyHash → size, source and type. */
  appFileSizes: ReadonlyMap<string, AppFileSize>;
  /** Bytes per source over every app file of the store, including sources with nothing listable in Drive. */
  appBytesBySource: ReadonlyMap<AppFileSource, number>;
}

/**
 * `appBytesTotal` is org_storage_usage.appBytes. Chat attachments have no readable row (the module keeps them in
 * the private app_file_private), so whatever the total holds beyond the listed rows is chat: it shows as the
 * "chat" total and never as a file.
 */
export function appFileLookups(
  files: readonly AppFileRecord[],
  organizationId: string | null,
  appBytesTotal: number | null = null,
): AppFileLookups {
  const appFileSizes = new Map<string, AppFileSize>();
  const appBytesBySource = new Map<AppFileSource, number>();
  if (!organizationId) return { appFileSizes, appBytesBySource };
  let listed = 0;
  for (const file of files) {
    if (file.organizationId !== organizationId || !file.keyHash) continue;
    appFileSizes.set(file.keyHash, { sizeBytes: file.sizeBytes, source: file.source, mimeType: file.mimeType });
    appBytesBySource.set(file.source, (appBytesBySource.get(file.source) ?? 0) + file.sizeBytes);
    listed += file.sizeBytes;
  }
  const unlisted = appBytesTotal === null ? 0 : appBytesTotal - listed;
  if (unlisted > 0) appBytesBySource.set("chat", (appBytesBySource.get("chat") ?? 0) + unlisted);
  return { appFileSizes, appBytesBySource };
}
