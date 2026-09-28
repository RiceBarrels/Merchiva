// The storage meter's numbers, kept free of UI imports so pure code and tests can use them without loading the
// component library: used = stored + reserved by pending uploads, against the org's effective quota.

import type { DriveUsageView } from "@/lib/drive/types";
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

/** The meter's numbers: used = stored + reserved by pending uploads. */
export function storageFigures(usage: Pick<DriveUsageView, "usedBytes" | "reservedBytes" | "quotaBytes">): StorageFigures {
  const used = Math.max(0, usage.usedBytes) + Math.max(0, usage.reservedBytes);
  const total = Number.isFinite(usage.quotaBytes) && usage.quotaBytes > 0 ? usage.quotaBytes : 0;
  if (total === 0) return { used, total, percent: null, level: "ok" };
  const ratio = used / total;
  const level: StorageLevel = ratio >= 1 ? "full" : ratio >= STORAGE_WARN_RATIO ? "warning" : "ok";
  return { used, total, percent: Math.min(100, Math.round(ratio * 1000) / 10), level };
}

/**
 * The usage the meter shows: the store's `drive_usage` row, or, once Drive has loaded and no upload has created that
 * row yet, zero of the default quota, so a new store still sees how much it has. null while loading or unpublished.
 */
export function displayUsage(drive: { status: string; isReady: boolean; usage: DriveUsageView | null }): DriveUsageView | null {
  if (drive.usage) return drive.usage;
  if (drive.status !== "ready" || !drive.isReady) return null;
  return { usedBytes: 0, reservedBytes: 0, quotaBytes: DRIVE_DEFAULT_QUOTA_BYTES, fileCount: 0, sheetBytes: 0 };
}
