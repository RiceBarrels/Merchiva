// Drive service reducers (spacetimedb/src/drive/service.ts), DS §6.4 + §5.3 with the CONTRACTS
// C9/C10 amendments: the reader registration, the sweep (verify jobs, trash retention, per-phase
// bounds), the GC queue (ack keeps held deletes, fail → dead, an exhausted verify job fails its
// still-pending upload), orphan reports (liveness, grace, unknown org,
// the brake), the reconcile finish, the quota override, backfillDriveAccessV1, and the
// service-only gate. Real module code with the real `driveDeps` wiring of index.ts.

import { describe, expect, test } from "bun:test";
import type { DriveDeps } from "../../../spacetimedb/src/drive/context";
import { defineDriveDocumentReducers } from "../../../spacetimedb/src/drive/documents";
import {
  DRIVE_GC_HOLD_SLACK_MICROS, DRIVE_GC_MAX_ATTEMPTS, DRIVE_ORPHAN_GRACE_MICROS, DRIVE_TRASH_RETENTION_MICROS,
  DRIVE_UPLOAD_TTL_MICROS, driveBlobKey, driveThumbKeyFor,
} from "../../../spacetimedb/src/drive/logic";
import { defineDriveReducers } from "../../../spacetimedb/src/drive/reducers";
import { defineDriveServiceReducers } from "../../../spacetimedb/src/drive/service";
import { defineDriveTrashReducers } from "../../../spacetimedb/src/drive/trash";
import type { DriveSchema } from "../../../spacetimedb/src/drive/types";
import { defineDriveUploadReducers } from "../../../spacetimedb/src/drive/uploads";
import {
  FakeIdentity, FakeTimestamp, SERVICE_IDENTITY, createDriveWorld, loadModule, moduleStubs,
  type FakeDb, type FakeMember, type Row,
} from "./fake-db";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const R = {
  ...defineDriveReducers(stdb, deps), ...defineDriveTrashReducers(stdb, deps), ...defineDriveDocumentReducers(stdb, deps),
  ...defineDriveUploadReducers(stdb, deps), ...defineDriveServiceReducers(stdb, deps),
};
const uuid = (): string => crypto.randomUUID();
const DAY = 86_400_000_000n;

function errorOf(fn: () => void): string {
  try { fn(); } catch (error) { return String((error as Error).message); }
  return "(no error)";
}
const micros = (value: unknown): bigint => (value as FakeTimestamp).microsSinceUnixEpoch;
function row(db: FakeDb, table: string, id: string): Row {
  const found = db.find(table, id);
  if (!found) throw new Error(`no ${table} ${id}`);
  return found;
}
function registerService(db: FakeDb): void {
  db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "test", registeredAt: new FakeTimestamp(db.nowMicros) });
}
const service = (db: FakeDb, fn: unknown, args: Record<string, unknown> = {}): void => db.run(fn, SERVICE_IDENTITY, args);
/** A pending upload begun through the reducer; returns its item id and key. */
function pending(db: FakeDb, by: FakeMember, size = 1000n): { itemId: string; blobKey: string } {
  const itemId = uuid();
  const blobKey = driveBlobKey(by.organizationId, itemId, uuid(), "a.pdf");
  db.run(R.beginDriveUpload, by, {
    organizationId: by.organizationId, itemId, space: "store", parentId: "", ownerMemberId: "", name: "a.pdf",
    mimeType: "application/pdf", sizeBytes: size, blobKey, actingMemberId: "",
  });
  return { itemId, blobKey };
}
/** A ready upload: begin + commit. */
function ready(db: FakeDb, by: FakeMember, size = 100n): { itemId: string; blobKey: string } {
  const p = pending(db, by, size);
  service(db, R.serviceCommitDriveUpload, { itemId: p.itemId, blobKey: p.blobKey, observedBytes: size, etag: "e" });
  return p;
}
const blobs = (entries: Array<{ k: string; ageMicros?: bigint; s?: number }>, nowMicros: bigint): string =>
  JSON.stringify(entries.map((e) => ({ k: e.k, s: e.s ?? 10, u: Number((nowMicros - (e.ageMicros ?? 2n * DAY)) / 1000n) })));

describe("serviceEnsureDriveReader and serviceDriveSweep", () => {
  test("the caller is registered once as a drive_service_reader (the sweep does it too)", () => {
    const { db } = createDriveWorld();
    registerService(db);
    service(db, R.serviceDriveSweep, { maxItems: 0 });
    service(db, R.serviceEnsureDriveReader);
    expect(db.rows("driveServiceReader")).toHaveLength(1);
    expect(row(db, "driveServiceReader", SERVICE_IDENTITY.hex)).toMatchObject({ scope: "service", userId: SERVICE_IDENTITY });
  });

  test("expired pending uploads get one verify job each, bounded per call; fresh ones stay untouched", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const old = [pending(db, orgA.staff, 7n), pending(db, orgA.staff), pending(db, orgA.manager)];
    db.advance(DRIVE_UPLOAD_TTL_MICROS + 1n);
    const fresh = pending(db, orgA.staff);
    service(db, R.serviceDriveSweep, { maxItems: 2 });
    expect(db.rows("driveBlobGc")).toHaveLength(2);
    service(db, R.serviceDriveSweep, { maxItems: 10 });
    service(db, R.serviceDriveSweep, { maxItems: 10 });
    expect(db.rows("driveBlobGc").map((r) => r.blobKey).sort()).toEqual(old.map((p) => p.blobKey).sort());
    expect(row(db, "driveBlobGc", old[0].blobKey)).toMatchObject({ action: "verify", reason: "upload_expired", declaredBytes: 7n, attempts: 0 });
    expect(db.find("driveBlobGc", fresh.blobKey)).toBeNull();
    for (const p of old) expect(row(db, "driveItem", p.itemId).status).toBe("pending");
  });

  test("verify outcomes: found → committed; missing → failed, and its delete outlives the cron's ack", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const [found, missing] = [pending(db, orgA.staff), pending(db, orgA.staff)];
    db.advance(DRIVE_UPLOAD_TTL_MICROS + DRIVE_GC_HOLD_SLACK_MICROS * 5n);
    service(db, R.serviceDriveSweep, { maxItems: 10 });
    service(db, R.serviceCommitDriveUpload, { itemId: found.itemId, blobKey: found.blobKey, observedBytes: 1000n, etag: "e" });
    service(db, R.serviceFailDriveUpload, { itemId: missing.itemId, blobKey: missing.blobKey, reason: "upload_expired" });
    expect(row(db, "driveItem", found.itemId).status).toBe("ready");
    expect(db.find("driveItem", missing.itemId)).toBeNull();
    const job = row(db, "driveBlobGc", missing.blobKey);
    expect(job).toMatchObject({ action: "delete", reason: "upload_expired" });
    expect(micros(job.holdUntil)).toBeGreaterThanOrEqual(db.nowMicros + DRIVE_GC_HOLD_SLACK_MICROS);
    service(db, R.serviceAckDriveBlobGc, { blobKeysJson: JSON.stringify([found.blobKey, missing.blobKey]) });
    expect(row(db, "driveBlobGc", missing.blobKey).action).toBe("delete");
    expect(db.find("driveBlobGc", found.blobKey)).toBeNull();
    expect(row(db, "driveUsage", orgA.organizationId)).toMatchObject({ bytesUsed: 1000n, bytesReserved: 0n, fileCount: 1, itemCount: 1 });
  });

  test("trash retention: uploaded files 30 days in the trash go for good; documents never auto-delete", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const folder = uuid();
    db.run(R.createDriveFolder, orgA.owner, { organizationId: orgA.organizationId, itemId: folder, space: "store", parentId: "", ownerMemberId: "", name: "Old", actingMemberId: "" });
    const inside = ready(db, orgA.owner, 100n);
    db.run(R.moveDriveEntries, orgA.owner, { organizationId: orgA.organizationId, itemIds: JSON.stringify([inside.itemId]), documentIds: "[]", targetSpace: "store", targetParentId: folder, targetOwnerMemberId: "", actingMemberId: "" });
    const docId = uuid();
    db.run(R.createDriveDocument, orgA.owner, { organizationId: orgA.organizationId, documentId: docId, fileType: "doc", space: "store", folderId: folder, ownerMemberId: "", visibility: "", title: "D", templateId: "", initialState: undefined, html: undefined, plainText: undefined, wordCount: undefined, actingMemberId: "" });
    const trash = (itemId: string) => db.run(R.trashDriveEntries, orgA.owner, { organizationId: orgA.organizationId, itemIds: JSON.stringify([itemId]), documentIds: "[]", actingMemberId: "" });
    trash(folder);
    db.advance(DRIVE_TRASH_RETENTION_MICROS - DAY);
    const recent = ready(db, orgA.owner, 50n);
    trash(recent.itemId);
    service(db, R.serviceDriveSweep, { maxItems: 500 });
    expect(db.find("driveItem", folder)).not.toBeNull();
    db.advance(2n * DAY);
    service(db, R.serviceDriveSweep, { maxItems: 500 });
    expect(db.find("driveItem", folder)).toBeNull();
    expect(db.find("driveItem", inside.itemId)).toBeNull();
    expect(row(db, "driveBlobGc", inside.blobKey)).toMatchObject({ action: "delete", reason: "trash_expired" });
    expect(row(db, "documentFile", docId)).toMatchObject({ fileType: "doc", folderId: "" }); // out of the deleted folder
    expect(row(db, "document", docId).trashedAt).toBeTruthy();
    expect(row(db, "driveItem", recent.itemId).trashed).toBe(true);
    expect(row(db, "driveUsage", orgA.organizationId)).toMatchObject({ bytesUsed: 50n, fileCount: 1, itemCount: 1 });
  });

  test("the retention phase reads only expired trash roots, off the byTrashRootAt range, oldest first (review r2)", () => {
    const { db, orgA, orgB } = createDriveWorld();
    registerService(db);
    const trash = (by: FakeMember, itemId: string) => db.run(R.trashDriveEntries, by, {
      organizationId: by.organizationId, itemIds: JSON.stringify([itemId]), documentIds: "[]", actingMemberId: "" });
    const oldest = ready(db, orgB.owner);
    trash(orgB.owner, oldest.itemId);
    db.advance(DAY);
    const older = ready(db, orgA.owner);
    trash(orgA.owner, older.itemId);
    db.advance(DRIVE_TRASH_RETENTION_MICROS);
    const recent = Array.from({ length: 30 }, () => ready(db, orgA.staff));
    for (const f of recent) trash(orgA.staff, f.itemId);
    const items = db.db.driveItem as Record<string, { filter(v: unknown): IterableIterator<Row> }>;
    const reads: Record<string, number> = {};
    const originals = Object.fromEntries(["byTrashed", "byTrashRootAt"].map((name) => [name, items[name].filter]));
    for (const name of Object.keys(originals)) {
      items[name].filter = function* (v: unknown) { // counts the rows the module actually consumes
        for (const r of originals[name](v)) {
          reads[name] = (reads[name] ?? 0) + 1;
          yield r;
        }
      };
    }
    try {
      service(db, R.serviceDriveSweep, { maxItems: 1 });
      expect([db.find("driveItem", oldest.itemId), db.find("driveItem", older.itemId)?.id]).toEqual([null, older.itemId]);
      service(db, R.serviceDriveSweep, { maxItems: 500 });
    } finally {
      for (const [name, fn] of Object.entries(originals)) items[name].filter = fn;
    }
    expect(db.find("driveItem", older.itemId)).toBeNull();
    expect(recent.every((f) => row(db, "driveItem", f.itemId).trashed)).toBe(true);
    // Two expired roots, each read once; the 30 recent roots and the rest of the trash never.
    expect(reads).toEqual({ byTrashRootAt: 2 });
  });

  test("each phase is bounded on its own: maxItems 1 queues one verify job and removes one expired trash root", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const roots = [ready(db, orgA.owner), ready(db, orgA.owner)];
    for (const f of roots) {
      db.run(R.trashDriveEntries, orgA.owner, { organizationId: orgA.organizationId, itemIds: JSON.stringify([f.itemId]), documentIds: "[]", actingMemberId: "" });
    }
    const uploads = [pending(db, orgA.staff), pending(db, orgA.staff)];
    db.advance(DRIVE_TRASH_RETENTION_MICROS + DAY);
    const rootsLeft = () => roots.filter((f) => db.find("driveItem", f.itemId)).length;
    const verifyKeys = () => db.rows("driveBlobGc").filter((r) => r.action === "verify").map((r) => r.blobKey as string).sort();
    service(db, R.serviceDriveSweep, { maxItems: 0 });
    expect([rootsLeft(), db.rows("driveBlobGc").length]).toEqual([2, 0]);
    service(db, R.serviceDriveSweep, { maxItems: 1 });
    expect([rootsLeft(), verifyKeys().length]).toEqual([1, 1]);
    service(db, R.serviceDriveSweep, { maxItems: 1 });
    expect(rootsLeft()).toBe(0);
    expect(verifyKeys()).toEqual(uploads.map((p) => p.blobKey).sort());
  });
});

describe("the GC queue", () => {
  test("ack: finished keys go, deletes still inside their hold stay (touched), unknown keys are ignored", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const cancelled = pending(db, orgA.staff);
    db.run(R.abortDriveUpload, orgA.staff, { itemId: cancelled.itemId }); // held until deadline + slack
    const dead = driveBlobKey(orgA.organizationId, uuid(), uuid(), "x");
    service(db, R.serviceDiscardDriveBlob, { itemId: dead.split("/")[2], blobKey: dead }); // held until now
    const touchedBefore = micros(row(db, "driveBlobGc", cancelled.blobKey).updatedAt);
    service(db, R.serviceAckDriveBlobGc, { blobKeysJson: JSON.stringify([cancelled.blobKey, dead, dead, "org/unknown"]) });
    expect(db.find("driveBlobGc", dead)).toBeNull();
    expect(micros(row(db, "driveBlobGc", cancelled.blobKey).updatedAt)).toBeGreaterThan(touchedBefore);
    db.advance(DRIVE_UPLOAD_TTL_MICROS + DRIVE_GC_HOLD_SLACK_MICROS + 1n);
    service(db, R.serviceAckDriveBlobGc, { blobKeysJson: JSON.stringify([cancelled.blobKey]) });
    expect(db.find("driveBlobGc", cancelled.blobKey)).toBeNull();
  });

  test("fail: attempts count up, the error is clipped, and the job is dead at DRIVE_GC_MAX_ATTEMPTS", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const key = driveBlobKey(orgA.organizationId, uuid(), uuid(), "x");
    service(db, R.serviceDiscardDriveBlob, { itemId: key.split("/")[2], blobKey: key });
    for (let i = 1; i < DRIVE_GC_MAX_ATTEMPTS; i++) service(db, R.serviceFailDriveBlobGc, { blobKeysJson: JSON.stringify([key]), error: "boom" });
    expect(row(db, "driveBlobGc", key)).toMatchObject({ action: "delete", attempts: DRIVE_GC_MAX_ATTEMPTS - 1, lastError: "boom" });
    service(db, R.serviceFailDriveBlobGc, { blobKeysJson: JSON.stringify([key]), error: "x".repeat(900) });
    expect(row(db, "driveBlobGc", key)).toMatchObject({ action: "dead", attempts: DRIVE_GC_MAX_ATTEMPTS, lastError: "x".repeat(500) });
  });

  test("a verify job out of attempts fails its still-pending upload (held delete) instead of going dead", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const p = pending(db, orgA.staff);
    db.advance(DRIVE_UPLOAD_TTL_MICROS + 1n);
    service(db, R.serviceDriveSweep, { maxItems: 10 });
    const failGc = () => service(db, R.serviceFailDriveBlobGc, { blobKeysJson: JSON.stringify([p.blobKey]), error: "head failed" });
    for (let i = 1; i < DRIVE_GC_MAX_ATTEMPTS; i++) failGc();
    expect(row(db, "driveBlobGc", p.blobKey)).toMatchObject({ action: "verify", attempts: DRIVE_GC_MAX_ATTEMPTS - 1 });
    expect(row(db, "driveItem", p.itemId).status).toBe("pending");
    failGc();
    expect(db.find("driveItem", p.itemId)).toBeNull();
    expect(row(db, "driveUsage", orgA.organizationId)).toMatchObject({ bytesReserved: 0n, itemCount: 0 });
    for (const key of [p.blobKey, driveThumbKeyFor(p.blobKey)]) {
      expect(row(db, "driveBlobGc", key)).toMatchObject({ action: "delete", reason: "upload_expired", attempts: 0, itemId: p.itemId });
      expect(micros(row(db, "driveBlobGc", key).holdUntil)).toBe(db.nowMicros + DRIVE_GC_HOLD_SLACK_MICROS);
    }
    service(db, R.serviceAckDriveBlobGc, { blobKeysJson: JSON.stringify([p.blobKey]) }); // an ack in the same run keeps it
    expect(row(db, "driveBlobGc", p.blobKey).action).toBe("delete");
    // A verify job whose row is already gone has nothing to settle: it goes dead like any other.
    const orphanVerify = pending(db, orgA.staff);
    db.advance(DRIVE_UPLOAD_TTL_MICROS + 1n);
    service(db, R.serviceDriveSweep, { maxItems: 10 });
    const gone = row(db, "driveItem", orphanVerify.itemId);
    db.transact((tables) => (tables.driveItem as { delete(r: Row): boolean }).delete(gone));
    for (let i = 0; i < DRIVE_GC_MAX_ATTEMPTS; i++) service(db, R.serviceFailDriveBlobGc, { blobKeysJson: JSON.stringify([orphanVerify.blobKey]), error: "e" });
    expect(row(db, "driveBlobGc", orphanVerify.blobKey)).toMatchObject({ action: "dead", attempts: DRIVE_GC_MAX_ATTEMPTS });
  });

  test("list arguments: unreadable → invalid, too many or too long → batch_too_large (before parsing)", () => {
    const { db } = createDriveWorld();
    registerService(db);
    const ack = (blobKeysJson: string) => () => service(db, R.serviceAckDriveBlobGc, { blobKeysJson });
    expect(errorOf(ack("nope"))).toContain("[drive.invalid]");
    expect(errorOf(ack("[1]"))).toContain("[drive.invalid]");
    expect(errorOf(ack('{"k":1}'))).toContain("[drive.invalid]");
    expect(errorOf(ack(JSON.stringify(Array.from({ length: 1001 }, (_, i) => `k${i}`))))).toContain("[drive.batch_too_large]");
    const started = performance.now();
    expect(errorOf(ack(`["${"a".repeat(2_000_000)}"]`))).toContain("[drive.batch_too_large]");
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("serviceEnqueueOrphanDriveBlobs", () => {
  test("old keys no row owns are queued as orphans; live, young, foreign and queued keys are not", () => {
    const { db, orgA, orgB } = createDriveWorld();
    registerService(db);
    const done = ready(db, orgA.staff);
    service(db, R.serviceSetDriveThumb, { itemId: done.itemId, thumbKey: driveThumbKeyFor(done.blobKey), observedBytes: 5n });
    const inFlight = pending(db, orgA.staff);
    const orphan = driveBlobKey(orgA.organizationId, uuid(), uuid(), "gone.pdf");
    const queued = driveBlobKey(orgA.organizationId, uuid(), uuid(), "queued.pdf");
    service(db, R.serviceDiscardDriveBlob, { itemId: queued.split("/")[2], blobKey: queued });
    const entries = [
      { k: done.blobKey }, { k: driveThumbKeyFor(done.blobKey) }, { k: inFlight.blobKey }, { k: driveThumbKeyFor(inFlight.blobKey) },
      { k: orphan, s: 4096 }, { k: queued }, { k: driveBlobKey(orgA.organizationId, uuid(), uuid(), "young"), ageMicros: DRIVE_ORPHAN_GRACE_MICROS - DAY / 24n },
      { k: driveBlobKey(orgB.organizationId, uuid(), uuid(), "b") }, { k: "org/not-a-key" },
    ];
    service(db, R.serviceEnqueueOrphanDriveBlobs, { organizationId: orgA.organizationId, blobsJson: blobs(entries, db.nowMicros) });
    expect(db.rows("driveBlobGc").map((r) => r.blobKey).sort()).toEqual([orphan, queued].sort());
    expect(row(db, "driveBlobGc", orphan)).toMatchObject({ action: "delete", reason: "orphan", declaredBytes: 4096n, itemId: orphan.split("/")[2] });
    service(db, R.serviceEnqueueOrphanDriveBlobs, { organizationId: uuid(), blobsJson: blobs([{ k: driveBlobKey(uuid(), uuid(), uuid(), "z") }], db.nowMicros) });
    expect(db.rows("driveBlobGc")).toHaveLength(2); // an organization this database does not know is skipped
  });

  test("the brake refuses the whole page: over 100 orphans, or more than 1 in 5 of at least 20 keys", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const org = orgA.organizationId;
    const orphans = (n: number) => Array.from({ length: n }, () => ({ k: driveBlobKey(org, uuid(), uuid(), "o") }));
    const live = Array.from({ length: 16 }, () => ({ k: ready(db, orgA.staff, 1n).blobKey }));
    const report = (entries: Array<{ k: string }>) => () =>
      service(db, R.serviceEnqueueOrphanDriveBlobs, { organizationId: org, blobsJson: blobs(entries, db.nowMicros) });
    expect(errorOf(report(orphans(101)))).toContain("[drive.orphan_brake]");
    expect(errorOf(report([...live.slice(1), ...orphans(5)]))).toContain("[drive.orphan_brake]"); // 5 of 20
    expect(db.rows("driveBlobGc")).toEqual([]);
    report([...live, ...orphans(4)])(); // 4 of 20
    expect(db.rows("driveBlobGc")).toHaveLength(4);
    report(orphans(3))(); // fewer than 20 keys: the share rule does not apply
    expect(db.rows("driveBlobGc")).toHaveLength(7);
    const many = [...live, ...Array.from({ length: 388 }, () => ({ k: ready(db, orgA.staff, 1n).blobKey }))];
    expect(errorOf(report([...many, ...orphans(101)]))).toContain("[drive.orphan_brake]"); // 101 of 505: the cap alone
    report([...many, ...orphans(100)])();
    expect(db.rows("driveBlobGc")).toHaveLength(107);
  });
});

describe("reconcile finish and the quota override", () => {
  test("usage is recomputed from the rows; the listing totals are stored", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const done = ready(db, orgA.staff, 100n);
    service(db, R.serviceSetDriveThumb, { itemId: done.itemId, thumbKey: driveThumbKeyFor(done.blobKey), observedBytes: 10n });
    const inFlight = pending(db, orgA.staff, 50n);
    service(db, R.serviceSetDriveThumb, { itemId: inFlight.itemId, thumbKey: driveThumbKeyFor(inFlight.blobKey), observedBytes: 5n });
    db.run(R.createDriveFolder, orgA.staff, { organizationId: orgA.organizationId, itemId: uuid(), space: "store", parentId: "", ownerMemberId: "", name: "F", actingMemberId: "" });
    db.patch("driveUsage", orgA.organizationId, { bytesUsed: 9n, bytesReserved: 999n, fileCount: 40, itemCount: 0 });
    service(db, R.serviceFinishDriveReconcile, { organizationId: orgA.organizationId, measuredBytes: 777n, measuredCount: 3 });
    const usage = row(db, "driveUsage", orgA.organizationId);
    expect(usage).toMatchObject({ bytesUsed: 115n, bytesReserved: 50n, fileCount: 1, itemCount: 3, measuredBytes: 777n, measuredCount: 3 });
    expect(micros(usage.measuredAt)).toBe(db.nowMicros);
    const stranger = uuid();
    service(db, R.serviceFinishDriveReconcile, { organizationId: stranger, measuredBytes: 1n, measuredCount: 1 });
    expect(db.find("driveUsage", stranger)).toBeNull();
  });

  test("serviceSetDriveQuota sets and clears one org's override; an unknown org is refused", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    service(db, R.serviceSetDriveQuota, { organizationId: orgA.organizationId, quotaBytesOverride: 5n });
    expect(row(db, "driveUsage", orgA.organizationId).quotaBytesOverride).toBe(5n);
    service(db, R.serviceSetDriveQuota, { organizationId: orgA.organizationId, quotaBytesOverride: 0n });
    expect(row(db, "driveUsage", orgA.organizationId).quotaBytesOverride).toBe(0n);
    expect(errorOf(() => service(db, R.serviceSetDriveQuota, { organizationId: uuid(), quotaBytesOverride: 5n }))).toContain("[drive.not_found]");
  });
});

describe("backfillDriveAccessV1", () => {
  function world() {
    const w = createDriveWorld();
    const { db, orgA } = w;
    const doc = (by: FakeMember, space: string): string => {
      const documentId = uuid();
      db.run(R.createDriveDocument, by, { organizationId: by.organizationId, documentId, fileType: "doc", space, folderId: "", ownerMemberId: "", visibility: "", title: "D", templateId: "", initialState: undefined, html: undefined, plainText: undefined, wordCount: undefined, actingMemberId: "" });
      return documentId;
    };
    const docs = [doc(orgA.owner, "store"), doc(orgA.staff, "my")];
    // Lost index rows (a missed write site), plus rows nothing justifies any more.
    db.transact((tables) => {
      for (const name of ["documentReaderIndex", "driveAdminIndex"]) {
        const table = tables[name] as { iter(): Iterable<Row>; delete(r: Row): boolean };
        for (const r of [...table.iter()]) table.delete(r);
      }
    });
    const scopeA = row(db, "driveOrgState", orgA.organizationId).adminScope as string;
    const stranger = FakeIdentity.random();
    const goneDoc = uuid();
    db.insert("driveAdminIndex", { id: `${scopeA}:${stranger.hex}`, adminScope: scopeA, userId: stranger });
    db.insert("driveAdminIndex", { id: `${scopeA}:${orgA.staff.identity.hex}`, adminScope: scopeA, userId: orgA.staff.identity });
    db.insert("documentReaderIndex", { id: `${goneDoc}:${stranger.hex}`, documentId: goneDoc, userId: stranger });
    return { ...w, docs, stranger, goneDoc };
  }
  const readersOf = (db: FakeDb, documentId: string): string[] =>
    db.rows("documentReaderIndex").filter((r) => r.documentId === documentId).map((r) => (r.userId as FakeIdentity).hex).sort();
  const adminHexes = (db: FakeDb): string[] => db.rows("driveAdminIndex").map((r) => (r.userId as FakeIdentity).hex).sort();
  const hexes = (...members: FakeMember[]): string[] => members.map((m) => m.identity.hex).sort();

  test("every org: both indexes rebuilt, unjustified rows removed, counts recorded", () => {
    const { db, orgA, orgB, docs, goneDoc } = world();
    registerService(db);
    service(db, R.backfillDriveAccessV1, { organizationId: "" });
    expect(readersOf(db, docs[0])).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff));
    expect(readersOf(db, docs[1])).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff));
    expect(readersOf(db, goneDoc)).toEqual([]);
    expect(adminHexes(db)).toEqual(hexes(orgA.owner, orgA.manager, orgB.owner, orgB.manager));
    expect(row(db, "migrationState", "drive_access_v1").note).toBe("members=6 docs=2 readerRows=6 adminRows=4 removed=2");
    service(db, R.backfillDriveAccessV1, { organizationId: "" }); // idempotent
    expect(row(db, "migrationState", "drive_access_v1").note).toBe("members=6 docs=2 readerRows=6 adminRows=4 removed=0");
  });

  test("one org: only that org's rows (vanished documents' readers wait for the every-org run)", () => {
    const { db, orgA, orgB, docs, goneDoc, stranger } = world();
    registerService(db);
    service(db, R.backfillDriveAccessV1, { organizationId: orgA.organizationId.toUpperCase() });
    expect(readersOf(db, docs[1])).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff));
    expect(readersOf(db, goneDoc)).toEqual([stranger.hex]);
    expect(adminHexes(db)).toEqual(hexes(orgA.owner, orgA.manager));
    expect(db.find("driveOrgState", orgB.organizationId)).toBeNull();
    expect(row(db, "migrationState", "drive_access_v1").note)
      .toBe(`org=${orgA.organizationId} members=3 docs=2 readerRows=6 adminRows=2 removed=1`);
  });

  test("the service identity or a platform admin; anyone else is refused (the shared requireAdmin is not used)", () => {
    const { db, orgA } = world();
    const run = (sender: FakeIdentity, organizationId = "") => () => db.run(R.backfillDriveAccessV1, sender, { organizationId });
    for (const sender of [orgA.owner.identity, orgA.staff.identity, FakeIdentity.random(), SERVICE_IDENTITY]) {
      expect(errorOf(run(sender))).toContain("[drive.forbidden]");
    }
    expect(db.find("migrationState", "drive_access_v1")).toBeNull();
    const admin = FakeIdentity.random();
    db.insert("user", { identity: admin, email: "admin@example.test", passwordHash: undefined, displayName: undefined, avatarUrl: undefined, lastActiveOrgId: undefined, createdAt: new FakeTimestamp(db.nowMicros), isAdmin: true });
    run(admin)();
    expect(row(db, "migrationState", "drive_access_v1").note).toContain("members=6");
    expect(errorOf(run(admin, "not-an-org"))).toContain("[drive.invalid]");
  });
});

describe("the service-only gate", () => {
  test("every service reducer refuses members and an unregistered service identity, writing nothing", () => {
    const { db, orgA } = createDriveWorld();
    const org = orgA.organizationId;
    const key = driveBlobKey(org, uuid(), uuid(), "x");
    const calls: Array<[unknown, Record<string, unknown>]> = [
      [R.serviceEnsureDriveReader, {}],
      [R.serviceDriveSweep, { maxItems: 10 }],
      [R.serviceAckDriveBlobGc, { blobKeysJson: JSON.stringify([key]) }],
      [R.serviceFailDriveBlobGc, { blobKeysJson: JSON.stringify([key]), error: "e" }],
      [R.serviceEnqueueOrphanDriveBlobs, { organizationId: org, blobsJson: blobs([{ k: key }], db.nowMicros) }],
      [R.serviceFinishDriveReconcile, { organizationId: org, measuredBytes: 1n, measuredCount: 1 }],
      [R.serviceSetDriveQuota, { organizationId: org, quotaBytesOverride: 1n }],
    ];
    for (const sender of [orgA.owner.identity, orgA.manager.identity, SERVICE_IDENTITY]) {
      for (const [fn, args] of calls) expect(errorOf(() => db.run(fn, sender, args))).toContain("[drive.forbidden]");
    }
    expect(db.rows("driveServiceReader")).toEqual([]);
    expect(db.rows("driveBlobGc")).toEqual([]);
    expect(db.rows("driveUsage")).toEqual([]);
  });
});
