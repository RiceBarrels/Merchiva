// App files and the storage recompute (spacetimedb/src/drive/storage-reducers.ts,
// storage-backfill.ts and the UploadThing key helpers of storage.ts):
// beginAppUpload (membership, source, file count, the combined quota),
// serviceRecordAppFile (service only, idempotent on keyHash), serviceBackfillAppFiles
// (attribution per source, skips) and serviceRecomputeStorage (drift, vanished
// documents, every org). Real module code wired with the real sheetDeps.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import { uploadThingKeyOf, uploadThingKeysIn } from "../../../spacetimedb/src/drive/storage";
import { wantedKeysInBytes } from "../../../spacetimedb/src/drive/storage-backfill";
import { APP_BACKFILL_MAX, defineStorageReducers } from "../../../spacetimedb/src/drive/storage-reducers";
import type { DriveSchema } from "../../../spacetimedb/src/drive/types";
import {
  FakeTimestamp, FakeUuid, SERVICE_IDENTITY, loadModule, moduleStubs, registerServiceIdentity, type FakeDb, type FakeMember, type Row,
} from "./fake-db";
import { MODULE, R, createSheetWorld, errorOf, newSheet, sheetDeps } from "../sheets/helpers/sheet-server-harness";

const DOCS = loadModule(["createDocument"], { Timestamp: FakeTimestamp });
const S = defineStorageReducers(moduleStubs().spacetimedb as unknown as DriveSchema, sheetDeps);
const hashOf = (key: string): string => createHash("sha256").update(key).digest("hex");
const usageOf = (db: FakeDb, org: string): Row | null => db.find("orgStorageUsage", org);

function service(db: FakeDb, fn: unknown, args: Record<string, unknown>): void {
  registerServiceIdentity(db);
  db.run(fn, SERVICE_IDENTITY, args);
}

function record(db: FakeDb, org: string, key: string, sizeBytes: bigint, source = "tasks"): void {
  service(db, S.serviceRecordAppFile, { organizationId: org, keyHash: hashOf(key), source, sizeBytes, mimeType: "image/png" });
}

function begin(db: FakeDb, by: FakeMember, o: { org?: string; source?: string; totalBytes?: bigint; fileCount?: number } = {}): void {
  db.run(S.beginAppUpload, by, {
    organizationId: o.org ?? by.organizationId, source: o.source ?? "chat", totalBytes: o.totalBytes ?? 10n, fileCount: o.fileCount ?? 1,
  });
}

function setQuota(db: FakeDb, org: string, bytes: bigint): void {
  service(db, R.serviceSetDriveQuota, { organizationId: org, quotaBytesOverride: bytes });
}

describe("UploadThing keys", () => {
  test("uploadThingKeyOf reads /f/<key> on utfs.io and <app>.ufs.sh, and /a/<appId>/<key>", () => {
    expect(uploadThingKeyOf("https://utfs.io/f/abc123.png")).toBe("abc123.png");
    expect(uploadThingKeyOf("https://app1.ufs.sh/f/k1?x=1")).toBe("k1");
    expect(uploadThingKeyOf("https://a.b.ufs.sh/f/k2#frag")).toBe("k2");
    expect(uploadThingKeyOf("https://UTFS.IO/f/CaseKept")).toBe("CaseKept");
    expect(uploadThingKeyOf("https://utfs.io:443/f/k3")).toBe("k3");
    expect(uploadThingKeyOf("https://utfs.io/a/app9/k4")).toBe("k4");
    expect(uploadThingKeyOf("https://app9.ufs.sh/a/app9/k5")).toBe("k5");
    expect(uploadThingKeyOf("  https://utfs.io/f/report%20q3.pdf ")).toBe("report%20q3.pdf");
  });

  test("uploadThingKeyOf refuses other hosts, schemes and shapes", () => {
    for (const url of [
      "", "http://utfs.io/f/x", "https://ufs.sh/f/x", "https://utfs.io.evil.example/f/x", "https://evilutfs.io/f/x",
      "https://evil.example/?u=https://utfs.io/f/x", "https://utfs.io/f/", "https://utfs.io/f/a/b", "https://utfs.io/x/k",
      "https://utfs.io:8443/f/x", "//utfs.io/f/x", "https://user@utfs.io/f/x",
    ]) {
      expect([url, uploadThingKeyOf(url)]).toEqual([url, null]);
    }
  });

  test("uploadThingKeysIn finds every key in JSON and HTML, once each, in order", () => {
    const text = '[{"url":"https://utfs.io/f/k1","type":"image"},{"url":"https://x.ufs.sh/f/k2"}]'
      + ' <img src="https://utfs.io/f/k3"> <a href=\'https://utfs.io/f/k1\'>again</a> https://example.com/f/k9';
    expect(uploadThingKeysIn(text)).toEqual(["k1", "k2", "k3"]);
    expect(uploadThingKeysIn("")).toEqual([]);
  });
});

describe("beginAppUpload", () => {
  test("an active member with room passes; only a hold on the bytes is written", () => {
    const { db, orgA } = createSheetWorld();
    begin(db, orgA.staff, { totalBytes: 5_000n, fileCount: 20 });
    expect(db.rows("appFile")).toEqual([]);
    expect(usageOf(db, orgA.organizationId)).toBeNull();
    expect(db.rows("appUploadHold")).toMatchObject([{ organizationId: orgA.organizationId, bytes: 5_000n }]);
  });

  test("holds: uploads started together cannot all pass one check; recording consumes them, an hour lapses them", () => {
    const { db, orgA } = createSheetWorld();
    setQuota(db, orgA.organizationId, 1_000n);
    begin(db, orgA.staff, { totalBytes: 600n });
    // The first upload's bytes are not recorded yet, but they are held.
    expect(errorOf(() => begin(db, orgA.staff, { totalBytes: 600n }))).toContain("[drive.quota_exceeded]");
    begin(db, orgA.staff, { totalBytes: 400n });
    expect(errorOf(() => begin(db, orgA.staff, { totalBytes: 1n }))).toContain("[drive.quota_exceeded]");
    // Recorded files take their bytes off the oldest holds: the total never counts a file twice.
    record(db, orgA.organizationId, "f1", 500n);
    expect(db.rows("appUploadHold").map((h) => h.bytes)).toEqual([100n, 400n]);
    record(db, orgA.organizationId, "f2", 300n);
    expect(db.rows("appUploadHold").map((h) => h.bytes)).toEqual([200n]);
    expect(errorOf(() => begin(db, orgA.staff, { totalBytes: 1n }))).toContain("[drive.quota_exceeded]");
    // An upload that never finished: its hold lapses after an hour and is dropped by the next begin.
    db.advance(60n * 60n * 1_000_000n);
    begin(db, orgA.staff, { totalBytes: 200n });
    expect(db.rows("appUploadHold").map((h) => h.bytes)).toEqual([200n]);
  });

  test("a non-member, a disabled member, an unknown source and a bad file count are refused", () => {
    const { db, orgA, orgB } = createSheetWorld();
    expect(errorOf(() => begin(db, orgB.owner, { org: orgA.organizationId }))).toContain("Not an active member");
    const disabled = db.addMember({ organizationId: orgA.organizationId, status: "disabled" });
    expect(errorOf(() => begin(db, disabled))).toContain("Not an active member");
    expect(errorOf(() => begin(db, orgA.staff, { source: "website" }))).toContain("[drive.invalid]");
    expect(errorOf(() => begin(db, orgA.staff, { fileCount: 0 }))).toContain("[drive.invalid]");
    expect(errorOf(() => begin(db, orgA.staff, { fileCount: 21 }))).toContain("[drive.invalid]");
  });

  test("the combined quota: app files fill it, and a store at its quota takes no upload at all", () => {
    const { db, orgA, orgB } = createSheetWorld();
    setQuota(db, orgA.organizationId, 1_000n);
    record(db, orgA.organizationId, "big", 900n);
    begin(db, orgA.staff, { totalBytes: 100n });
    expect(errorOf(() => begin(db, orgA.staff, { totalBytes: 101n }))).toContain("[drive.quota_exceeded]");
    record(db, orgA.organizationId, "fill", 100n);
    expect(errorOf(() => begin(db, orgA.staff, { totalBytes: 0n }))).toContain("[drive.quota_exceeded]");
    begin(db, orgB.staff, { totalBytes: 100_000n });
  });
});

describe("serviceRecordAppFile", () => {
  test("records hash, org, source, size and type only, and adds to the org's app totals", () => {
    const { db, orgA, orgB } = createSheetWorld();
    record(db, orgA.organizationId, "k1", 300n, "tasks");
    record(db, orgA.organizationId, "k2", 200n, "logo");
    const row = db.find("appFile", hashOf("k1"));
    expect(row).toMatchObject({ organizationId: orgA.organizationId, source: "tasks", sizeBytes: 300n, mimeType: "image/png" });
    expect(Object.keys(row ?? {}).sort()).toEqual(["createdAt", "keyHash", "mimeType", "organizationId", "sizeBytes", "source"]);
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ appBytes: 500n, appFileCount: 2, docBytes: 0n, docCount: 0 });
    expect(usageOf(db, orgB.organizationId)).toBeNull();
  });

  test("chat attachments go to the private ledger: counted in the org's totals, never an org-readable app_file row", () => {
    const { db, orgA } = createSheetWorld();
    record(db, orgA.organizationId, "dm-video", 48_000_000n, "chat");
    record(db, orgA.organizationId, "evidence", 100n, "tasks");
    expect(db.find("appFile", hashOf("dm-video"))).toBeNull();
    expect(db.find("appFilePrivate", hashOf("dm-video"))).toMatchObject({ source: "chat", sizeBytes: 48_000_000n });
    expect(db.rows("appFile").map((r) => r.source)).toEqual(["tasks"]);
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ appBytes: 48_000_100n, appFileCount: 2 });
    // Idempotent across both ledgers, and the recompute sums both.
    record(db, orgA.organizationId, "dm-video", 1n, "tasks");
    expect(db.rows("appFile")).toHaveLength(1);
    db.patch("orgStorageUsage", orgA.organizationId, { appBytes: 0n, appFileCount: 0 });
    service(db, S.serviceRecomputeStorage, { organizationId: orgA.organizationId });
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ appBytes: 48_000_100n, appFileCount: 2 });
  });

  test("idempotent on keyHash: a repeat (even with another size or org) changes nothing", () => {
    const { db, orgA, orgB } = createSheetWorld();
    record(db, orgA.organizationId, "k1", 300n);
    record(db, orgA.organizationId, "k1", 999n);
    record(db, orgB.organizationId, "k1", 5n);
    expect(db.rows("appFile")).toHaveLength(1);
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ appBytes: 300n, appFileCount: 1 });
    expect(usageOf(db, orgB.organizationId)).toBeNull();
  });

  test("service only; bad hash, source or organization refused", () => {
    const { db, orgA } = createSheetWorld();
    const args = { organizationId: orgA.organizationId, keyHash: hashOf("x"), source: "tasks", sizeBytes: 1n, mimeType: "" };
    expect(errorOf(() => db.run(S.serviceRecordAppFile, orgA.owner, args))).toContain("[drive.forbidden]");
    registerServiceIdentity(db);
    const run = (patch: Record<string, unknown>): string => errorOf(() => db.run(S.serviceRecordAppFile, SERVICE_IDENTITY, { ...args, ...patch }));
    expect(run({ keyHash: "abc" })).toContain("[drive.invalid]");
    expect(run({ keyHash: "https://utfs.io/f/x" })).toContain("[drive.invalid]");
    expect(run({ source: "website" })).toContain("[drive.invalid]");
    expect(run({ organizationId: new FakeUuid().toString() })).toContain("[drive.not_found]");
    expect(db.rows("appFile")).toEqual([]);
    db.run(S.serviceRecordAppFile, SERVICE_IDENTITY, { ...args, keyHash: hashOf("x").toUpperCase(), mimeType: "Image/JPEG; q=1" });
    expect(db.find("appFile", hashOf("x"))).toMatchObject({ mimeType: "image/jpeg" });
  });
});

describe("serviceBackfillAppFiles", () => {
  const ut = (key: string): string => `https://utfs.io/f/${key}`;
  const entry = (key: string, sizeBytes: number | string = 10): Record<string, unknown> =>
    ({ key, keyHash: hashOf(key), sizeBytes, mimeType: "image/png" });
  const backfill = (db: FakeDb, entries: unknown): void => service(db, S.serviceBackfillAppFiles, { entries: JSON.stringify(entries) });

  /** One reference per source, spread over both orgs; returns the person whose avatar is referenced. */
  function seed(db: FakeDb, a: string, b: string): FakeMember {
    const at = new FakeTimestamp(db.nowMicros);
    const conv = new FakeUuid();
    db.insert("chatConversation", { id: conv, organizationId: a, type: "group", createdAt: at, updatedAt: at });
    db.insert("chatMessage", { id: new FakeUuid(), conversationId: conv.toString(), content: "", createdAt: at, attachmentUrl: ut("chat1") });
    db.insert("chatMessage", { id: new FakeUuid(), conversationId: conv.toString(), content: "", createdAt: at, attachmentUrl: ut("chat2") });
    // chat2 forwarded into a store-B conversation later: the earliest message (A's) is the upload.
    const convB = new FakeUuid();
    const later = new FakeTimestamp(db.nowMicros + 1_000n);
    db.insert("chatConversation", { id: convB, organizationId: b, type: "group", createdAt: later, updatedAt: later });
    db.insert("chatMessage", { id: new FakeUuid(), conversationId: convB.toString(), content: "", createdAt: later, attachmentUrl: ut("chat2") });
    db.insert("roleTaskAssignment", {
      id: new FakeUuid(), organizationId: a, taskId: "t", memberId: "m", status: "completed",
      evidenceUrl: ut("task2"), evidenceUrls: JSON.stringify([{ url: "https://abc.ufs.sh/f/task1", type: "image" }, { url: ut("task2") }]),
    });
    db.insert("inventoryTransaction", { id: new FakeUuid(), organizationId: b, evidenceUrls: JSON.stringify([{ url: ut("inv1") }]) });
    db.insert("trainingObjective", { id: new FakeUuid(), organizationId: a, dayId: "d", mediaUrl: ut("train1") });
    db.insert("trainingDay", { id: new FakeUuid(), organizationId: b, description: `<p>Day <img src="${ut("train2")}"></p>` });
    db.insert("inventoryItem", { id: new FakeUuid(), organizationId: b, retailImageUrl: ut("prod1") });
    db.insert("bugReport", { id: new FakeUuid(), organizationId: a, screenshotUrl: ut("bug1") });
    // The same key in a chat of org A and a bug report of org B: chat is claimed last (a pasted URL never moves
    // another store's file), so B's own column wins.
    db.insert("bugReport", { id: new FakeUuid(), organizationId: b, screenshotUrl: ut("chat1") });
    const orgRow = db.rows("organization").find((r) => r.orgIdText === b);
    db.patch("organization", orgRow?.id, { logoUrl: ut("logo1") });
    // Avatar: the earliest ACTIVE membership (a disabled one in A is older still).
    const person = db.addMember({ organizationId: a, status: "disabled" });
    db.advance(10n);
    db.addMember({ organizationId: b, identity: person.identity });
    db.advance(10n);
    db.addMember({ organizationId: a, identity: person.identity });
    db.insert("user", { identity: person.identity, email: "p@example.test", avatarUrl: ut("ava1"), createdAt: at });
    return person;
  }

  test("each key is attributed to its store and source; totals and the migration note follow", () => {
    const { db, orgA, orgB } = createSheetWorld();
    const a = orgA.organizationId;
    const b = orgB.organizationId;
    seed(db, a, b);
    const docId = crypto.randomUUID();
    db.run(DOCS.createDocument, orgA.owner, {
      organizationId: a, documentId: docId, title: "Menu", visibility: "org_edit", templateId: undefined,
      initialState: new Uint8Array(4), html: `<p><img src="${ut("docimg1")}"></p>`, plainText: "", wordCount: 0,
    });
    const docUsage = usageOf(db, a);
    const keys = ["chat1", "chat2", "task1", "task2", "inv1", "train1", "train2", "prod1", "bug1", "logo1", "ava1", "docimg1"];
    backfill(db, [...keys.map((k) => entry(k, 100)), entry("orphan1"), { key: "", keyHash: hashOf(""), sizeBytes: 1 },
      { ...entry("neg"), sizeBytes: -1 }, { ...entry("badhash"), keyHash: "zz" }, "nope"]);

    const placed = Object.fromEntries(keys.map((k) => {
      const row = db.find("appFile", hashOf(k)) ?? db.find("appFilePrivate", hashOf(k));
      return [k, row ? `${row.organizationId === a ? "A" : row.organizationId === b ? "B" : "?"}:${row.source}` : "missing"];
    }));
    expect(placed).toEqual({
      chat1: "B:bugs", chat2: "A:chat", task1: "A:tasks", task2: "A:tasks", inv1: "B:inventory", train1: "A:training", train2: "B:training",
      prod1: "B:products", bug1: "A:bugs", logo1: "B:logo", ava1: "B:avatar", docimg1: "A:doc_image",
    });
    expect(db.find("appFile", hashOf("orphan1"))).toBeNull();
    expect(db.rows("appFile")).toHaveLength(keys.length - 1);
    expect(db.rows("appFilePrivate")).toHaveLength(1);
    expect(usageOf(db, a)).toMatchObject({ appBytes: 600n, appFileCount: 6, docBytes: docUsage?.docBytes, docCount: 1 });
    expect(usageOf(db, b)).toMatchObject({ appBytes: 600n, appFileCount: 6 });
    expect(db.find("migrationState", "app_files_v1")?.note).toBe("entries=17 recorded=12 already=0 unmatched=1 invalid=4");
  });

  test("already recorded keys are skipped, sizes as JSON strings are read, a re-run adds nothing", () => {
    const { db, orgA, orgB } = createSheetWorld();
    seed(db, orgA.organizationId, orgB.organizationId);
    record(db, orgA.organizationId, "bug1", 7n, "bugs");
    backfill(db, [entry("bug1", 100), entry("prod1", "12345678901234"), entry("prod1", 5)]);
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ appBytes: 7n, appFileCount: 1 });
    expect(usageOf(db, orgB.organizationId)).toMatchObject({ appBytes: 12_345_678_901_234n, appFileCount: 1 });
    expect(db.find("migrationState", "app_files_v1")?.note).toBe("entries=3 recorded=1 already=2 unmatched=0 invalid=0");
    backfill(db, [entry("bug1", 100), entry("prod1", 1)]);
    expect(usageOf(db, orgB.organizationId)).toMatchObject({ appBytes: 12_345_678_901_234n, appFileCount: 1 });
  });

  test("images inside a deck's Yjs state and a doc's uncompacted log are found", () => {
    const { db, orgA, orgB } = createSheetWorld();
    const deck = new Y.Doc();
    const slide = new Y.Map<unknown>();
    deck.getArray("slides").push([slide]);
    slide.set("src", ut("deckimg1"));
    slide.set("alt", "x");
    const deckId = crypto.randomUUID();
    db.run(R.createDriveDocument, orgB.owner, {
      organizationId: orgB.organizationId, documentId: deckId, fileType: "slides", space: "store", folderId: "", ownerMemberId: "",
      visibility: "", title: "Deck", templateId: "", initialState: Y.encodeStateAsUpdate(deck), html: "<section><h2>Menu</h2></section>",
      plainText: "Menu", wordCount: 1, actingMemberId: "",
    });
    const docId = crypto.randomUUID();
    db.run(DOCS.createDocument, orgA.owner, {
      organizationId: orgA.organizationId, documentId: docId, title: "Notes", visibility: "org_edit", templateId: undefined,
      initialState: new Uint8Array(4), html: "<p></p>", plainText: "", wordCount: 0,
    });
    db.run(MODULE.pushDocumentUpdate, orgA.owner, {
      documentId: docId, sessionId: "s1", payload: new TextEncoder().encode(`\u0001\u0002${ut("logimg1")}w\u0003`) });
    backfill(db, [entry("deckimg1"), entry("logimg1")]);
    expect(db.find("appFile", hashOf("deckimg1"))).toMatchObject({ organizationId: orgB.organizationId, source: "slides_image" });
    expect(db.find("appFile", hashOf("logimg1"))).toMatchObject({ organizationId: orgA.organizationId, source: "doc_image" });
  });

  test("wantedKeysInBytes: trailing printable bytes, back-to-back URLs and unwanted keys", () => {
    const bytes = new TextEncoder().encode(`\u0000${ut("k1")}+https://abc.ufs.sh/f/k2Z/x \u00ff${ut("k3")}`);
    expect(wantedKeysInBytes(bytes, new Set(["k1", "k2", "nope"]))).toEqual(["k1", "k2"]);
    expect(wantedKeysInBytes(new Uint8Array(0), new Set(["k1"]))).toEqual([]);
  });

  test("service only; not JSON, not a list or too many entries refused", () => {
    const { db, orgA } = createSheetWorld();
    expect(errorOf(() => db.run(S.serviceBackfillAppFiles, orgA.owner, { entries: "[]" }))).toContain("[drive.forbidden]");
    registerServiceIdentity(db);
    const run = (entries: string): string => errorOf(() => db.run(S.serviceBackfillAppFiles, SERVICE_IDENTITY, { entries }));
    expect(run("{")).toContain("[drive.invalid]");
    expect(run('{"key":"x"}')).toContain("[drive.invalid]");
    expect(run(JSON.stringify(Array.from({ length: APP_BACKFILL_MAX + 1 }, () => 0)))).toContain("[drive.batch_too_large]");
    expect(run("[]")).toBe("(no error)");
  });
});

describe("serviceRecomputeStorage", () => {
  function newDoc(db: FakeDb, by: FakeMember, bytes: number): string {
    const documentId = crypto.randomUUID();
    db.run(DOCS.createDocument, by, {
      organizationId: by.organizationId, documentId, title: "Notes", visibility: "org_edit", templateId: undefined,
      initialState: new Uint8Array(bytes), html: "<p>a</p>", plainText: "a", wordCount: 1,
    });
    return documentId;
  }
  const sizeOf = (db: FakeDb, id: string): unknown => db.find("documentSize", id)?.bytes ?? null;

  test("one org: the update log, stale totals and vanished documents are put right; the other org is untouched", () => {
    const { db, orgA, orgB } = createSheetWorld();
    const a = orgA.organizationId;
    const doc = newDoc(db, orgA.owner, 100);
    const sheet = newSheet(db, orgA.owner);
    const other = newDoc(db, orgB.owner, 50);
    record(db, a, "k1", 40n);
    db.run(MODULE.pushDocumentUpdate, orgA.owner, { documentId: doc, sessionId: "s1", payload: new Uint8Array(30) });
    expect(sizeOf(db, doc)).toBe(100n + 8n + 1n); // the hot path does not re-measure
    db.insert("documentSize", { documentId: crypto.randomUUID(), organizationId: a, fileType: "doc", bytes: 77n, updatedAt: new FakeTimestamp(0n) });
    db.patch("orgStorageUsage", a, { appBytes: 1n, appFileCount: 9, docCount: 5 });
    db.patch("orgStorageUsage", orgB.organizationId, { docBytes: 1n });

    service(db, S.serviceRecomputeStorage, { organizationId: a.toUpperCase() });
    expect(sizeOf(db, doc)).toBe(139n);
    expect(db.find("documentSize", sheet)?.fileType).toBe("sheet");
    expect(db.rows("documentSize").filter((r) => r.organizationId === a)).toHaveLength(2);
    expect(usageOf(db, a)).toMatchObject({ docBytes: 139n, docCount: 1, appBytes: 40n, appFileCount: 1 });
    expect(usageOf(db, orgB.organizationId)).toMatchObject({ docBytes: 1n });
    expect(sizeOf(db, other)).toBe(59n);
  });

  test("'' recomputes every org; an unchanged org is not rewritten", () => {
    const { db, orgA, orgB } = createSheetWorld();
    newDoc(db, orgA.owner, 10);
    newDoc(db, orgB.owner, 20);
    record(db, orgB.organizationId, "k2", 5n);
    db.patch("orgStorageUsage", orgA.organizationId, { docBytes: 0n });
    db.patch("orgStorageUsage", orgB.organizationId, { appBytes: 0n, docCount: 0 });
    const untouched = usageOf(db, orgA.organizationId);
    service(db, S.serviceRecomputeStorage, { organizationId: "" });
    expect(usageOf(db, orgA.organizationId)).toMatchObject({ docBytes: 19n, docCount: 1, appBytes: 0n, appFileCount: 0 });
    expect(usageOf(db, orgB.organizationId)).toMatchObject({ docBytes: 29n, docCount: 1, appBytes: 5n, appFileCount: 1 });
    expect(untouched).not.toBe(usageOf(db, orgA.organizationId));
    const settled = usageOf(db, orgA.organizationId);
    service(db, S.serviceRecomputeStorage, { organizationId: "" });
    expect(usageOf(db, orgA.organizationId)).toBe(settled);
  });

  test("service only; a malformed organization id is refused", () => {
    const { db, orgA } = createSheetWorld();
    expect(errorOf(() => db.run(S.serviceRecomputeStorage, orgA.owner, { organizationId: "" }))).toContain("[drive.forbidden]");
    registerServiceIdentity(db);
    expect(errorOf(() => db.run(S.serviceRecomputeStorage, SERVICE_IDENTITY, { organizationId: "nope" }))).toContain("[drive.invalid]");
  });
});
