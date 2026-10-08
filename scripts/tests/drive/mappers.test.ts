// lib/drive/mappers.ts (Drive rows) and the two `document` columns Drive added
// to lib/docs/mappers.ts. Rows are coerced defensively: a newer or malformed row
// gets the most restrictive reading.

import { describe, expect, test } from "bun:test";
import { docFileType, mapDocuments } from "@/lib/docs/mappers";
import {
  mapAppFile, mapDocumentSize, mapDriveItem, mapDriveNoticeAck, mapDriveStar, mapDriveUsage, mapOrgStorageUsage, storageBreakdown,
  toDriveUsageView,
} from "@/lib/drive/mappers";
import { DRIVE_DEFAULT_QUOTA_BYTES } from "@/lib/drive/rules";

const ts = (ms: number) => ({ toDate: () => new Date(ms) });
const identity = (hex: string) => ({ toHexString: () => hex });
const ITEM_ID = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const FOLDER_ID = "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d";

describe("document_file fileType / folderId", () => {
  test("'' and missing are text documents; values from a newer client are unknown", () => {
    expect(docFileType("")).toBe("doc");
    expect(docFileType(undefined)).toBe("doc");
    expect(docFileType(null)).toBe("doc");
    expect(docFileType("doc")).toBe("doc");
    expect(docFileType("sheet")).toBe("sheet");
    expect(docFileType("slides")).toBe("slides");
    expect(docFileType("form")).toBe("unknown");
    expect(docFileType("Sheet")).toBe("unknown");
    expect(docFileType(3)).toBe("unknown");
  });

  test("mapDocuments takes both from the document's document_file row (folder id lowercased, '' = root)", () => {
    const base = { id: ITEM_ID, organizationId: "o", ownerMemberId: "m", visibility: "private", createdAt: ts(1), updatedAt: ts(2) };
    const file = (fileType: string, folderId = "") => ({ documentId: ITEM_ID, organizationId: "o", fileType, folderId, updatedAt: ts(2) });
    const one = (files: object[]) => mapDocuments([base], files)[0];
    expect(one([file("", "")])).toMatchObject({ fileType: "doc", folderId: "" });
    expect(one([file("sheet", FOLDER_ID.toUpperCase())])).toMatchObject({ fileType: "sheet", folderId: FOLDER_ID });
    expect(one([file("form")])).toMatchObject({ fileType: "unknown", folderId: "" });
    expect(one([])).toMatchObject({ fileType: "doc", folderId: "" }); // no row: a document from before Drive
  });
});

describe("mapDriveItem", () => {
  const row = {
    id: ITEM_ID.toUpperCase(), organizationId: "org-1", adminScope: "secret-scope", space: "store", parentId: FOLDER_ID.toUpperCase(),
    kind: "file", name: "Menu.pdf", mimeType: "application/pdf", sizeBytes: BigInt(2_048), blobKey: "org/…", thumbKey: "",
    thumbBytes: BigInt(0), etag: "\"e\"", ownerMemberId: "m-1", createdByMemberId: "m-2", uploaderIdentity: identity("C0FFEE"),
    status: "ready", uploadExpiresAt: ts(10), uploadAttempts: 2, trashed: false, trashRootId: "", trashedAt: undefined,
    trashedByMemberId: "", createdAt: ts(1), updatedAt: ts(2), lastEditorMemberId: "m-2",
  };

  test("maps a generated row", () => {
    const item = mapDriveItem(row);
    expect(item).toEqual({
      id: ITEM_ID, organizationId: "org-1", space: "store", parentId: FOLDER_ID, kind: "file", name: "Menu.pdf",
      mimeType: "application/pdf", sizeBytes: 2_048, blobKey: "org/…", thumbKey: "", thumbBytes: 0, etag: "\"e\"",
      ownerMemberId: "m-1", createdByMemberId: "m-2", uploaderIdentityHex: "c0ffee", status: "ready",
      uploadExpiresAt: new Date(10), uploadAttempts: 2, trashed: false, trashRootId: "", trashedAt: null,
      trashedByMemberId: "", createdAt: new Date(1), updatedAt: new Date(2), lastEditorMemberId: "m-2",
    });
    expect("adminScope" in item).toBe(false);
  });

  test("unknown values get the most restrictive reading", () => {
    const item = mapDriveItem({ ...row, space: "shared", status: "uploading", kind: "link", trashed: "yes", sizeBytes: -5, uploadAttempts: "3" });
    expect(item.space).toBe("my");
    expect(item.status).toBe("pending");
    expect(item.kind).toBe("file");
    expect(item.trashed).toBe(false);
    expect(item.sizeBytes).toBe(0);
    expect(item.uploadAttempts).toBe(0);
  });

  test("an empty row does not throw", () => {
    const item = mapDriveItem({});
    expect(item.id).toBe("");
    expect(item.space).toBe("my");
    expect(item.createdAt.getTime()).toBe(0);
    expect(item.trashedAt).toBeNull();
    expect(item.uploaderIdentityHex).toBe("");
  });

  test("a trashed row", () => {
    const item = mapDriveItem({ ...row, trashed: true, trashRootId: ITEM_ID.toUpperCase(), trashedAt: ts(99), trashedByMemberId: "m-3" });
    expect(item).toMatchObject({ trashed: true, trashRootId: ITEM_ID, trashedByMemberId: "m-3" });
    expect(item.trashedAt?.getTime()).toBe(99);
  });
});

describe("usage", () => {
  const row = {
    organizationId: "org-1", scope: "service", bytesUsed: BigInt(700), bytesReserved: BigInt(300), fileCount: 4, itemCount: 9,
    quotaBytesOverride: BigInt(0), sheetBytes: BigInt(50), measuredBytes: BigInt(690), measuredCount: 4,
    measuredAt: ts(5), updatedAt: ts(6),
  };

  test("mapDriveUsage", () => {
    expect(mapDriveUsage(row)).toEqual({
      organizationId: "org-1", bytesUsed: 700, bytesReserved: 300, fileCount: 4, itemCount: 9, quotaBytesOverride: 0,
      sheetBytes: 50, measuredBytes: 690, measuredCount: 4, measuredAt: new Date(5), updatedAt: new Date(6),
    });
  });

  test("toDriveUsageView: the default quota unless support set an override; null before the row exists", () => {
    expect(toDriveUsageView(mapDriveUsage(row))).toEqual({
      usedBytes: 700, reservedBytes: 300, quotaBytes: DRIVE_DEFAULT_QUOTA_BYTES, fileCount: 4, sheetBytes: 50,
      breakdown: { files: 1000, documents: 0, sheets: 50, apps: 0, total: 1050, quota: DRIVE_DEFAULT_QUOTA_BYTES },
    });
    expect(toDriveUsageView(mapDriveUsage({ ...row, quotaBytesOverride: BigInt(5_000) }))?.quotaBytes).toBe(5_000);
    expect(toDriveUsageView(null)).toBeNull();
    expect(toDriveUsageView(null, null)).toBeNull();
  });

  const orgRow = { organizationId: "org-1", docBytes: BigInt(2_000), docCount: 3, appBytes: BigInt(400), appFileCount: 7, updatedAt: ts(8) };

  test("mapOrgStorageUsage", () => {
    expect(mapOrgStorageUsage(orgRow)).toEqual({
      organizationId: "org-1", docBytes: 2_000, docCount: 3, appBytes: 400, appFileCount: 7, updatedAt: new Date(8),
    });
    expect(mapOrgStorageUsage({})).toMatchObject({ organizationId: "", docBytes: 0, appBytes: 0, updatedAt: new Date(0) });
  });

  test("storageBreakdown: Drive files (stored + reserved), documents, sheets and app files, against the quota", () => {
    expect(storageBreakdown(mapDriveUsage(row), mapOrgStorageUsage(orgRow))).toEqual({
      files: 1000, documents: 2_000, sheets: 50, apps: 400, total: 3_450, quota: DRIVE_DEFAULT_QUOTA_BYTES,
    });
    const override = mapDriveUsage({ ...row, quotaBytesOverride: BigInt(9_000) });
    expect(storageBreakdown(override, null)).toEqual({ files: 1000, documents: 0, sheets: 50, apps: 0, total: 1050, quota: 9_000 });
    expect(storageBreakdown(null, null)).toEqual({ files: 0, documents: 0, sheets: 0, apps: 0, total: 0, quota: DRIVE_DEFAULT_QUOTA_BYTES });
  });

  test("toDriveUsageView: documents and app files count before any Drive upload made a drive_usage row", () => {
    const view = toDriveUsageView(null, mapOrgStorageUsage(orgRow));
    expect(view).toEqual({
      usedBytes: 0, reservedBytes: 0, quotaBytes: DRIVE_DEFAULT_QUOTA_BYTES, fileCount: 0, sheetBytes: 0,
      breakdown: { files: 0, documents: 2_000, sheets: 0, apps: 400, total: 2_400, quota: DRIVE_DEFAULT_QUOTA_BYTES },
    });
    expect(toDriveUsageView(mapDriveUsage(row), mapOrgStorageUsage(orgRow))?.breakdown.total).toBe(3_450);
  });
});

describe("storage accounting rows", () => {
  test("mapAppFile: lowercased key hash; an unknown source counts as other", () => {
    const hash = "AB".repeat(32);
    const raw = { keyHash: hash, organizationId: "org-1", source: "doc_image", sizeBytes: BigInt(1_234), mimeType: "image/png", createdAt: ts(3) };
    expect(mapAppFile(raw)).toEqual({
      keyHash: hash.toLowerCase(), organizationId: "org-1", source: "doc_image", sizeBytes: 1_234, mimeType: "image/png", createdAt: new Date(3),
    });
    expect(mapAppFile({ ...raw, source: "website" }).source).toBe("other");
    expect(mapAppFile({ ...raw, sizeBytes: BigInt(-1) }).sizeBytes).toBe(0);
  });

  test("mapDocumentSize: lowercased document id", () => {
    const raw = { documentId: ITEM_ID.toUpperCase(), organizationId: "org-1", fileType: "doc", bytes: BigInt(90), versionBytes: BigInt(10), updatedAt: ts(4) };
    expect(mapDocumentSize(raw)).toEqual({
      documentId: ITEM_ID, organizationId: "org-1", fileType: "doc", bytes: 90, versionBytes: 10, updatedAt: new Date(4),
    });
  });
});

describe("stars and notice acknowledgements", () => {
  test("mapDriveStar", () => {
    expect(mapDriveStar({ id: `${ITEM_ID}:m-1`, itemId: ITEM_ID.toUpperCase(), organizationId: "o", memberId: "m-1", createdAt: ts(3) })).toEqual({
      id: `${ITEM_ID}:m-1`, itemId: ITEM_ID, organizationId: "o", memberId: "m-1", createdAt: new Date(3),
    });
  });

  test("mapDriveNoticeAck keeps the three surfaces and ignores any other", () => {
    const row = { id: "m-1:drive_management_v1:store", organizationId: "o", memberId: "m-1", userId: identity("aa"), notice: "drive_management_v1", surface: "store", acknowledgedAt: ts(4) };
    expect(mapDriveNoticeAck(row)).toEqual({
      id: row.id, organizationId: "o", memberId: "m-1", notice: "drive_management_v1", surface: "store", acknowledgedAt: new Date(4),
    });
    for (const surface of ["manager", "personal"]) expect(mapDriveNoticeAck({ ...row, surface })?.surface).toBe(surface);
    for (const surface of ["kiosk", "", undefined]) expect(mapDriveNoticeAck({ ...row, surface })).toBeNull();
  });
});
