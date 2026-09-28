// Drive trash (spacetimedb/src/drive/trash.ts), DS §6.3: the trash-root model, cascades to
// documents, subtree_forbidden, restore placement, delete forever (usage + blob GC), the
// emptyDriveTrash bound and cross-org ids. Real module code over the two-org fake database.

import { describe, expect, test } from "bun:test";
import { queueDriveBlob, type DriveDeps, type DriveTimestamp } from "../../../spacetimedb/src/drive/context";
import { defineDriveDocumentReducers } from "../../../spacetimedb/src/drive/documents";
import { DRIVE_GC_HOLD_SLACK_MICROS, DRIVE_MAX_SUBTREE, DRIVE_SWEEP_MAX } from "../../../spacetimedb/src/drive/logic";
import { defineDriveReducers } from "../../../spacetimedb/src/drive/reducers";
import { defineDriveTrashReducers } from "../../../spacetimedb/src/drive/trash";
import type { DriveCtx, DriveSchema } from "../../../spacetimedb/src/drive/types";
import {
  FakeTimestamp, createDriveWorld, documentWithFile, loadModule, moduleStubs, type FakeDb, type FakeMember, type Row,
} from "./fake-db";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const R = { ...defineDriveReducers(stdb, deps), ...defineDriveTrashReducers(stdb, deps), ...defineDriveDocumentReducers(stdb, deps) };
const uuid = (): string => crypto.randomUUID();

function errorOf(fn: () => void): string {
  try { fn(); } catch (error) { return String((error as Error).message); }
  return "(no error)";
}
function row(db: FakeDb, table: string, id: string): Row {
  const found = db.find(table, id);
  if (!found) throw new Error(`no ${table} ${id}`);
  return found;
}
/** The document row plus the type and folder of its document_file row. */
function docRow(db: FakeDb, id: string): Row {
  const found = documentWithFile(db, id);
  if (!found) throw new Error(`no document ${id}`);
  return found;
}
function folder(db: FakeDb, by: FakeMember, space: string, parentId = ""): string {
  const itemId = uuid();
  db.run(R.createDriveFolder, by, { organizationId: by.organizationId, itemId, space, parentId, ownerMemberId: "", name: "F", actingMemberId: "" });
  return itemId;
}
/** An uploaded file with its usage accounted (as a commit / begin would leave it). */
function file(db: FakeDb, owner: FakeMember, space: string, parentId = "", o: { status?: string; size?: bigint; thumb?: bigint } = {}): string {
  const id = uuid();
  const status = o.status ?? "ready";
  const size = o.size ?? 100n;
  const thumb = o.thumb ?? 0n;
  const blobKey = `org/${owner.organizationId}/${id}/${uuid()}/a.pdf`;
  const now = new FakeTimestamp(db.nowMicros);
  db.insert("driveItem", {
    id, organizationId: owner.organizationId, adminScope: "scope", space, parentId, kind: "file", name: "a.pdf",
    mimeType: "application/pdf", sizeBytes: size, blobKey, thumbKey: thumb > 0n ? blobKey.replace(/a\.pdf$/, "_thumb") : "",
    thumbBytes: thumb, etag: "e", ownerMemberId: owner.memberId, createdByMemberId: owner.memberId, uploaderIdentity: owner.identity,
    status, uploadExpiresAt: new FakeTimestamp(db.nowMicros + 1_000_000n), uploadAttempts: 1, trashed: false, trashRootId: "",
    trashedAt: undefined, trashedByMemberId: "", createdAt: now, updatedAt: now, lastEditorMemberId: owner.memberId, trashRootAt: 0n,
  });
  const usage = db.find("driveUsage", owner.organizationId) as Row;
  db.patch("driveUsage", owner.organizationId, status === "ready"
    ? { bytesUsed: (usage.bytesUsed as bigint) + size + thumb, fileCount: (usage.fileCount as number) + 1, itemCount: (usage.itemCount as number) + 1 }
    : { bytesReserved: (usage.bytesReserved as bigint) + size, bytesUsed: (usage.bytesUsed as bigint) + thumb, itemCount: (usage.itemCount as number) + 1 });
  return id;
}
function doc(db: FakeDb, by: FakeMember, space: string, folderId = ""): string {
  const documentId = uuid();
  db.run(R.createDriveDocument, by, {
    organizationId: by.organizationId, documentId, fileType: "doc", space, folderId, ownerMemberId: "", visibility: "", title: "D",
    templateId: "", initialState: undefined, html: undefined, plainText: undefined, wordCount: undefined, actingMemberId: "",
  });
  return documentId;
}
type Op = "trashDriveEntries" | "restoreDriveEntries" | "deleteDriveEntriesForever";
function op(db: FakeDb, name: Op, by: FakeMember, o: { items?: string[]; docs?: string[]; org?: string }): () => void {
  return () => db.run(R[name], by, {
    organizationId: o.org ?? by.organizationId, itemIds: JSON.stringify(o.items ?? []), documentIds: JSON.stringify(o.docs ?? []), actingMemberId: "",
  });
}
const usage = (db: FakeDb, m: FakeMember) => row(db, "driveUsage", m.organizationId);

describe("trashDriveEntries", () => {
  test("cascades to the untrashed subtree and its documents with one stamp; presence goes", () => {
    const { db, orgA } = createDriveWorld();
    const root = folder(db, orgA.staff, "store");
    const sub = folder(db, orgA.staff, "store", root);
    const f = file(db, orgA.staff, "store", sub);
    const d = doc(db, orgA.staff, "store", sub);
    db.insert("documentPresence", { id: uuid(), documentId: d, organizationId: orgA.organizationId, connectionId: "c", memberId: orgA.staff.memberId });
    op(db, "trashDriveEntries", orgA.staff, { items: [root] })();
    for (const id of [root, sub, f]) {
      expect(row(db, "driveItem", id)).toMatchObject({ trashed: true, trashRootId: root, trashedByMemberId: orgA.staff.memberId });
    }
    const stamp = (row(db, "driveItem", root).trashedAt as FakeTimestamp).microsSinceUnixEpoch;
    expect((row(db, "document", d).trashedAt as FakeTimestamp).microsSinceUnixEpoch).toBe(stamp);
    expect(db.rows("documentPresence")).toHaveLength(0);
    expect(usage(db, orgA.staff)).toMatchObject({ bytesUsed: 100n, fileCount: 1, itemCount: 3 }); // trash keeps counting
  });

  test("an already-trashed descendant stays its own root and is not restored with the parent", () => {
    const { db, orgA } = createDriveWorld();
    const parent = folder(db, orgA.staff, "store");
    const child = folder(db, orgA.staff, "store", parent);
    op(db, "trashDriveEntries", orgA.staff, { items: [child] })();
    op(db, "trashDriveEntries", orgA.staff, { items: [parent] })();
    expect(row(db, "driveItem", child).trashRootId).toBe(child);
    op(db, "restoreDriveEntries", orgA.staff, { items: [parent] })();
    expect(row(db, "driveItem", parent).trashed).toBe(false);
    expect(row(db, "driveItem", child)).toMatchObject({ trashed: true, trashRootId: child });
    expect(errorOf(op(db, "trashDriveEntries", orgA.staff, { items: [parent, folder(db, orgA.staff, "store", parent)] }))).toBe("(no error)");
    const listedChild = db.rows("driveItem").find((r) => r.parentId === parent && r.id !== child) as Row;
    expect(listedChild.trashRootId).toBe(parent); // listed with its parent: part of the parent's cascade
  });

  test("subtree_forbidden for a colleague's file or doc in your Store folder; an org admin passes", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const mine = folder(db, orgA.staff, "store");
    file(db, colleague, "store", mine);
    expect(errorOf(op(db, "trashDriveEntries", orgA.staff, { items: [mine] }))).toContain("[drive.subtree_forbidden]");
    const withDoc = folder(db, orgA.staff, "store");
    doc(db, colleague, "store", withDoc);
    expect(errorOf(op(db, "trashDriveEntries", orgA.staff, { items: [withDoc] }))).toContain("[drive.subtree_forbidden]");
    expect(db.rows("driveItem").some((r) => r.trashed)).toBe(false);
    op(db, "trashDriveEntries", orgA.manager, { items: [mine, withDoc] })();
    expect(db.rows("driveItem").every((r) => r.trashed)).toBe(true);
  });

  test("drive.edit (editor) can rename but not trash others' items; a pending upload is cancelled, not trashed", () => {
    const { db, orgA } = createDriveWorld();
    const editor = db.addMember({ organizationId: orgA.organizationId, permissions: '{"drive":{"edit":true}}' });
    const theirs = folder(db, orgA.manager, "store");
    db.run(R.renameDriveItem, editor, { itemId: theirs, name: "Renamed", actingMemberId: "" });
    expect(errorOf(op(db, "trashDriveEntries", editor, { items: [theirs] }))).toContain("[drive.forbidden]");
    const box = folder(db, orgA.staff, "store");
    const pending = file(db, orgA.staff, "store", box, { status: "pending", size: 500n });
    const deadline = (row(db, "driveItem", pending).uploadExpiresAt as FakeTimestamp).microsSinceUnixEpoch;
    op(db, "trashDriveEntries", orgA.staff, { items: [box] })();
    expect(db.find("driveItem", pending)).toBeNull();
    const gc = db.rows("driveBlobGc");
    expect(gc).toHaveLength(2); // the blob and its thumbnail key
    expect(gc.every((g) => g.action === "delete" && g.reason === "cancelled"
      && (g.holdUntil as FakeTimestamp).microsSinceUnixEpoch === deadline + DRIVE_GC_HOLD_SLACK_MICROS)).toBe(true);
    expect(usage(db, orgA.staff)).toMatchObject({ bytesReserved: 0n, itemCount: 2 });
  });
});

describe("restoreDriveEntries", () => {
  test("restores the root, its subtree and its cascaded documents; only roots may be restored", () => {
    const { db, orgA } = createDriveWorld();
    const root = folder(db, orgA.staff, "store");
    const sub = folder(db, orgA.staff, "store", root);
    const d = doc(db, orgA.staff, "store", sub);
    const separate = doc(db, orgA.staff, "store", sub);
    op(db, "trashDriveEntries", orgA.staff, { docs: [separate] })();
    db.advance(10n);
    op(db, "trashDriveEntries", orgA.staff, { items: [root] })();
    expect(errorOf(op(db, "restoreDriveEntries", orgA.staff, { items: [sub] }))).toContain("[drive.invalid]");
    op(db, "restoreDriveEntries", orgA.staff, { items: [root] })();
    expect(row(db, "driveItem", sub)).toMatchObject({ trashed: false, trashRootId: "", trashedByMemberId: "", parentId: root });
    expect(row(db, "document", d).trashedAt).toBeUndefined();
    expect(row(db, "document", separate).trashedAt).toBeDefined(); // trashed on its own: stays
    op(db, "restoreDriveEntries", orgA.staff, { items: [root] })(); // idempotent
  });

  test("a root whose parent is gone, trashed, in the other space or someone else's lands at its space root", () => {
    const { db, orgA } = createDriveWorld();
    const cases = (["missing", "trashed", "otherSpace", "otherOwner"] as const).map((kind) => {
      const parent = folder(db, orgA.staff, "my");
      const child = folder(db, orgA.staff, "my", parent);
      op(db, "trashDriveEntries", orgA.staff, { items: [child] })();
      if (kind === "missing") db.transact((t) => (t.driveItem as { delete(r: Row): void }).delete(row(db, "driveItem", parent)));
      if (kind === "trashed") op(db, "trashDriveEntries", orgA.staff, { items: [parent] })();
      if (kind === "otherSpace") db.patch("driveItem", parent, { space: "store" });
      if (kind === "otherOwner") db.patch("driveItem", parent, { ownerMemberId: orgA.manager.memberId });
      return child;
    });
    const kept = folder(db, orgA.staff, "my");
    const keptChild = folder(db, orgA.staff, "my", kept);
    op(db, "trashDriveEntries", orgA.staff, { items: [keptChild] })();
    op(db, "restoreDriveEntries", orgA.owner, { items: [...cases, keptChild] })();
    for (const child of cases) expect(row(db, "driveItem", child)).toMatchObject({ trashed: false, parentId: "" });
    expect(row(db, "driveItem", keptChild).parentId).toBe(kept);
  });

  test("a cascaded document comes back only for a doc manager, as restoreDocument requires", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const box = folder(db, orgA.staff, "store");
    const mine = doc(db, orgA.staff, "store", box);
    const theirs = doc(db, colleague, "store", box);
    op(db, "trashDriveEntries", orgA.manager, { items: [box] })();
    op(db, "restoreDriveEntries", orgA.staff, { items: [box] })();
    expect(row(db, "driveItem", box).trashed).toBe(false);
    expect(row(db, "document", mine).trashedAt).toBeUndefined();
    expect(docRow(db, theirs)).toMatchObject({ folderId: box }); // still in the trash, still pointing at its folder
    expect(row(db, "document", theirs).trashedAt).toBeDefined();
    op(db, "restoreDriveEntries", colleague, { docs: [theirs] })();
    expect(docRow(db, theirs)).toMatchObject({ trashedAt: undefined, folderId: box });
  });

  test("a listed document whose folder is no longer valid comes back at the root", () => {
    const { db, orgA } = createDriveWorld();
    const box = folder(db, orgA.staff, "my");
    const d = doc(db, orgA.staff, "my", box);
    op(db, "trashDriveEntries", orgA.staff, { docs: [d] })();
    op(db, "trashDriveEntries", orgA.staff, { items: [box] })();
    op(db, "restoreDriveEntries", orgA.staff, { docs: [d] })();
    expect(docRow(db, d)).toMatchObject({ trashedAt: undefined, folderId: "" });
  });
});

describe("deleteDriveEntriesForever / emptyDriveTrash", () => {
  test("releases usage, queues blob + thumb for GC, drops stars, purges cascaded docs the actor manages", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const root = folder(db, orgA.staff, "store");
    const f = file(db, orgA.staff, "store", root, { size: 1_000n, thumb: 20n });
    const mine = doc(db, orgA.staff, "store", root);
    const theirs = doc(db, colleague, "store", root);
    db.run(R.toggleDriveStar, orgA.staff, { itemId: f, actingMemberId: "" });
    op(db, "trashDriveEntries", orgA.manager, { items: [root] })();
    expect(errorOf(op(db, "deleteDriveEntriesForever", orgA.staff, { items: [f] }))).toContain("[drive.invalid]"); // not a root
    const keys = [row(db, "driveItem", f).blobKey, row(db, "driveItem", f).thumbKey] as string[];
    expect(keys[1]).toMatch(/\/_thumb$/);
    op(db, "deleteDriveEntriesForever", orgA.staff, { items: [root] })();
    const deletedAt = db.nowMicros;
    expect(db.find("driveItem", root)).toBeNull();
    expect(db.find("driveItem", f)).toBeNull();
    expect(db.rows("driveStar")).toHaveLength(0);
    expect(usage(db, orgA.staff)).toMatchObject({ bytesUsed: 0n, fileCount: 0, itemCount: 0 });
    const gc = db.rows("driveBlobGc");
    expect(gc.map((g) => g.blobKey).sort()).toEqual([...keys].sort());
    // A ready file's keys are deleted right away: holdUntil = the delete's own timestamp.
    expect(gc.every((g) => g.action === "delete" && g.reason === "purged" && g.scope === "service" && g.itemId === f
      && (g.holdUntil as FakeTimestamp).microsSinceUnixEpoch === deletedAt)).toBe(true);
    expect(db.find("document", mine)).toBeNull();
    // The staff member does not manage the colleague's doc: it stays in the trash, at its space root.
    expect(docRow(db, theirs)).toMatchObject({ folderId: "" });
    expect(row(db, "document", theirs).trashedAt).toBeDefined();
    // The purged document's document_file row went with it.
    expect(db.find("documentFile", mine)).toBeNull();
  });

  test("delete forever reaches no further than trashing: a colleague's file in an admin-trashed folder", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const mine = folder(db, orgA.staff, "store");
    const theirs = file(db, colleague, "store", mine);
    expect(errorOf(op(db, "trashDriveEntries", orgA.staff, { items: [mine] }))).toContain("[drive.subtree_forbidden]");
    op(db, "trashDriveEntries", orgA.manager, { items: [mine] })();
    expect(errorOf(op(db, "deleteDriveEntriesForever", orgA.staff, { items: [mine] }))).toContain("[drive.subtree_forbidden]");
    db.run(R.emptyDriveTrash, orgA.staff, { organizationId: orgA.organizationId, actingMemberId: "" });
    expect(row(db, "driveItem", theirs)).toMatchObject({ trashed: true, trashRootId: mine });
    expect(db.rows("driveBlobGc")).toHaveLength(0);
    db.run(R.emptyDriveTrash, orgA.manager, { organizationId: orgA.organizationId, actingMemberId: "" });
    expect(db.find("driveItem", theirs)).toBeNull();
    expect(db.find("driveItem", mine)).toBeNull();
  });

  test("listed documents must be trashed and managed", () => {
    const { db, orgA } = createDriveWorld();
    const d = doc(db, orgA.manager, "store");
    expect(errorOf(op(db, "deleteDriveEntriesForever", orgA.manager, { docs: [d] }))).toContain("[drive.invalid]");
    op(db, "trashDriveEntries", orgA.manager, { docs: [d] })();
    expect(errorOf(op(db, "deleteDriveEntriesForever", orgA.staff, { docs: [d] }))).toContain("[drive.forbidden]");
    op(db, "deleteDriveEntriesForever", orgA.manager, { docs: [d] })();
    expect(db.find("document", d)).toBeNull();
    expect(db.rows("documentReaderIndex").some((r) => r.documentId === d)).toBe(false);
  });

  test(`emptyDriveTrash removes what the actor manages, about ${DRIVE_SWEEP_MAX} rows per call`, () => {
    const { db, orgA } = createDriveWorld();
    const others = folder(db, orgA.manager, "my");
    op(db, "trashDriveEntries", orgA.manager, { items: [others] })();
    const root = folder(db, orgA.staff, "store");
    op(db, "trashDriveEntries", orgA.staff, { items: [root] })();
    const now = new FakeTimestamp(db.nowMicros);
    for (let i = 0; i < DRIVE_SWEEP_MAX + 5; i++) {
      db.insert("document", {
        id: uuid(), organizationId: orgA.organizationId, ownerMemberId: orgA.staff.memberId, title: "", excerpt: "", icon: undefined,
        visibility: "private", templateId: undefined, pageSetup: undefined, wordCount: 0, createdAt: now, updatedAt: now,
        lastEditorMemberId: orgA.staff.memberId, trashedAt: now, trashedByMemberId: orgA.staff.memberId,
      });
    }
    const empty = () => db.run(R.emptyDriveTrash, orgA.staff, { organizationId: orgA.organizationId, actingMemberId: "" });
    empty();
    expect(db.find("driveItem", root)).toBeNull();
    expect(db.rows("document")).toHaveLength(6); // 1 root + 499 docs = 500 rows this call
    empty();
    expect(db.rows("document")).toHaveLength(0);
    expect(row(db, "driveItem", others).trashed).toBe(true); // the manager's own: not the staff member's to delete
  });
});

describe("cost of deleting many trash roots (review r2: trash-root-delete-rescans-org-docs)", () => {
  /** Yields of document.byOrganizationId during `body`: the org-wide document walks it made. */
  function documentRowsWalked(db: FakeDb, body: () => void): number {
    const index = (db.db.document as { byOrganizationId: { filter(v: unknown): IterableIterator<Row> } }).byOrganizationId;
    const original = index.filter;
    let walked = 0;
    index.filter = (v: unknown) => {
      const rows = [...original(v)];
      walked += rows.length;
      return rows.values();
    };
    try {
      body();
    } finally {
      index.filter = original;
    }
    return walked;
  }

  test("delete forever and empty trash read the org's documents once per call, not once per root", () => {
    const { db, orgA } = createDriveWorld();
    const roots = Array.from({ length: 40 }, () => folder(db, orgA.staff, "store"));
    const inFirst = doc(db, orgA.staff, "store", roots[0]);
    const inLast = doc(db, orgA.manager, "store", roots[39]);
    for (let i = 0; i < 30; i++) doc(db, orgA.owner, "store");
    for (const id of roots.slice(0, 39)) op(db, "trashDriveEntries", orgA.staff, { items: [id] })();
    op(db, "trashDriveEntries", orgA.owner, { items: [roots[39]] })(); // holds the manager's document
    const docs = db.rows("document").filter((d) => d.organizationId === orgA.organizationId).length;
    const walked = documentRowsWalked(db, op(db, "deleteDriveEntriesForever", orgA.staff, { items: roots.slice(0, 20) }));
    expect(walked).toBeLessThanOrEqual(docs);
    expect(db.find("document", inFirst)).toBeNull(); // cascaded with its root and the staff member manages it
    const more = Array.from({ length: 20 }, () => folder(db, orgA.staff, "store"));
    for (const id of more) op(db, "trashDriveEntries", orgA.staff, { items: [id] })();
    const walkedEmpty = documentRowsWalked(db, () => db.run(R.emptyDriveTrash, orgA.staff, { organizationId: orgA.organizationId, actingMemberId: "" }));
    // One pass to build the folder lookup, one for the trashed documents; never 40 more.
    expect(walkedEmpty).toBeLessThanOrEqual(2 * docs);
    expect(db.rows("driveItem").filter((r) => r.organizationId === orgA.organizationId)).toHaveLength(0);
    // The manager's document the staff member cannot manage: kept, trashed, out of the deleted folder.
    expect(docRow(db, inLast)).toMatchObject({ folderId: "" });
    expect(row(db, "document", inLast).trashedAt).toBeTruthy();
  });

  test(`several roots may hold at most DRIVE_MAX_SUBTREE rows (batch_too_large); one root always fits`, () => {
    const { db, orgA } = createDriveWorld();
    const big = folder(db, orgA.staff, "store");
    const small = folder(db, orgA.staff, "store");
    op(db, "trashDriveEntries", orgA.staff, { items: [big] })();
    op(db, "trashDriveEntries", orgA.staff, { items: [small] })();
    const bigRow = row(db, "driveItem", big);
    for (let i = 0; i < DRIVE_MAX_SUBTREE; i++) {
      db.insert("driveItem", { ...bigRow, id: uuid(), parentId: big, trashRootAt: 0n });
    }
    const usageRow = usage(db, orgA.staff);
    db.patch("driveUsage", orgA.organizationId, { itemCount: (usageRow.itemCount as number) + DRIVE_MAX_SUBTREE });
    expect(errorOf(op(db, "deleteDriveEntriesForever", orgA.staff, { items: [small, big] }))).toContain("[drive.batch_too_large]");
    expect(db.rows("driveItem")).toHaveLength(DRIVE_MAX_SUBTREE + 2);
    op(db, "deleteDriveEntriesForever", orgA.staff, { items: [big] })();
    op(db, "deleteDriveEntriesForever", orgA.staff, { items: [small] })();
    expect(db.rows("driveItem")).toHaveLength(0);
  });

  test("trashRootAt: the trashed micros on the root only; restore clears it", () => {
    const { db, orgA } = createDriveWorld();
    const root = folder(db, orgA.staff, "store");
    const child = folder(db, orgA.staff, "store", root);
    op(db, "trashDriveEntries", orgA.staff, { items: [root] })();
    const at = (row(db, "driveItem", root).trashedAt as FakeTimestamp).microsSinceUnixEpoch;
    expect([row(db, "driveItem", root).trashRootAt, row(db, "driveItem", child).trashRootAt]).toEqual([at, 0n]);
    op(db, "restoreDriveEntries", orgA.staff, { items: [root] })();
    expect([row(db, "driveItem", root).trashRootAt, row(db, "driveItem", child).trashRootAt]).toEqual([0n, 0n]);
  });
});

describe("queueDriveBlob (one GC row per key)", () => {
  test("'delete' upgrades 'verify' / 'dead' and keeps the later holdUntil; 'verify' never downgrades", () => {
    const { db, orgA } = createDriveWorld();
    const queue = (blobKey: string, action: "delete" | "verify", holdMicros?: bigint) => {
      const ctx = db.ctx(orgA.owner.identity) as unknown as DriveCtx;
      db.transact(() => queueDriveBlob(ctx, { blobKey, organizationId: orgA.organizationId, itemId: "i", action, reason: action === "delete" ? "purged" : "upload_expired",
        declaredBytes: 7n, holdUntil: holdMicros === undefined ? undefined : new FakeTimestamp(holdMicros) as unknown as DriveTimestamp }));
    };
    const hold = (key: string) => (row(db, "driveBlobGc", key).holdUntil as FakeTimestamp).microsSinceUnixEpoch;
    const late = db.nowMicros + 1_000_000n;
    queue("k1", "verify");
    queue("k1", "verify", late + 9n); // a repeated verify changes nothing (and never becomes a delete)
    expect(row(db, "driveBlobGc", "k1")).toMatchObject({ action: "verify", reason: "upload_expired" });
    expect(hold("k1")).toBeLessThan(late);
    db.patch("driveBlobGc", "k1", { attempts: 3, lastError: "HEAD failed" });
    queue("k1", "delete", late);
    expect(row(db, "driveBlobGc", "k1")).toMatchObject({ action: "delete", reason: "purged", attempts: 0, lastError: "", declaredBytes: 7n });
    expect(hold("k1")).toBe(late);
    queue("k1", "delete"); // an earlier hold never shortens the later one
    expect(hold("k1")).toBe(late);
    queue("k1", "delete", late + 5n);
    expect(hold("k1")).toBe(late + 5n);
    queue("k1", "verify");
    expect(row(db, "driveBlobGc", "k1").action).toBe("delete");
    queue("k2", "delete");
    db.patch("driveBlobGc", "k2", { action: "dead", attempts: 10 });
    queue("k2", "delete");
    expect(row(db, "driveBlobGc", "k2")).toMatchObject({ action: "delete", attempts: 0 });
  });
});

describe("cross-org ids → [drive.not_found], nothing written", () => {
  test("trash / restore / delete forever with another store's ids", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const bFolder = folder(db, orgB.owner, "store");
    const bDoc = doc(db, orgB.owner, "store");
    const bTrashed = folder(db, orgB.owner, "store");
    op(db, "trashDriveEntries", orgB.owner, { items: [bTrashed] })();
    const snapshot = () => JSON.stringify([db.rows("driveItem"), db.rows("document")], (_k, v) => typeof v === "bigint" ? `${v}` : v);
    const before = snapshot();
    for (const name of ["trashDriveEntries", "restoreDriveEntries", "deleteDriveEntriesForever"] as const) {
      expect(errorOf(op(db, name, orgA.owner, { items: [bFolder] }))).toContain("[drive.not_found]");
      expect(errorOf(op(db, name, orgA.owner, { items: [bTrashed] }))).toContain("[drive.not_found]");
      expect(errorOf(op(db, name, orgA.owner, { docs: [bDoc] }))).toContain("[drive.not_found]");
      expect(errorOf(op(db, name, orgA.owner, { items: [bFolder], org: orgB.organizationId }))).toContain("[drive.forbidden]");
    }
    db.run(R.emptyDriveTrash, orgA.owner, { organizationId: orgA.organizationId, actingMemberId: "" });
    expect(snapshot()).toBe(before);
  });
});
