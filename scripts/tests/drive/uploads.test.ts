// Drive uploads (spacetimedb/src/drive/uploads.ts), DS §6.3 "Uploads" + §6.4 with the
// CONTRACTS C9–C11, C13, C44 amendments: the recomputed blob key, blocked types, empty
// files, the flat quota (support override ‖ DRIVE_DEFAULT_QUOTA_BYTES), the per-identity
// pending caps, replays, GC-queued keys, a store tablet acting for its operator, authorize (tuple,
// thumb, TTL extension, attempts), abort holds, commit / fail / thumb / discard, and the service-only gate. Real module code
// with the real `driveDeps` wiring of spacetimedb/src/index.ts, over the two-org fake db.

import { describe, expect, test } from "bun:test";
import type { DriveDeps } from "../../../spacetimedb/src/drive/context";
import {
  DRIVE_DEFAULT_QUOTA_BYTES, DRIVE_ETAG_MAX, DRIVE_GC_HOLD_SLACK_MICROS, DRIVE_MAX_FILE_BYTES, DRIVE_MAX_ITEMS_PER_ORG,
  DRIVE_MAX_PENDING_PER_UPLOADER, DRIVE_THUMB_MAX_BYTES, DRIVE_UPLOAD_MAX_ATTEMPTS, DRIVE_UPLOAD_TTL_MICROS,
  DRIVE_OPERATOR_SESSION_TTL_MICROS, cleanDriveName, driveBlobKey, driveThumbKeyFor,
} from "../../../spacetimedb/src/drive/logic";
import { defineDriveReducers } from "../../../spacetimedb/src/drive/reducers";
import { defineDriveServiceReducers } from "../../../spacetimedb/src/drive/service";
import type { DriveSchema } from "../../../spacetimedb/src/drive/types";
import { defineDriveUploadReducers } from "../../../spacetimedb/src/drive/uploads";
import {
  FakeTimestamp, SERVICE_IDENTITY, createDriveWorld, loadModule, moduleStubs,
  type FakeDb, type FakeIdentity, type FakeMember, type Row,
} from "./fake-db";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const R = { ...defineDriveReducers(stdb, deps), ...defineDriveUploadReducers(stdb, deps), ...defineDriveServiceReducers(stdb, deps) };
const uuid = (): string => crypto.randomUUID();
const HOUR = 3_600_000_000n;

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
/** driveDeps checks the service_identity table, not the test stub. */
function registerService(db: FakeDb): void {
  db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "test", registeredAt: new FakeTimestamp(db.nowMicros) });
}

interface Planned { itemId: string; blobId: string; name: string; mimeType: string; sizeBytes: bigint; blobKey: string }
/** What lib/drive/upload.ts planDriveUpload computes on the client. */
function plan(organizationId: string, o: { name?: string; mimeType?: string; size?: bigint } = {}): Planned {
  const itemId = uuid();
  const blobId = uuid();
  const name = o.name ?? "Q3 report.pdf";
  return {
    itemId, blobId, name, mimeType: o.mimeType ?? "application/pdf", sizeBytes: o.size ?? 1000n,
    blobKey: driveBlobKey(organizationId, itemId, blobId, cleanDriveName(name) ?? name),
  };
}
function begin(db: FakeDb, by: FakeMember | FakeIdentity, p: Planned, o: {
  org?: string; space?: string; parentId?: string; ownerMemberId?: string; blobKey?: string; acting?: string;
} = {}): void {
  const org = o.org ?? ("organizationId" in by ? by.organizationId : "");
  db.run(R.beginDriveUpload, by, {
    organizationId: org, itemId: p.itemId, space: o.space ?? "store", parentId: o.parentId ?? "", ownerMemberId: o.ownerMemberId ?? "",
    name: p.name, mimeType: p.mimeType, sizeBytes: p.sizeBytes, blobKey: o.blobKey ?? p.blobKey, actingMemberId: o.acting ?? "",
  });
}
function authorize(db: FakeDb, by: FakeMember, p: Planned, o: { variant?: string; pathname?: string; size?: bigint; mime?: string; multipart?: boolean } = {}): void {
  db.run(R.authorizeDriveUpload, by, {
    itemId: p.itemId, variant: o.variant ?? "original", pathname: o.pathname ?? p.blobKey, sizeBytes: o.size ?? p.sizeBytes,
    mimeType: o.mime ?? p.mimeType, multipart: o.multipart ?? false,
  });
}
const commit = (db: FakeDb, p: Planned, observed: bigint, etag = "etag-1", sender: FakeIdentity | FakeMember = SERVICE_IDENTITY): void =>
  db.run(R.serviceCommitDriveUpload, sender, { itemId: p.itemId, blobKey: p.blobKey, observedBytes: observed, etag });
const usage = (db: FakeDb, org: string): Row => row(db, "driveUsage", org);
const setQuota = (db: FakeDb, org: string, bytes: bigint): void =>
  db.run(R.serviceSetDriveQuota, SERVICE_IDENTITY, { organizationId: org, quotaBytesOverride: bytes });

describe("beginDriveUpload", () => {
  test("a pending row that reserves its declared size, attributed and owned per container", () => {
    const { db, orgA } = createDriveWorld();
    const p = plan(orgA.organizationId, { name: "  Q3 report.pdf ", mimeType: "Application/PDF; charset=binary" });
    begin(db, orgA.staff, p);
    const item = row(db, "driveItem", p.itemId);
    expect(item).toMatchObject({
      kind: "file", status: "pending", space: "store", parentId: "", name: "Q3 report.pdf", mimeType: "application/pdf",
      sizeBytes: 1000n, blobKey: p.blobKey, thumbKey: "", thumbBytes: 0n, etag: "", uploadAttempts: 0, trashed: false,
      ownerMemberId: orgA.staff.memberId, createdByMemberId: orgA.staff.memberId,
      adminScope: row(db, "driveOrgState", orgA.organizationId).adminScope,
    });
    expect((item.uploaderIdentity as FakeIdentity).hex).toBe(orgA.staff.identity.hex);
    expect(micros(item.uploadExpiresAt)).toBe(micros(item.createdAt) + DRIVE_UPLOAD_TTL_MICROS);
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesReserved: 1000n, bytesUsed: 0n, itemCount: 1, fileCount: 0 });
    // An admin uploading into a member's My root: the space owner owns it.
    const mine = plan(orgA.organizationId);
    begin(db, orgA.manager, mine, { space: "my", ownerMemberId: orgA.staff.memberId });
    expect(row(db, "driveItem", mine.itemId)).toMatchObject({ ownerMemberId: orgA.staff.memberId, createdByMemberId: orgA.manager.memberId });
  });

  test("the module recomputes the key: leaf, org, item, blob id and thumb keys are refused, nothing written", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const p = plan(orgA.organizationId);
    const wrong = [
      `org/${orgA.organizationId}/${p.itemId}/${p.blobId}/other.pdf`,
      driveBlobKey(orgB.organizationId, p.itemId, p.blobId, p.name),
      driveBlobKey(orgA.organizationId, uuid(), p.blobId, p.name),
      driveBlobKey(orgA.organizationId, p.itemId, "00000000-0000-0000-0000-000000000000", p.name),
      driveThumbKeyFor(p.blobKey),
      p.blobKey.toUpperCase(),
      "",
    ];
    for (const blobKey of wrong) expect(errorOf(() => begin(db, orgA.staff, p, { blobKey }))).toContain("[drive.invalid]");
    expect(db.find("driveItem", p.itemId)).toBeNull();
    expect(db.rows("driveUsage")).toEqual([]);
  });

  test("blocked types, empty files, oversize, bad names and types", () => {
    const { db, orgA } = createDriveWorld();
    const org = orgA.organizationId;
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { name: "setup.exe" })))).toContain("[drive.blocked_type]");
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { name: "a.bin", mimeType: "application/x-msdownload" })))).toContain("[drive.blocked_type]");
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { name: "run.sh‮" })))).toContain("[drive.blocked_type]");
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { size: 0n })))).toContain("[drive.invalid]");
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { size: DRIVE_MAX_FILE_BYTES + 1n })))).toContain("[drive.too_large]");
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { name: ".." })))).toContain("[drive.invalid_name]");
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { mimeType: "not a type" })))).toContain("[drive.invalid]");
    expect(errorOf(() => begin(db, orgA.staff, { ...plan(org), itemId: "nope" }))).toContain("[drive.invalid]");
    begin(db, orgA.staff, plan(org, { size: DRIVE_MAX_FILE_BYTES })); // exactly the cap is fine
    expect(db.rows("driveItem")).toHaveLength(1);
  });

  test("quota: support's override when set, else the flat default (never the subscription)", () => {
    const { db, orgA, orgB } = createDriveWorld();
    registerService(db);
    const org = orgA.organizationId;
    setQuota(db, org, 0n);
    db.patch("driveUsage", org, { bytesUsed: DRIVE_DEFAULT_QUOTA_BYTES - 999n });
    db.patch("organization", row(db, "organization", orgA.organizationId).id, { subscriptionStatus: "active" });
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { size: 1000n })))).toContain("[drive.quota_exceeded]");
    begin(db, orgA.staff, plan(org, { size: 999n }));
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { size: 1n })))).toContain("[drive.quota_exceeded]");
    setQuota(db, org, DRIVE_DEFAULT_QUOTA_BYTES + 5000n);
    begin(db, orgA.staff, plan(org, { size: 5000n }));
    setQuota(db, org, 1000n);
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { size: 1n })))).toContain("[drive.quota_exceeded]");
    begin(db, orgB.staff, plan(orgB.organizationId, { size: 1000n })); // another org's quota is its own
    expect(usage(db, org)).toMatchObject({ bytesReserved: 5999n, quotaBytesOverride: 1000n });
  });

  test("per uploader identity: at most 20 pending uploads and 2 × the max file size of declared bytes", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const org = orgA.organizationId;
    setQuota(db, org, 100n * DRIVE_MAX_FILE_BYTES);
    const first = plan(org, { size: 1n });
    begin(db, orgA.staff, first);
    for (let i = 1; i < DRIVE_MAX_PENDING_PER_UPLOADER; i++) begin(db, orgA.staff, plan(org, { size: 1n }));
    expect(errorOf(() => begin(db, orgA.staff, plan(org, { size: 1n })))).toContain("[drive.too_many_pending]");
    begin(db, orgA.manager, plan(org, { size: 1n })); // another identity has its own allowance
    commit(db, first, 1n);
    begin(db, orgA.staff, plan(org, { size: 1n })); // a finished upload frees its slot

    begin(db, orgA.owner, plan(org, { size: DRIVE_MAX_FILE_BYTES }));
    begin(db, orgA.owner, plan(org, { size: DRIVE_MAX_FILE_BYTES - 1n }));
    expect(errorOf(() => begin(db, orgA.owner, plan(org, { size: 2n })))).toContain("[drive.too_many_pending]");
    begin(db, orgA.owner, plan(org, { size: 1n }));
  });

  test("a lost-response replay changes nothing; any other reuse of the id is a conflict", () => {
    const { db, orgA } = createDriveWorld();
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    begin(db, orgA.staff, p);
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesReserved: 1000n, itemCount: 1 });
    expect(errorOf(() => begin(db, orgA.staff, { ...p, sizeBytes: 999n }))).toContain("[drive.conflict]");
    expect(errorOf(() => begin(db, orgA.manager, p))).toContain("[drive.conflict]");
  });

  test("a key already queued for GC is never used again", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const p = plan(orgA.organizationId);
    db.run(R.serviceDiscardDriveBlob, SERVICE_IDENTITY, { itemId: p.itemId, blobKey: p.blobKey });
    expect(errorOf(() => begin(db, orgA.staff, p))).toContain("[drive.conflict]");
    const q = plan(orgA.organizationId);
    db.run(R.serviceDiscardDriveBlob, SERVICE_IDENTITY, { itemId: q.itemId, blobKey: driveThumbKeyFor(q.blobKey) });
    expect(errorOf(() => begin(db, orgA.staff, q))).toContain("[drive.conflict]");
  });

  test("org binding, containers and the item cap", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const foreign = uuid();
    db.run(R.createDriveFolder, orgB.owner, { organizationId: orgB.organizationId, itemId: foreign, space: "store", parentId: "", ownerMemberId: "", name: "B", actingMemberId: "" });
    expect(errorOf(() => begin(db, orgA.owner, plan(orgA.organizationId), { parentId: foreign }))).toContain("[drive.not_found]");
    expect(errorOf(() => begin(db, orgB.owner, plan(orgA.organizationId), { org: orgA.organizationId }))).toContain("[drive.forbidden]");
    expect(errorOf(() => begin(db, orgA.staff, plan(orgA.organizationId), { space: "my", ownerMemberId: orgA.manager.memberId }))).toContain("[drive.forbidden]");
    begin(db, orgA.staff, plan(orgA.organizationId));
    db.patch("driveUsage", orgA.organizationId, { itemCount: DRIVE_MAX_ITEMS_PER_ORG });
    expect(errorOf(() => begin(db, orgA.staff, plan(orgA.organizationId)))).toContain("[drive.too_many_items]");
  });

  test("a staff-account store tablet acting for its operator: the operator's upload, sent by the tablet", () => {
    const { db, orgA } = createDriveWorld();
    const [tablet, operator] = [orgA.staff, orgA.manager];
    db.insert("deviceOperatorSession", {
      identity: tablet.identity, organizationId: orgA.organizationId, memberId: operator.memberId, memberName: "Operator",
      role: operator.role, resolvedAt: new FakeTimestamp(db.nowMicros),
    });
    const p = plan(orgA.organizationId);
    begin(db, tablet, p, { acting: operator.memberId });
    const item = row(db, "driveItem", p.itemId);
    expect(item).toMatchObject({ space: "store", ownerMemberId: operator.memberId, createdByMemberId: operator.memberId, lastEditorMemberId: operator.memberId });
    expect((item.uploaderIdentity as FakeIdentity).hex).toBe(tablet.identity.hex);
    authorize(db, tablet, p); // the tablet's own identity signs the PUT
    expect(row(db, "driveItem", p.itemId).uploadAttempts).toBe(1);
    expect(errorOf(() => authorize(db, operator, p))).toContain("[drive.forbidden]");
    // No escalation: the operator's My files are out of a staff account's reach; a stale session is refused.
    expect(errorOf(() => begin(db, tablet, plan(orgA.organizationId), { space: "my", acting: operator.memberId }))).toContain("[drive.device_scope]");
    db.advance(DRIVE_OPERATOR_SESSION_TTL_MICROS + 1n);
    expect(errorOf(() => begin(db, tablet, plan(orgA.organizationId), { acting: operator.memberId }))).toContain("[drive.operator]");
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesReserved: 1000n, itemCount: 1 });
  });
});

describe("authorizeDriveUpload", () => {
  test("the uploader, for exactly the row's key, size and type or its thumbnail; each call extends the deadline", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    db.advance(HOUR);
    authorize(db, orgA.staff, p, { multipart: true });
    const item = row(db, "driveItem", p.itemId);
    expect(item.uploadAttempts).toBe(1);
    expect(micros(item.uploadExpiresAt)).toBe(db.nowMicros + DRIVE_UPLOAD_TTL_MICROS); // an hour later than begin set it
    authorize(db, orgA.staff, p, { variant: "thumb", pathname: driveThumbKeyFor(p.blobKey), size: 100n, mime: "image/webp" });
    expect(row(db, "driveItem", p.itemId).uploadAttempts).toBe(2);
    const refused: Array<[() => void, string]> = [
      [() => authorize(db, orgA.manager, p), "forbidden"],
      [() => authorize(db, orgB.owner, p), "not_found"],
      [() => authorize(db, orgA.staff, { ...p, itemId: uuid() }), "not_found"],
      [() => authorize(db, orgA.staff, p, { size: 999n }), "invalid"],
      [() => authorize(db, orgA.staff, p, { mime: "application/octet-stream" }), "invalid"],
      [() => authorize(db, orgA.staff, p, { pathname: driveBlobKey(orgA.organizationId, p.itemId, uuid(), p.name) }), "invalid"],
      [() => authorize(db, orgA.staff, p, { variant: "thumb", pathname: driveThumbKeyFor(p.blobKey), size: 100n, mime: "image/webp", multipart: true }), "invalid"],
      [() => authorize(db, orgA.staff, p, { variant: "thumb", pathname: driveThumbKeyFor(p.blobKey), size: DRIVE_THUMB_MAX_BYTES + 1n, mime: "image/webp" }), "invalid"],
      [() => authorize(db, orgA.staff, p, { variant: "thumb", pathname: driveThumbKeyFor(p.blobKey), size: 100n, mime: "image/png" }), "invalid"],
      [() => authorize(db, orgA.staff, p, { variant: "preview" }), "invalid"],
    ];
    for (const [call, code] of refused) expect(errorOf(call)).toContain(`[drive.${code}]`);
    expect(row(db, "driveItem", p.itemId).uploadAttempts).toBe(2);
    db.patch("orgMember", orgA.staff.memberId, { permissions: '{"dashboard":{"view":false}}' });
    expect(errorOf(() => authorize(db, orgA.staff, p))).toContain("[drive.forbidden]");
  });

  test("expired, too many attempts, already finished", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    db.advance(DRIVE_UPLOAD_TTL_MICROS + 1n);
    expect(errorOf(() => authorize(db, orgA.staff, p))).toContain("[drive.expired]");
    const q = plan(orgA.organizationId);
    begin(db, orgA.staff, q);
    for (let i = 0; i < DRIVE_UPLOAD_MAX_ATTEMPTS; i++) authorize(db, orgA.staff, q);
    expect(errorOf(() => authorize(db, orgA.staff, q))).toContain("[drive.too_many_attempts]");
    const r = plan(orgA.organizationId);
    begin(db, orgA.staff, r);
    commit(db, r, r.sizeBytes);
    expect(errorOf(() => authorize(db, orgA.staff, r))).toContain("[drive.conflict]");
  });
});

describe("abortDriveUpload", () => {
  test("releases the reservation; both keys keep being deleted until the (extended) deadline + slack", () => {
    const { db, orgA } = createDriveWorld();
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    db.advance(HOUR);
    authorize(db, orgA.staff, p);
    const deadline = micros(row(db, "driveItem", p.itemId).uploadExpiresAt);
    db.run(R.abortDriveUpload, orgA.staff, { itemId: p.itemId });
    expect(db.find("driveItem", p.itemId)).toBeNull();
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesReserved: 0n, itemCount: 0 });
    for (const key of [p.blobKey, driveThumbKeyFor(p.blobKey)]) {
      const job = row(db, "driveBlobGc", key);
      expect(job).toMatchObject({ action: "delete", reason: "cancelled", itemId: p.itemId, organizationId: orgA.organizationId });
      expect(micros(job.holdUntil)).toBe(deadline + DRIVE_GC_HOLD_SLACK_MICROS);
    }
    db.run(R.abortDriveUpload, orgA.staff, { itemId: p.itemId }); // idempotent
  });

  test("the uploader or a manager of the item; finished uploads are left alone", () => {
    const { db, orgA, orgB } = createDriveWorld();
    registerService(db);
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    expect(errorOf(() => db.run(R.abortDriveUpload, colleague, { itemId: p.itemId }))).toContain("[drive.forbidden]");
    expect(errorOf(() => db.run(R.abortDriveUpload, orgB.owner, { itemId: p.itemId }))).toContain("[drive.not_found]");
    db.run(R.abortDriveUpload, orgA.manager, { itemId: p.itemId });
    expect(db.find("driveItem", p.itemId)).toBeNull();
    const done = plan(orgA.organizationId);
    begin(db, orgA.staff, done);
    commit(db, done, done.sizeBytes);
    db.run(R.abortDriveUpload, orgA.staff, { itemId: done.itemId });
    expect(row(db, "driveItem", done.itemId).status).toBe("ready");
  });
});

describe("service upload reducers", () => {
  test("commit: reserved bytes become used ones at the observed size; idempotent; a stale verify job goes", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    db.run(R.serviceSetDriveThumb, SERVICE_IDENTITY, { itemId: p.itemId, thumbKey: driveThumbKeyFor(p.blobKey), observedBytes: 100n });
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesUsed: 100n, bytesReserved: 1000n });
    db.advance(DRIVE_UPLOAD_TTL_MICROS + 1n);
    db.run(R.serviceDriveSweep, SERVICE_IDENTITY, { maxItems: 10 });
    expect(row(db, "driveBlobGc", p.blobKey)).toMatchObject({ action: "verify", declaredBytes: 1000n });
    commit(db, p, 900n, "e".repeat(300));
    expect(row(db, "driveItem", p.itemId)).toMatchObject({ status: "ready", sizeBytes: 900n, thumbBytes: 100n, etag: "e".repeat(DRIVE_ETAG_MAX) });
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesUsed: 1000n, bytesReserved: 0n, fileCount: 1, itemCount: 1 });
    expect(db.find("driveBlobGc", p.blobKey)).toBeNull();
    commit(db, p, 900n);
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesUsed: 1000n, fileCount: 1 });
    expect(errorOf(() => db.run(R.serviceCommitDriveUpload, SERVICE_IDENTITY, { itemId: p.itemId, blobKey: driveThumbKeyFor(p.blobKey), observedBytes: 1n, etag: "" }))).toContain("[drive.invalid]");
    expect(errorOf(() => commit(db, { ...p, itemId: uuid() }, 1n))).toContain("[drive.not_found]");
  });

  test("commit of an empty or larger-than-declared blob deletes the row and queues its bytes", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    for (const observed of [1001n, 0n]) {
      const p = plan(orgA.organizationId);
      begin(db, orgA.staff, p);
      const deadline = micros(row(db, "driveItem", p.itemId).uploadExpiresAt);
      commit(db, p, observed);
      expect(db.find("driveItem", p.itemId)).toBeNull();
      expect(row(db, "driveBlobGc", p.blobKey)).toMatchObject({ action: "delete", reason: "rejected" });
      expect(micros(row(db, "driveBlobGc", p.blobKey).holdUntil)).toBe(deadline + DRIVE_GC_HOLD_SLACK_MICROS);
    }
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesReserved: 0n, bytesUsed: 0n, fileCount: 0, itemCount: 0 });
  });

  test("fail: only a pending row under that key goes, with a known reason", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const [a, b, c] = [plan(orgA.organizationId), plan(orgA.organizationId), plan(orgA.organizationId)];
    for (const p of [a, b, c]) begin(db, orgA.staff, p);
    commit(db, c, c.sizeBytes);
    const fail = (p: Planned, reason: string, blobKey = p.blobKey) =>
      db.run(R.serviceFailDriveUpload, SERVICE_IDENTITY, { itemId: p.itemId, blobKey, reason });
    fail(a, "upload_expired", driveThumbKeyFor(a.blobKey));
    fail(c, "upload_expired");
    expect(db.find("driveItem", a.itemId)).not.toBeNull();
    expect(row(db, "driveItem", c.itemId).status).toBe("ready");
    fail(a, "upload_expired");
    fail(b, "whatever");
    expect(row(db, "driveBlobGc", a.blobKey).reason).toBe("upload_expired");
    expect(row(db, "driveBlobGc", b.blobKey).reason).toBe("rejected");
    expect(usage(db, orgA.organizationId)).toMatchObject({ bytesReserved: 0n, itemCount: 1 });
  });

  test("thumbnails attach once, count as used until the row goes; wrong keys and sizes are refused", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    const thumb = (thumbKey: string, observedBytes: bigint) =>
      db.run(R.serviceSetDriveThumb, SERVICE_IDENTITY, { itemId: p.itemId, thumbKey, observedBytes });
    expect(errorOf(() => thumb(driveThumbKeyFor(plan(orgA.organizationId).blobKey), 10n))).toContain("[drive.invalid]");
    expect(errorOf(() => thumb("", 10n))).toContain("[drive.invalid]");
    thumb(driveThumbKeyFor(p.blobKey), DRIVE_THUMB_MAX_BYTES + 1n);
    expect(row(db, "driveItem", p.itemId).thumbKey).toBe("");
    expect(row(db, "driveBlobGc", driveThumbKeyFor(p.blobKey))).toMatchObject({ action: "delete", reason: "rejected" });
    const q = plan(orgA.organizationId);
    begin(db, orgA.staff, q);
    db.run(R.serviceSetDriveThumb, SERVICE_IDENTITY, { itemId: q.itemId, thumbKey: driveThumbKeyFor(q.blobKey), observedBytes: 50n });
    db.run(R.serviceSetDriveThumb, SERVICE_IDENTITY, { itemId: q.itemId, thumbKey: driveThumbKeyFor(q.blobKey), observedBytes: 70n });
    expect(row(db, "driveItem", q.itemId)).toMatchObject({ thumbKey: driveThumbKeyFor(q.blobKey), thumbBytes: 50n });
    expect(usage(db, orgA.organizationId).bytesUsed).toBe(50n);
    db.run(R.abortDriveUpload, orgA.staff, { itemId: q.itemId });
    expect(usage(db, orgA.organizationId).bytesUsed).toBe(0n);
  });

  test("discard: a key no row owns is queued at once; a live key is left alone", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    const discard = (itemId: string, blobKey: string) => db.run(R.serviceDiscardDriveBlob, SERVICE_IDENTITY, { itemId, blobKey });
    discard(p.itemId, p.blobKey);
    discard(p.itemId, driveThumbKeyFor(p.blobKey));
    expect(db.rows("driveBlobGc")).toEqual([]);
    const stale = driveBlobKey(orgA.organizationId, p.itemId, uuid(), p.name); // an older attempt of the same item
    discard(p.itemId, stale);
    expect(row(db, "driveBlobGc", stale)).toMatchObject({ action: "delete", reason: "discarded", itemId: p.itemId });
    expect(micros(row(db, "driveBlobGc", stale).holdUntil)).toBe(db.nowMicros);
    const gone = plan(orgA.organizationId);
    discard(gone.itemId, gone.blobKey);
    expect(row(db, "driveBlobGc", gone.blobKey).organizationId).toBe(orgA.organizationId);
    expect(errorOf(() => discard(uuid(), p.blobKey))).toContain("[drive.invalid]");
    expect(errorOf(() => discard(p.itemId, "org/nope"))).toContain("[drive.invalid]");
  });

  test("only the registered service identity", () => {
    const { db, orgA } = createDriveWorld();
    const p = plan(orgA.organizationId);
    begin(db, orgA.staff, p);
    const calls: Array<[unknown, Record<string, unknown>]> = [
      [R.serviceCommitDriveUpload, { itemId: p.itemId, blobKey: p.blobKey, observedBytes: 1n, etag: "" }],
      [R.serviceFailDriveUpload, { itemId: p.itemId, blobKey: p.blobKey, reason: "rejected" }],
      [R.serviceSetDriveThumb, { itemId: p.itemId, thumbKey: driveThumbKeyFor(p.blobKey), observedBytes: 1n }],
      [R.serviceDiscardDriveBlob, { itemId: p.itemId, blobKey: driveBlobKey(orgA.organizationId, p.itemId, uuid(), "x") }],
    ];
    for (const sender of [orgA.owner.identity, orgA.staff.identity, SERVICE_IDENTITY]) { // the last one is not registered
      for (const [fn, args] of calls) expect(errorOf(() => db.run(fn, sender, args))).toContain("[drive.forbidden]");
    }
    expect(row(db, "driveItem", p.itemId).status).toBe("pending");
    expect(db.rows("driveBlobGc")).toEqual([]);
  });
});
