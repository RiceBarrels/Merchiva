// Drive UI storage model: "Stored in apps" totals (components/drive/model/app-storage.ts), entry sizes
// (entry-size.ts) and the meter's breakdown rows (storage-breakdown.ts).
import { describe, expect, test } from "bun:test";
import { APP_FILE_SOURCE_TILE, appBytesRowLabel, appStorageSummary } from "@/components/drive/model/app-storage";
import { entrySizeBytes, entrySizeText } from "@/components/drive/model/entry-size";
import { storageBreakdownComplete, storageBreakdownRows } from "@/components/drive/model/storage-breakdown";
import { toDriveUsageView } from "@/lib/drive/mappers";
import { displayUsage } from "@/lib/drive/storage-figures";
import type { DriveEntry } from "@/components/drive/model/types";
import { VIRTUAL_SOURCES } from "@/components/drive/model/virtual-sources";
import { APP_FILE_SOURCES, type AppFileSource } from "@/lib/storage/sources";
import en from "../../../messages/en.json";

function key(path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

describe("appStorageSummary", () => {
  const bytes = new Map<AppFileSource, number>([
    ["chat", 100], ["bugs", 5], ["logo", 7], ["avatar", 3], ["doc_image", 300], ["slides_image", 0], ["other", 11], ["inventory", 40],
  ]);

  test("every module source has a tile or a row label in the copy", () => {
    for (const source of APP_FILE_SOURCES) {
      const tile = APP_FILE_SOURCE_TILE[source];
      if (tile) expect(VIRTUAL_SOURCES.some((meta) => meta.id === tile)).toBe(true);
      // A source without a tile of its own can become a row: it needs a label.
      if (tile === null || tile === "profile") expect(typeof key(`drive.apps.bytesSource.${source}`)).toBe("string");
    }
  });

  const all = (ids: string[]) => ids.map((id) => ({ id: id as never, listedBytes: null }));

  test("visible sources get tile totals; logo and avatar fold into the profile tile; the rest become rows", () => {
    const summary = appStorageSummary(bytes, all(["chat", "bugs", "profile"]));
    expect(summary.total).toBe(466);
    expect([...summary.bySource]).toEqual([["chat", 100], ["bugs", 5], ["profile", 10]]);
    // Inventory is not visible here: a plain row with its app's name. Zero-byte sources get no row.
    expect(summary.rows).toEqual([
      { id: "inventory", labelKey: "drive.apps.sources.inventory", bytes: 40 },
      { id: "doc_image", labelKey: "drive.apps.bytesSource.doc_image", bytes: 300 },
      { id: "other", labelKey: "drive.apps.bytesSource.other", bytes: 11 },
    ]);
    for (const row of summary.rows) expect(typeof key(row.labelKey)).toBe("string");
  });

  test("without the profile tile the logo and photos are rows of their own; nothing visible keeps the total", () => {
    const summary = appStorageSummary(bytes, []);
    expect(summary.total).toBe(466);
    expect(summary.bySource.size).toBe(0);
    expect(summary.rows.map((r) => [r.id, r.bytes])).toEqual([
      ["chat", 100], ["inventory", 40], ["bugs", 5], ["doc_image", 300], ["logo", 7], ["avatar", 3], ["other", 11],
    ]);
  });

  test("a tile counts only the files it lists; the store's rest is a 'files you can't open here' row", () => {
    // Staff see the logo (7) and their own photo (1); the store's other profile photos stay out of the tile.
    const summary = appStorageSummary(bytes, [{ id: "profile", listedBytes: 8 }, { id: "chat", listedBytes: 0 }, { id: "bugs", listedBytes: null }]);
    expect(summary.total).toBe(466);
    // Bugs lists a file of unknown size: it cannot be split and keeps the store's total.
    expect([...summary.bySource]).toEqual([["bugs", 5], ["profile", 8]]);
    expect(summary.rows.filter((r) => r.id.endsWith(":notListed"))).toEqual([
      { id: "chat:notListed", labelKey: "drive.apps.bytesNotListed", source: "chat", bytes: 100 },
      { id: "profile:notListed", labelKey: "drive.apps.bytesNotListed", source: "profile", bytes: 2 },
    ]);
    const t = (k: string) => String(key(k));
    expect(appBytesRowLabel(summary.rows[0], t)).toBe(`${t("drive.apps.sources.chat")}: files you can't open here`);
    expect(summary.rows.reduce((n, r) => n + r.bytes, 0) + 8 + 5).toBe(466);
  });

  test("a record source (forms) shows the bytes it lists, outside the app-file total", () => {
    const summary = appStorageSummary(bytes, [{ id: "forms", listedBytes: 2_000 }, { id: "chat", listedBytes: null }]);
    expect(summary.total).toBe(466);
    expect(summary.bySource.get("forms")).toBe(2_000);
    expect(summary.rows.some((r) => r.id.startsWith("forms"))).toBe(false);
    expect(appStorageSummary(new Map(), [{ id: "forms", listedBytes: 0 }]).bySource.size).toBe(0);
    expect(appStorageSummary(new Map(), [{ id: "forms", listedBytes: null }]).bySource.size).toBe(0);
  });

  test("no app files: nothing to show", () => {
    expect(appStorageSummary(new Map(), all(["chat"]))).toEqual({ total: 0, bySource: new Map(), rows: [] });
  });
});

describe("entrySizeBytes / entrySizeText", () => {
  const as = (patch: Record<string, unknown>) => patch as unknown as DriveEntry;
  test("files, documents and app files with a known size; folders and unknown sizes have none", () => {
    expect(entrySizeBytes(as({ type: "file", sizeBytes: 0 }))).toBe(0);
    expect(entrySizeBytes(as({ type: "doc", sizeBytes: 2048 }))).toBe(2048);
    expect(entrySizeBytes(as({ type: "virtual", sizeBytes: null }))).toBeNull();
    expect(entrySizeBytes(as({ type: "sheet" }))).toBeNull();
    expect(entrySizeBytes(as({ type: "folder", sizeBytes: 5 }))).toBeNull();
    expect(entrySizeText(as({ type: "slides", sizeBytes: 1500 }), "en")).toMatch(/1\.5\s?kB/i);
    expect(entrySizeText(as({ type: "virtual", sizeBytes: null }), "en")).toBeNull();
  });
});

describe("storageBreakdownRows", () => {
  test("the four parts in order, labelled", () => {
    const rows = storageBreakdownRows({
      usedBytes: 1, reservedBytes: 2, sheetBytes: 3,
      breakdown: { files: 10, documents: 20, sheets: 30, apps: 40, total: 100, quota: 1000 },
    });
    expect(rows.map((r) => [r.part, r.bytes])).toEqual([["files", 10], ["documents", 20], ["sheets", 30], ["apps", 40]]);
    for (const row of rows) expect(typeof key(row.labelKey)).toBe("string");
  });
  test("a view without a breakdown knows Drive files and Sheets only: documents and apps are unknown, not 0", () => {
    const rows = storageBreakdownRows({ usedBytes: 5, reservedBytes: 2, sheetBytes: 3 });
    expect(rows.map((r) => r.bytes)).toEqual([7, null, 3, null]);
    expect(storageBreakdownComplete(rows)).toBe(false);
  });
  test("unmeasured parts (a module without org_storage_usage) stay unknown; measured zeros stay 0", () => {
    const view = toDriveUsageView(null, null, false) ?? displayUsage({ status: "ready", isReady: true, usage: null, storageMeasured: false });
    const rows = storageBreakdownRows(view ?? { usedBytes: 0, reservedBytes: 0, sheetBytes: 0 });
    expect(rows.map((r) => r.bytes)).toEqual([0, null, 0, null]);
    expect(storageBreakdownComplete(rows)).toBe(false);
    const measured = displayUsage({ status: "ready", isReady: true, usage: null, storageMeasured: true });
    expect(storageBreakdownComplete(storageBreakdownRows(measured ?? { usedBytes: 0, reservedBytes: 0, sheetBytes: 0 }))).toBe(true);
  });
});
