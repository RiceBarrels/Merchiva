import { describe, expect, test } from "bun:test";
import {
  DRIVE_NATIVE_MULTI_MAX,
  DRIVE_VIRTUAL_ASSUMED_BYTES,
  DRIVE_ZIP_MAX_BYTES_COARSE,
  DRIVE_ZIP_MAX_BYTES_FINE,
  planDownload,
  type DownloadEnv,
} from "@/components/drive/model/download-plan";
import type { DriveEntryAccess, FileEntry, VirtualEntry } from "@/components/drive/model/types";
import type { DriveItem } from "@/lib/drive/types";

const MIB = 1024 ** 2;
const ACCESS: DriveEntryAccess = {
  canOpen: true, canDownload: true, canRename: false, canMove: false, canTrash: false, canRestore: false,
  canDeleteForever: false, canShare: false, canStar: false, canAddChildren: false,
};

function base(key: string) {
  return {
    key, id: key, name: key, createdAt: 0, updatedAt: 0, ownerMemberId: "", ownerName: null, isMine: true,
    starred: false, trashedAt: null, openedAt: null, access: ACCESS,
  };
}

function fileEntry(key: string, sizeBytes: number): FileEntry {
  return {
    ...base(key), type: "file", item: { id: key, sizeBytes } as DriveItem, fileKind: "pdf", mimeType: "application/pdf",
    sizeBytes, uploading: null, location: { space: "my", ownerMemberId: "m", parentId: "" },
  };
}

function virtualEntry(key: string): VirtualEntry {
  return {
    ...base(key), type: "virtual", source: "tasks", url: `https://utfs.io/f/${key}`, fileKind: "image", mimeType: "image/jpeg",
    group: "Opening", originRoute: "/manager/personnel/roles", location: null,
  };
}

const WEB: DownloadEnv = { capacitor: false, coarsePointer: false };
const PHONE_WEB: DownloadEnv = { capacitor: false, coarsePointer: true };
const NATIVE: DownloadEnv = { capacitor: true, coarsePointer: true };

describe("planDownload", () => {
  test("constants", () => {
    expect(DRIVE_ZIP_MAX_BYTES_FINE).toBe(200 * MIB);
    expect(DRIVE_ZIP_MAX_BYTES_COARSE).toBe(50 * MIB);
    expect(DRIVE_NATIVE_MULTI_MAX).toBe(10);
    expect(DRIVE_VIRTUAL_ASSUMED_BYTES).toBe(8 * MIB);
  });

  test("one entry is a single download on every device", () => {
    const one = fileEntry("a", 900 * MIB);
    for (const env of [WEB, PHONE_WEB, NATIVE]) expect(planDownload([one], env)).toEqual({ kind: "single", entry: one });
    const v = virtualEntry("v");
    expect(planDownload([v], NATIVE)).toEqual({ kind: "single", entry: v });
  });

  test("the Capacitor apps never zip: up to 10 one by one, more refused", () => {
    const ten = Array.from({ length: 10 }, (_, i) => fileEntry(`f${i}`, 1));
    expect(planDownload(ten, NATIVE)).toEqual({ kind: "sequential", entries: ten, reason: "native" });
    const eleven = [...ten, fileEntry("f10", 1)];
    expect(planDownload(eleven, NATIVE)).toEqual({ kind: "refused", reason: "nativeLimit" });
  });

  test("several on the web zip up to the pointer type's cap", () => {
    const fine = [fileEntry("a", 100 * MIB), fileEntry("b", 100 * MIB)];
    expect(planDownload(fine, WEB)).toEqual({ kind: "zip", entries: fine, totalBytes: 200 * MIB });
    const coarse = [fileEntry("a", 25 * MIB), fileEntry("b", 25 * MIB)];
    expect(planDownload(coarse, PHONE_WEB)).toEqual({ kind: "zip", entries: coarse, totalBytes: 50 * MIB });
  });

  test("over the cap, the web downloads one by one", () => {
    const fine = [fileEntry("a", 100 * MIB), fileEntry("b", 100 * MIB + 1)];
    expect(planDownload(fine, WEB)).toEqual({ kind: "sequential", entries: fine, reason: "tooBig" });
    const coarse = [fileEntry("a", 25 * MIB), fileEntry("b", 25 * MIB + 1)];
    expect(planDownload(coarse, PHONE_WEB)).toEqual({ kind: "sequential", entries: coarse, reason: "tooBig" });
    expect(planDownload(coarse, WEB).kind).toBe("zip");
  });

  test("files stored in other apps count as 8 MiB each", () => {
    const six = Array.from({ length: 6 }, (_, i) => virtualEntry(`v${i}`));
    expect(planDownload(six, PHONE_WEB)).toEqual({ kind: "zip", entries: six, totalBytes: 48 * MIB });
    const seven = [...six, virtualEntry("v6")];
    expect(planDownload(seven, PHONE_WEB)).toEqual({ kind: "sequential", entries: seven, reason: "tooBig" });
    const mixed = [fileEntry("a", 2 * MIB), virtualEntry("v")];
    expect(planDownload(mixed, WEB)).toEqual({ kind: "zip", entries: mixed, totalBytes: 10 * MIB });
  });

  test("an unknown or bad size counts as 0; the plan copies the input", () => {
    const entries = [fileEntry("a", Number.NaN), fileEntry("b", -5)];
    const plan = planDownload(entries, WEB);
    expect(plan).toEqual({ kind: "zip", entries, totalBytes: 0 });
    if (plan.kind === "zip") expect(plan.entries).not.toBe(entries);
  });

  test("an empty selection plans nothing to do", () => {
    expect(planDownload([], WEB)).toEqual({ kind: "sequential", entries: [], reason: "tooBig" });
    expect(planDownload([], NATIVE)).toEqual({ kind: "sequential", entries: [], reason: "native" });
  });
});
