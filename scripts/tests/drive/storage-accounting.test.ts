// Storage accounting beyond Blob uploads (spacetimedb/src/drive/storage.ts): each
// document's stored bytes (document_size), the org's Docs + Slides and app totals
// (org_storage_usage), and the ONE quota new Drive uploads and new documents are
// checked against. Real module code (index.ts reducers + the drive factories, wired
// with the real sheetDeps) over the two-org fake database.

import { describe, expect, test } from "bun:test";
import { cleanDriveName, driveBlobKey } from "../../../spacetimedb/src/drive/logic";
import {
  documentStoredBytes, orgStorageTotal, storageRoomFits, utf8ByteLength,
} from "../../../spacetimedb/src/drive/storage";
import type { DriveCtx, DriveSchema } from "../../../spacetimedb/src/drive/types";
import { defineDriveUploadReducers } from "../../../spacetimedb/src/drive/uploads";
import {
  FakeTimestamp, SERVICE_IDENTITY, loadModule, moduleStubs, registerServiceIdentity, type FakeDb, type FakeMember, type Row,
} from "./fake-db";
import {
  MODULE, R, acquire, asClient, createSheetWorld, errorOf, gz, lease, newSheet, push, sheetBytes, sheetClient, sheetDeps,
} from "../sheets/helpers/sheet-server-harness";

const DOCS = loadModule(["createDocument"], { Timestamp: FakeTimestamp });
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const U = defineDriveUploadReducers(stdb, sheetDeps);
const MINUTE = 60_000_000n;
const utf8 = (s: unknown): bigint => BigInt(Buffer.byteLength(String(s ?? ""), "utf8"));

/** A Docs document through createDocument (frozen params); returns its id. */
function newDoc(db: FakeDb, by: FakeMember, o: { state?: Uint8Array; html?: string; plainText?: string } = {}): string {
  const documentId = crypto.randomUUID();
  db.run(DOCS.createDocument, by, {
    organizationId: by.organizationId, documentId, title: "Notes", visibility: "org_edit", templateId: undefined,
    initialState: o.state, html: o.html, plainText: o.plainText, wordCount: 2,
  });
  return documentId;
}

/** A Slides deck through createDriveDocument; returns its id. */
function newDeck(db: FakeDb, by: FakeMember, state = new Uint8Array(40)): string {
  const documentId = crypto.randomUUID();
  db.run(R.createDriveDocument, by, {
    organizationId: by.organizationId, documentId, fileType: "slides", space: "store", folderId: "", ownerMemberId: "",
    visibility: "", title: "Deck", templateId: "", initialState: state, html: "<p>Slide</p>", plainText: "Slide",
    wordCount: 1, actingMemberId: "",
  });
  return documentId;
}

const sizeOf = (db: FakeDb, id: string): bigint | null => (db.find("documentSize", id)?.bytes as bigint | undefined) ?? null;
const usageOf = (db: FakeDb, org: string): Row | null => db.find("orgStorageUsage", org);

/** A document's bytes counted from the rows, independently of the module. */
function countedBytes(db: FakeDb, id: string): bigint {
  const fileType = db.find("documentFile", id)?.fileType ?? "doc";
  const snap = db.find("documentSnapshot", id);
  let total = BigInt((snap?.byteLength as number | undefined) ?? 0) + utf8(snap?.plainText);
  for (const u of db.rows("documentUpdate")) if (u.documentId === id) total += BigInt(u.byteLength as number);
  if (fileType === "sheet") {
    for (const v of db.rows("documentVersionState")) if (v.documentId === id) total += BigInt(v.byteLength as number);
    return total;
  }
  total += utf8(snap?.html);
  for (const v of db.rows("documentVersion")) if (v.documentId === id) total += BigInt(v.byteLength as number);
  return total;
}

/** The org's Docs + Slides totals counted from document_size rows (the org_storage_usage invariant). */
function countedDocUsage(db: FakeDb, org: string): { docBytes: bigint; docCount: number } {
  const rows = db.rows("documentSize").filter((r) => r.organizationId === org && r.fileType !== "sheet");
  return { docBytes: rows.reduce((sum, r) => sum + (r.bytes as bigint), 0n), docCount: rows.length };
}

function expectOrgInvariant(db: FakeDb, org: string): void {
  const usage = usageOf(db, org);
  expect({ docBytes: (usage?.docBytes as bigint | undefined) ?? 0n, docCount: (usage?.docCount as number | undefined) ?? 0 })
    .toEqual(countedDocUsage(db, org));
}

function setQuota(db: FakeDb, org: string, bytes: bigint): void {
  registerServiceIdentity(db);
  db.run(R.serviceSetDriveQuota, SERVICE_IDENTITY, { organizationId: org, quotaBytesOverride: bytes });
}

/** beginDriveUpload of `size` bytes into Store (what lib/drive/upload.ts plans). */
function beginUpload(db: FakeDb, by: FakeMember, size: bigint): void {
  const itemId = crypto.randomUUID();
  const name = "photo.jpg";
  db.run(U.beginDriveUpload, by, {
    organizationId: by.organizationId, itemId, space: "store", parentId: "", ownerMemberId: "", name,
    mimeType: "image/jpeg", sizeBytes: size,
    blobKey: driveBlobKey(by.organizationId, itemId, crypto.randomUUID(), cleanDriveName(name) ?? name), actingMemberId: "",
  });
}

describe("pure helpers", () => {
  test("utf8ByteLength equals the encoded length (ASCII, 2/3/4-byte, lone surrogates)", () => {
    const enc = new TextEncoder();
    for (const s of ["", "abc", "café", "报告", "a😀b", "\u{1F468}‍\u{1F469}", "x\uD800y", "\uDC00", "end\uD83D"]) {
      expect([s, utf8ByteLength(s)]).toEqual([s, enc.encode(s).length]);
    }
  });

  test("storageRoomFits: a store at its quota takes nothing more, not even an empty document", () => {
    expect(storageRoomFits(0n, 10n, 10n)).toBe(true);
    expect(storageRoomFits(9n, 1n, 10n)).toBe(true);
    expect(storageRoomFits(9n, 2n, 10n)).toBe(false);
    expect(storageRoomFits(10n, 0n, 10n)).toBe(false);
    expect(storageRoomFits(11n, 0n, 10n)).toBe(false);
  });
});

describe("document_size at create and duplicate", () => {
  test("createDocument records snapshot state + html + plain text and adds to the org's Docs totals", () => {
    const { db, orgA, orgB } = createSheetWorld();
    const id = newDoc(db, orgA.owner, { state: new Uint8Array(100), html: "<p>Café</p>", plainText: "Café" });
    expect(sizeOf(db, id)).toBe(100n + 12n + 5n);
    expect(db.find("documentSize", id)).toMatchObject({ organizationId: orgA.organizationId, fileType: "doc" });
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ docBytes: 117n, docCount: 1 });
    expect(usageOf(db, orgB.organizationId)).toBeNull();
    const empty = newDoc(db, orgA.owner);
    expect(sizeOf(db, empty)).toBe(0n);
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ docBytes: 117n, docCount: 2 });
  });

  test("createDriveDocument: a deck counts in docBytes; a sheet has its row but stays in drive_usage.sheetBytes", () => {
    const { db, orgA } = createSheetWorld();
    const deck = newDeck(db, orgA.staff);
    expect(sizeOf(db, deck)).toBe(countedBytes(db, deck));
    expect(db.find("documentSize", deck)?.fileType).toBe("slides");
    const sheet = newSheet(db, orgA.staff);
    expect(db.find("documentSize", sheet)).toMatchObject({ fileType: "sheet", bytes: countedBytes(db, sheet) });
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ docBytes: sizeOf(db, deck), docCount: 1 });
    expectOrgInvariant(db, orgA.organizationId);
  });

  test("duplicateDocument: the copy is measured (snapshot + log, no versions) and counted", () => {
    const { db, orgA } = createSheetWorld();
    const src = newDoc(db, orgA.owner, { state: new Uint8Array(50), html: "<p>x</p>", plainText: "x" });
    db.run(MODULE.pushDocumentUpdate, orgA.owner, { documentId: src, sessionId: "s1", payload: new Uint8Array(30) });
    db.run(MODULE.saveDocumentVersion, orgA.owner, {
      documentId: src, kind: "named", name: "v1", state: new Uint8Array(70), throughUpdateId: 0n, wordCount: 1 });
    const copy = crypto.randomUUID();
    db.run(MODULE.duplicateDocument, orgA.owner, { sourceDocumentId: src, documentId: copy, title: "Copy" });
    expect(sizeOf(db, copy)).toBe(50n + 8n + 1n + 30n);
    expect(sizeOf(db, copy)).toBe(countedBytes(db, copy));
    expectOrgInvariant(db, orgA.organizationId);
  });
});

describe("document_size follows compaction and versions", () => {
  test("pushDocumentUpdate never writes the size (hot path); compactDocument re-measures", () => {
    const { db, orgA } = createSheetWorld();
    const id = newDoc(db, orgA.owner, { state: new Uint8Array(10), plainText: "a" });
    const before = sizeOf(db, id);
    const usageBefore = usageOf(db, orgA.organizationId);
    db.run(MODULE.pushDocumentUpdate, orgA.owner, { documentId: id, sessionId: "s1", payload: new Uint8Array(500) });
    expect(sizeOf(db, id)).toBe(before);
    expect(usageOf(db, orgA.organizationId)).toEqual(usageBefore);
    const through = db.rows("documentUpdate").find((u) => u.documentId === id)?.id as bigint;
    db.run(MODULE.compactDocument, orgA.owner, {
      documentId: id, throughUpdateId: through, state: new Uint8Array(200), html: "<p>ü</p>", plainText: "ü", wordCount: 1 });
    expect(sizeOf(db, id)).toBe(200n + 9n + 2n);
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    expectOrgInvariant(db, orgA.organizationId);
  });

  test("saveDocumentVersion adds the version, auto-prune takes the pruned ones off, deleteDocumentVersion subtracts", () => {
    const { db, orgA } = createSheetWorld();
    const id = newDoc(db, orgA.owner, { state: new Uint8Array(10) });
    let at = db.nowMicros;
    for (let i = 0; i < 52; i++) {
      at += 11n * MINUTE;
      db.run(MODULE.saveDocumentVersion, orgA.owner, {
        documentId: id, kind: "auto", name: undefined, state: new Uint8Array(100 + i), throughUpdateId: BigInt(i), wordCount: 1,
      }, { atMicros: at });
    }
    expect(db.rows("documentVersion").filter((v) => v.documentId === id).length).toBe(50);
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    db.run(MODULE.saveDocumentVersion, orgA.owner, {
      documentId: id, kind: "named", name: "Keep", state: new Uint8Array(1000), throughUpdateId: 99n, wordCount: 1 });
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    const named = db.rows("documentVersion").find((v) => v.documentId === id && v.kind === "named");
    const withNamed = sizeOf(db, id) as bigint;
    db.run(MODULE.deleteDocumentVersion, orgA.owner, { documentId: id, versionId: String(named?.id) });
    expect(sizeOf(db, id)).toBe(withNamed - 1000n);
    expectOrgInvariant(db, orgA.organizationId);
  });

  test("compactDocument keeps versionBytes without reading a version; a version write re-measures them", () => {
    const { db, orgA } = createSheetWorld();
    const id = newDoc(db, orgA.owner, { state: new Uint8Array(10) });
    db.run(MODULE.saveDocumentVersion, orgA.owner, {
      documentId: id, kind: "named", name: "Keep", state: new Uint8Array(300), throughUpdateId: 0n, wordCount: 1 });
    expect(db.find("documentSize", id)?.versionBytes).toBe(300n);
    // A version row changed behind the size's back: compaction does not see it, because it reads no version.
    const version = db.rows("documentVersion").find((v) => v.documentId === id) as Row;
    db.patch("documentVersion", version.id, { byteLength: 999 });
    db.run(MODULE.pushDocumentUpdate, orgA.owner, { documentId: id, sessionId: "s1", payload: new Uint8Array(5) });
    const through = db.rows("documentUpdate").find((u) => u.documentId === id)?.id as bigint;
    db.run(MODULE.compactDocument, orgA.owner, {
      documentId: id, throughUpdateId: through, state: new Uint8Array(20), html: "<p>a</p>", plainText: "a", wordCount: 1 });
    expect(db.find("documentSize", id)?.versionBytes).toBe(300n);
    expect(sizeOf(db, id)).toBe(20n + 8n + 1n + 300n);
    expectOrgInvariant(db, orgA.organizationId);
    db.run(MODULE.saveDocumentVersion, orgA.owner, {
      documentId: id, kind: "named", name: "Two", state: new Uint8Array(50), throughUpdateId: 0n, wordCount: 1 });
    expect(db.find("documentSize", id)?.versionBytes).toBe(999n + 50n);
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    expectOrgInvariant(db, orgA.organizationId);
  });
});

describe("sheets keep their document_size current", () => {
  test("compactSheet, resetSheetContent and saveSheetVersion re-measure; pushSheetOps does not", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const c = sheetClient(orgA.staff);
    acquire(db, c, id);
    const created = sizeOf(db, id);
    push(db, c, id, { payload: gz('{"v":1,"ops":[1,2,3]}') });
    expect(sizeOf(db, id)).toBe(created);
    const through = db.rows("documentUpdate").filter((u) => u.documentId === id).at(-1)?.id as bigint;
    asClient(db, R.compactSheet, c, {
      documentId: id, leaseEpoch: lease(db, id).epoch, throughUpdateId: through, state: gz('{"compacted":true}'),
      plainText: "A1  total", cellCount: 2 });
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    const row = lease(db, id);
    asClient(db, R.resetSheetContent, c, {
      documentId: id, leaseEpoch: row.epoch, seq: (row.lastSeq as bigint) + 1n, state: gz('{"reset":1}'),
      plainText: "reset", cellCount: 1 });
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    asClient(db, R.saveSheetVersion, c, {
      documentId: id, leaseEpoch: lease(db, id).epoch, kind: "named", name: "Q3", state: gz('{"v":"named"}'),
      throughUpdateId: 0n, cellCount: 1 });
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    const version = db.rows("documentVersion").find((v) => v.documentId === id);
    expect(db.find("documentSize", id)?.versionBytes).toBe(BigInt(version?.byteLength as number));
    // A compaction after a version keeps versionBytes (from document_version.byteLength, no state read).
    push(db, c, id, { payload: gz('{"v":1,"ops":[4]}') });
    asClient(db, R.compactSheet, c, {
      documentId: id, leaseEpoch: lease(db, id).epoch,
      throughUpdateId: db.rows("documentUpdate").filter((u) => u.documentId === id).at(-1)?.id as bigint,
      state: gz('{"compacted":2}'), plainText: "two", cellCount: 1 });
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    db.run(MODULE.deleteDocumentVersion, orgA.staff, { documentId: id, versionId: String(version?.id) });
    expect(sizeOf(db, id)).toBe(countedBytes(db, id));
    // Sheets never touch the Docs totals: their bytes are drive_usage.sheetBytes.
    expect(usageOf(db, orgA.organizationId)?.docBytes ?? 0n).toBe(0n);
  });
});

describe("purge", () => {
  test("deleteDocumentForever drops the row and takes the bytes off the org", () => {
    const { db, orgA } = createSheetWorld();
    const keep = newDoc(db, orgA.owner, { state: new Uint8Array(30) });
    const gone = newDeck(db, orgA.owner, new Uint8Array(300));
    const sheet = newSheet(db, orgA.owner);
    expect(usageOf(db, orgA.organizationId)?.docCount).toBe(2);
    for (const id of [gone, sheet]) {
      db.run(MODULE.trashDocument, orgA.owner, { documentId: id });
      db.run(MODULE.deleteDocumentForever, orgA.owner, { documentId: id });
      expect(db.find("documentSize", id)).toBeNull();
    }
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ docBytes: sizeOf(db, keep), docCount: 1 });
    expect(sheetBytes(db, orgA.organizationId)).toBe(0n);
    expectOrgInvariant(db, orgA.organizationId);
  });
});

describe("one quota for everything a store keeps", () => {
  test("orgStorageTotal = Drive used + reserved + sheet bytes + Docs/Slides bytes + app bytes", () => {
    const { db, orgA, orgB } = createSheetWorld();
    newDoc(db, orgA.owner, { state: new Uint8Array(100) });
    newSheet(db, orgA.owner);
    beginUpload(db, orgA.staff, 1000n);
    db.patch("orgStorageUsage", orgA.organizationId, { appBytes: 7n });
    const ctx = db.ctx(orgA.owner.identity) as unknown as DriveCtx;
    expect(orgStorageTotal(ctx, orgA.organizationId)).toBe(100n + sheetBytes(db, orgA.organizationId) + 1000n + 7n);
    expect(orgStorageTotal(ctx, orgB.organizationId)).toBe(0n);
    const doc = db.rows("documentSize").find((r) => r.fileType === "doc");
    expect(documentStoredBytes(ctx, String(doc?.documentId), "doc")).toBe(100n);
  });

  test("Drive uploads see documents and app files; new documents are refused at the quota, edits never", () => {
    const { db, orgA, orgB } = createSheetWorld();
    const org = orgA.organizationId;
    setQuota(db, org, 1000n);
    const id = newDoc(db, orgA.owner, { state: new Uint8Array(600) });
    expect(errorOf(() => beginUpload(db, orgA.staff, 401n))).toContain("[drive.quota_exceeded]");
    beginUpload(db, orgA.staff, 300n);
    db.patch("orgStorageUsage", org, { appBytes: 100n }); // 600 + 300 + 100 = the quota
    expect(errorOf(() => beginUpload(db, orgA.staff, 1n))).toContain("[drive.quota_exceeded]");
    expect(errorOf(() => newDoc(db, orgA.owner))).toContain("[drive.quota_exceeded]");
    expect(errorOf(() => newDeck(db, orgA.staff, new Uint8Array(1)))).toContain("[drive.quota_exceeded]");
    expect(errorOf(() => newSheet(db, orgA.staff))).toContain("[drive.quota_exceeded]");
    expect(errorOf(() => db.run(MODULE.duplicateDocument, orgA.owner, {
      sourceDocumentId: id, documentId: crypto.randomUUID(), title: "Copy" }))).toContain("[drive.quota_exceeded]");
    // Editing what exists goes on past the quota.
    db.run(MODULE.pushDocumentUpdate, orgA.owner, { documentId: id, sessionId: "s1", payload: new Uint8Array(50) });
    const through = db.rows("documentUpdate").find((u) => u.documentId === id)?.id as bigint;
    db.run(MODULE.compactDocument, orgA.owner, {
      documentId: id, throughUpdateId: through, state: new Uint8Array(900), html: "", plainText: "", wordCount: 0 });
    db.run(MODULE.saveDocumentVersion, orgA.owner, {
      documentId: id, kind: "named", name: "v", state: new Uint8Array(900), throughUpdateId: through, wordCount: 0 });
    expect(sizeOf(db, id)).toBe(1800n);
    // Another store's quota is its own.
    newDoc(db, orgB.owner, { state: new Uint8Array(600) });
    beginUpload(db, orgB.staff, 1000n);
  });

  test("a new document's extra is its first snapshot: it must fit, not just the store's current total", () => {
    const { db, orgA } = createSheetWorld();
    setQuota(db, orgA.organizationId, 1000n);
    expect(errorOf(() => newDoc(db, orgA.owner, { state: new Uint8Array(990), plainText: "0123456789X" })))
      .toContain("[drive.quota_exceeded]");
    newDoc(db, orgA.owner, { state: new Uint8Array(990), plainText: "0123456789" });
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ docBytes: 1000n, docCount: 1 });
  });
});
