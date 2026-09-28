// The storage meter's numbers: "{used} of {total} used" on /manager/drive (nav column on wide screens, a compact
// line above the list below lg) and on the device app. A store that never uploaded has no drive_usage row yet; it
// must still see 0 of its quota once Drive has loaded, not nothing.

import { describe, expect, test } from "bun:test";
import { displayUsage, storageFigures } from "@/components/drive/nav/storage-meter";
import { DRIVE_DEFAULT_QUOTA_BYTES } from "@/lib/drive/rules";
import type { DriveUsageView } from "@/lib/drive/types";

const GIB = 1024 ** 3;
const row: DriveUsageView = { usedBytes: 3 * GIB, reservedBytes: GIB, quotaBytes: 10 * GIB, fileCount: 12, sheetBytes: 5 };

describe("displayUsage", () => {
  test("the store's row wins whenever it exists", () => {
    expect(displayUsage({ status: "ready", isReady: true, usage: row })).toBe(row);
    expect(displayUsage({ status: "checking", isReady: false, usage: row })).toBe(row);
  });

  test("no row yet: zero of the default quota once Drive is ready", () => {
    expect(displayUsage({ status: "ready", isReady: true, usage: null })).toEqual({
      usedBytes: 0, reservedBytes: 0, quotaBytes: DRIVE_DEFAULT_QUOTA_BYTES, fileCount: 0, sheetBytes: 0,
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
