// Drive UI model: the storage meter's breakdown — what the store's used storage is made of, one row per part
// of StorageBreakdown (lib/drive/types.ts). Shared by the manager meter's tooltip and the lite app's rows. Pure.

import type { DriveUsageView } from "@/lib/drive/types";

export const STORAGE_BREAKDOWN_PARTS = ["files", "documents", "sheets", "apps"] as const;
export type StorageBreakdownPart = (typeof STORAGE_BREAKDOWN_PARTS)[number];

export interface StorageBreakdownRow {
  readonly part: StorageBreakdownPart;
  /** drive.storage.breakdown.<part>. */
  readonly labelKey: string;
  /** null when the part is not measured (a module without the storage-accounting tables): shown as unknown. */
  readonly bytes: number | null;
}

const bytesOf = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/**
 * The four parts in a fixed order; a view without a breakdown knows its Drive files and Sheets only. "documents"
 * is org docBytes, which the module also charges with Forms (definitions and stored answers); its label says so.
 */
export function storageBreakdownRows(usage: Pick<DriveUsageView, "usedBytes" | "reservedBytes" | "sheetBytes"> & {
  breakdown?: DriveUsageView["breakdown"];
}): StorageBreakdownRow[] {
  const b = usage.breakdown ?? {
    files: bytesOf(usage.usedBytes) + bytesOf(usage.reservedBytes),
    documents: null,
    sheets: bytesOf(usage.sheetBytes),
    apps: null,
  };
  return STORAGE_BREAKDOWN_PARTS.map((part) => {
    const value = b[part];
    return { part, labelKey: `drive.storage.breakdown.${part}`, bytes: value === null ? null : bytesOf(value) };
  });
}

/** Whether every part is measured, so the breakdown may claim it covers everything the store keeps. */
export function storageBreakdownComplete(rows: readonly StorageBreakdownRow[]): boolean {
  return rows.every((row) => row.bytes !== null);
}
