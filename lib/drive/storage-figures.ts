// The storage meter's numbers, kept free of UI imports so pure code and tests can use them without loading the
// component library: used = everything the store keeps (Drive files stored + reserved by pending uploads, Docs and
// Slides, Sheets, app files — StorageBreakdown.total), against the org's effective quota.

import type { DriveUsageView, StorageBreakdown } from "@/lib/drive/types";
import { DRIVE_DEFAULT_QUOTA_BYTES } from "@/lib/drive/rules";

/** Share of the quota from which the meter warns. */
export const STORAGE_WARN_RATIO = 0.9;

export type StorageLevel = "ok" | "warning" | "full";

export interface StorageFigures {
  used: number;
  total: number;
  /** 0–100, or null without a quota. */
  percent: number | null;
  level: StorageLevel;
}

/** Usage as the figures read it: a view with its breakdown, or Drive files alone (before the breakdown existed). */
export type StorageFiguresInput = Pick<DriveUsageView, "usedBytes" | "reservedBytes" | "quotaBytes"> & {
  breakdown?: Pick<StorageBreakdown, "total" | "quota">;
};

/** Bytes counted against the quota: the breakdown's total, else Drive files stored + reserved. */
export function storageUsedBytes(usage: Omit<StorageFiguresInput, "quotaBytes">): number {
  if (usage.breakdown) return Math.max(0, usage.breakdown.total);
  return Math.max(0, usage.usedBytes) + Math.max(0, usage.reservedBytes);
}

/** The meter's numbers: used = everything the store keeps, warning from STORAGE_WARN_RATIO of the quota. */
export function storageFigures(usage: StorageFiguresInput): StorageFigures {
  const used = storageUsedBytes(usage);
  const quota = usage.breakdown ? usage.breakdown.quota : usage.quotaBytes;
  const total = Number.isFinite(quota) && quota > 0 ? quota : 0;
  if (total === 0) return { used, total, percent: null, level: "ok" };
  const ratio = used / total;
  const level: StorageLevel = ratio >= 1 ? "full" : ratio >= STORAGE_WARN_RATIO ? "warning" : "ok";
  return { used, total, percent: Math.min(100, Math.round(ratio * 1000) / 10), level };
}

/**
 * The usage the meter shows: the store's usage rows, or, once Drive has loaded and no upload has created that
 * row yet, zero of the default quota, so a new store still sees how much it has. null while loading or unpublished.
 * `storageMeasured: false` (a module without the storage-accounting tables) leaves documents and apps unknown.
 */
export function displayUsage(drive: {
  status: string; isReady: boolean; usage: DriveUsageView | null; storageMeasured?: boolean;
}): DriveUsageView | null {
  if (drive.usage) return drive.usage;
  if (drive.status !== "ready" || !drive.isReady) return null;
  const quota = DRIVE_DEFAULT_QUOTA_BYTES;
  const known = drive.storageMeasured === false ? null : 0;
  const breakdown: StorageBreakdown = { files: 0, documents: known, sheets: 0, apps: known, total: 0, quota };
  return { usedBytes: 0, reservedBytes: 0, quotaBytes: quota, fileCount: 0, sheetBytes: 0, breakdown };
}
