// The storage meter's numbers: "{used} of {total} used" on /manager/drive (nav column on wide screens, a compact
// line above the list below lg) and on the device app. A store that never uploaded has no drive_usage row yet; it
// must still see 0 of its quota once Drive has loaded, not nothing.

import { describe, expect, test } from "bun:test";
import { preflightUploads } from "@/components/drive/model/upload-plan";
import { toDriveUsageView } from "@/lib/drive/mappers";
import { displayUsage, storageFigures } from "@/lib/drive/storage-figures";
import { appFileLookups, documentSizeMap } from "@/lib/drive/storage-rows";
import { DRIVE_DEFAULT_QUOTA_BYTES } from "@/lib/drive/rules";
import type { AppFileRecord, DocumentSize, DriveUsage, DriveUsageView, OrgStorageUsage } from "@/lib/drive/types";

const GIB = 1024 ** 3;
const row: DriveUsageView = {
  usedBytes: 3 * GIB, reservedBytes: GIB, quotaBytes: 10 * GIB, fileCount: 12, sheetBytes: 0,
  breakdown: { files: 4 * GIB, documents: 0, sheets: 0, apps: 0, total: 4 * GIB, quota: 10 * GIB },
};
const ORG = "org-1";
const driveRow = (over: Partial<DriveUsage> = {}): DriveUsage => ({
  organizationId: ORG, bytesUsed: 3 * GIB, bytesReserved: GIB, fileCount: 12, itemCount: 14, quotaBytesOverride: 0,
  sheetBytes: GIB / 2, measuredBytes: 0, measuredCount: 0, measuredAt: new Date(0), updatedAt: new Date(0), ...over,
});
const orgRow = (over: Partial<OrgStorageUsage> = {}): OrgStorageUsage => ({
  organizationId: ORG, docBytes: 2 * GIB, docCount: 5, appBytes: GIB + GIB / 2, appFileCount: 40, updatedAt: new Date(0), ...over,
});

describe("displayUsage", () => {
  test("the store's row wins whenever it exists", () => {
    expect(displayUsage({ status: "ready", isReady: true, usage: row })).toBe(row);
    expect(displayUsage({ status: "checking", isReady: false, usage: row })).toBe(row);
  });

  test("no row yet: zero of the default quota once Drive is ready", () => {
    expect(displayUsage({ status: "ready", isReady: true, usage: null })).toEqual({
      usedBytes: 0, reservedBytes: 0, quotaBytes: DRIVE_DEFAULT_QUOTA_BYTES, fileCount: 0, sheetBytes: 0,
      breakdown: { files: 0, documents: 0, sheets: 0, apps: 0, total: 0, quota: DRIVE_DEFAULT_QUOTA_BYTES },
    });
  });

  test("nothing while loading or when the module has no Drive tables", () => {
    expect(displayUsage({ status: "ready", isReady: false, usage: null })).toBeNull();
    expect(displayUsage({ status: "checking", isReady: true, usage: null })).toBeNull();
    expect(displayUsage({ status: "not_published", isReady: true, usage: null })).toBeNull();
  });
});

describe("storageFigures", () => {
  test("used counts pending (reserved) bytes against the quota", () => {
    expect(storageFigures(row)).toEqual({ used: 4 * GIB, total: 10 * GIB, percent: 40, level: "ok" });
  });

  test("warning from 90%, full at 100% (percent capped)", () => {
    expect(storageFigures({ usedBytes: 9 * GIB, reservedBytes: 0, quotaBytes: 10 * GIB }).level).toBe("warning");
    expect(storageFigures({ usedBytes: 11 * GIB, reservedBytes: 0, quotaBytes: 10 * GIB })).toMatchObject({ level: "full", percent: 100 });
  });

  test("an empty store reads 0 of 10 GB", () => {
    const empty = displayUsage({ status: "ready", isReady: true, usage: null });
    expect(empty && storageFigures(empty)).toEqual({ used: 0, total: DRIVE_DEFAULT_QUOTA_BYTES, percent: 0, level: "ok" });
  });
});

describe("storageFigures over everything the store keeps", () => {
  test("used is the breakdown total: files, documents, sheets and app files", () => {
    const view = toDriveUsageView(driveRow(), orgRow());
    expect(view?.breakdown).toEqual({
      files: 4 * GIB, documents: 2 * GIB, sheets: GIB / 2, apps: GIB + GIB / 2, total: 8 * GIB, quota: DRIVE_DEFAULT_QUOTA_BYTES,
    });
    expect(view && storageFigures(view)).toEqual({ used: 8 * GIB, total: 10 * GIB, percent: 80, level: "ok" });
  });

  test("documents and app files alone can push the meter past 90%", () => {
    const view = toDriveUsageView(driveRow({ bytesUsed: GIB, bytesReserved: 0, sheetBytes: 0 }), orgRow({ docBytes: 5 * GIB, appBytes: 3 * GIB }));
    expect(view && storageFigures(view)).toMatchObject({ used: 9 * GIB, level: "warning" });
    const full = toDriveUsageView(null, orgRow({ docBytes: 7 * GIB, appBytes: 4 * GIB }));
    expect(full && storageFigures(full)).toMatchObject({ used: 11 * GIB, level: "full", percent: 100 });
  });

  test("a module without the storage tables: documents and apps read 0", () => {
    const view = toDriveUsageView(driveRow(), null);
    expect(view?.breakdown).toMatchObject({ documents: 0, apps: 0, sheets: GIB / 2, total: 4 * GIB + GIB / 2 });
    expect(documentSizeMap([], ORG).size).toBe(0);
    const empty = appFileLookups([], ORG);
    expect(empty.appFileSizes.size).toBe(0);
    expect(empty.appBytesBySource.size).toBe(0);
  });
});

describe("storage lookups", () => {
  const size = (documentId: string, bytes: number, versionBytes: number, organizationId = ORG): DocumentSize => ({
    documentId, organizationId, fileType: "doc", bytes, versionBytes, updatedAt: new Date(0),
  });
  const file = (keyHash: string, source: AppFileRecord["source"], sizeBytes: number, organizationId = ORG): AppFileRecord => ({
    keyHash, organizationId, source, sizeBytes, mimeType: "image/png", createdAt: new Date(0),
  });

  test("documentSizes: bytes already holds the kept versions (never added twice), this store only", () => {
    // The module writes bytes = live + versionBytes: 100 here is 80 of content plus 20 of versions.
    const map = documentSizeMap([size("d1", 100, 20), size("d2", 5, 0), size("d3", 9, 9, "org-2")], ORG);
    expect([...map]).toEqual([["d1", 100], ["d2", 5]]);
    expect(documentSizeMap([size("d1", 1, 1)], null).size).toBe(0);
  });

  test("appFileSizes by key hash and per-source totals, this store only", () => {
    const { appFileSizes, appBytesBySource } = appFileLookups(
      [file("h1", "doc_image", 300), file("h2", "doc_image", 200), file("h3", "chat", 50), file("h4", "chat", 999, "org-2")],
      ORG,
    );
    expect(appFileSizes.get("h1")).toEqual({ sizeBytes: 300, source: "doc_image", mimeType: "image/png" });
    expect(appFileSizes.has("h4")).toBe(false);
    expect([...appBytesBySource]).toEqual([["doc_image", 500], ["chat", 50]]);
  });

  test("chat attachments have no readable rows: the org's appBytes beyond the listed rows is the chat total", () => {
    const rows = [file("h1", "tasks", 300), file("h2", "doc_image", 200)];
    const { appFileSizes, appBytesBySource } = appFileLookups(rows, ORG, 48_000_500);
    expect([...appBytesBySource]).toEqual([["tasks", 300], ["doc_image", 200], ["chat", 48_000_000]]);
    expect(appFileSizes.size).toBe(2);
    // No usage row, or a total that lags the rows: nothing is invented.
    expect(appFileLookups(rows, ORG, null).appBytesBySource.has("chat")).toBe(false);
    expect(appFileLookups(rows, ORG, 400).appBytesBySource.has("chat")).toBe(false);
  });
});

describe("preflightUploads against the combined total", () => {
  const MAX = 10 * GIB;
  const blob = (bytes: number) => ({ name: "a.bin", size: bytes }) as unknown as File;

  test("documents, sheets and app files take room from uploads", () => {
    const view = toDriveUsageView(driveRow(), orgRow());
    if (!view) throw new Error("expected a view");
    const fits = blob(2 * GIB);
    expect(preflightUploads([fits], view, view.breakdown.quota, MAX).accepted).toEqual([fits]);
    const over = blob(2 * GIB + 1);
    expect(preflightUploads([over], view, view.breakdown.quota, MAX).rejected).toEqual([{ file: over, reason: "quota" }]);
  });

  test("without a breakdown, Drive files stored + reserved as before", () => {
    const a = blob(100);
    expect(preflightUploads([a], { usedBytes: 800, reservedBytes: 100 }, 1000, MAX).accepted).toEqual([a]);
    expect(preflightUploads([a], { usedBytes: 800, reservedBytes: 101 }, 1000, MAX).rejected).toEqual([{ file: a, reason: "quota" }]);
  });
});
