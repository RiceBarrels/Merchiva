// Drive reducers (spacetimedb/src/drive/{reducers,documents}.ts), DS §6.1 + §6.3: folders,
// rename, star, the management notice, the access self-heal, moves, setDocumentFolder
// and createDriveDocument. Real module code — the factories plus the real `driveDeps`
// wiring of spacetimedb/src/index.ts — over the two-org fake database.

import { describe, expect, test } from "bun:test";
import { gzipSync } from "fflate";
import { DRIVE_ID_LIST_MAX_CHARS, type DriveDeps } from "../../../spacetimedb/src/drive/context";
import { defineDriveDocumentReducers } from "../../../spacetimedb/src/drive/documents";
import { DRIVE_MAX_BATCH, DRIVE_MAX_DEPTH, DRIVE_MAX_ITEMS_PER_ORG } from "../../../spacetimedb/src/drive/logic";
import { defineDriveReducers } from "../../../spacetimedb/src/drive/reducers";
import type { DriveSchema } from "../../../spacetimedb/src/drive/types";
import {
  FakeTimestamp, SERVICE_IDENTITY, createDriveWorld, documentWithFile, loadModule, moduleStubs,
  type FakeDb, type FakeIdentity, type FakeMember, type Row,
} from "./fake-db";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const R = { ...defineDriveReducers(stdb, deps), ...defineDriveDocumentReducers(stdb, deps) };
const uuid = (): string => crypto.randomUUID();
const EDIT = '{"drive":{"edit":true}}';
const VIEW = '{"drive":{"view":true}}';

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
function folder(db: FakeDb, by: FakeMember, o: { space: string; parentId?: string; ownerMemberId?: string; name?: string; id?: string }): string {
  const itemId = o.id ?? uuid();
  db.run(R.createDriveFolder, by, {
    organizationId: by.organizationId, itemId, space: o.space, parentId: o.parentId ?? "", ownerMemberId: o.ownerMemberId ?? "",
    name: o.name ?? "Folder", actingMemberId: "",
  });
  return itemId;
}
/** A ready (or pending) uploaded file, inserted directly (uploads are drive/uploads.ts). */
function file(db: FakeDb, owner: FakeMember, o: { space: string; parentId?: string; name?: string; status?: string }): string {
  const id = uuid();
  const now = new FakeTimestamp(db.nowMicros);
  db.insert("driveItem", {
    id, organizationId: owner.organizationId, adminScope: "scope", space: o.space, parentId: o.parentId ?? "", kind: "file",
    name: o.name ?? "a.pdf", mimeType: "application/pdf", sizeBytes: 10n, blobKey: `org/${owner.organizationId}/${id}/${uuid()}/a.pdf`,
    thumbKey: "", thumbBytes: 0n, etag: "e", ownerMemberId: owner.memberId, createdByMemberId: owner.memberId,
    uploaderIdentity: owner.identity, status: o.status ?? "ready", uploadExpiresAt: now, uploadAttempts: 0, trashed: false,
    trashRootId: "", trashedAt: undefined, trashedByMemberId: "", createdAt: now, updatedAt: now, lastEditorMemberId: owner.memberId,
    trashRootAt: 0n,
  });
  return id;
}
function newDoc(db: FakeDb, by: FakeMember, o: { space: string; folderId?: string; ownerMemberId?: string; visibility?: string; fileType?: string; initialState?: Uint8Array }): string {
  const documentId = uuid();
  db.run(R.createDriveDocument, by, {
    organizationId: by.organizationId, documentId, fileType: o.fileType ?? "doc", space: o.space, folderId: o.folderId ?? "",
    ownerMemberId: o.ownerMemberId ?? "", visibility: o.visibility ?? "", title: "  Q3  plan ", templateId: "",
    initialState: o.initialState, html: undefined, plainText: "cells", wordCount: 3, actingMemberId: "",
  });
  return documentId;
}
function move(db: FakeDb, by: FakeMember, o: { items?: string[]; docs?: string[]; space: string; parentId?: string; ownerMemberId?: string; org?: string }): void {
  db.run(R.moveDriveEntries, by, {
    organizationId: o.org ?? by.organizationId, itemIds: JSON.stringify(o.items ?? []), documentIds: JSON.stringify(o.docs ?? []),
    targetSpace: o.space, targetParentId: o.parentId ?? "", targetOwnerMemberId: o.ownerMemberId ?? "", actingMemberId: "",
  });
}
const readers = (db: FakeDb, documentId: string): string[] =>
  db.rows("documentReaderIndex").filter((r) => r.documentId === documentId).map((r) => (r.userId as FakeIdentity).hex).sort();
const hexes = (...members: FakeMember[]): string[] => members.map((m) => m.identity.hex).sort();

describe("createDriveFolder", () => {
  test("store root, my root and nested: owner, creator, admin scope, usage", () => {
    const { db, orgA } = createDriveWorld();
    const store = folder(db, orgA.staff, { space: "store" });
    const mine = folder(db, orgA.staff, { space: "my" });
    const nested = folder(db, orgA.staff, { space: "my", parentId: mine });
    const scope = row(db, "driveOrgState", orgA.organizationId).adminScope;
    expect(row(db, "driveItem", store)).toMatchObject({ space: "store", parentId: "", kind: "folder", status: "ready", adminScope: scope,
      ownerMemberId: orgA.staff.memberId, createdByMemberId: orgA.staff.memberId, blobKey: "", sizeBytes: 0n, trashed: false });
    expect(row(db, "driveItem", nested)).toMatchObject({ space: "my", parentId: mine, ownerMemberId: orgA.staff.memberId });
    expect(row(db, "driveUsage", orgA.organizationId)).toMatchObject({ itemCount: 3, fileCount: 0, bytesUsed: 0n, scope: "service" });
  });

  test("names are cleaned (NFC, controls, trim), never truncated; bad names and ids are refused", () => {
    const { db, orgA } = createDriveWorld();
    const id = folder(db, orgA.staff, { space: "store", name: "  Café ‮report ", id: uuid().toUpperCase() });
    expect(row(db, "driveItem", id.toLowerCase()).name).toBe("Café report");
    for (const name of ["", "..", "a/b", "x".repeat(256)]) {
      expect(errorOf(() => folder(db, orgA.staff, { space: "store", name }))).toContain("[drive.invalid_name]");
    }
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", id: "not-a-uuid" }))).toContain("[drive.invalid]");
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", id: id.toLowerCase() }))).toContain("[drive.conflict]");
    expect(errorOf(() => folder(db, orgA.staff, { space: "shared" }))).toContain("[drive.invalid]");
  });

  test("an admin creates in another member's My root: the space owner owns it", () => {
    const { db, orgA } = createDriveWorld();
    const id = folder(db, orgA.manager, { space: "my", ownerMemberId: orgA.staff.memberId });
    expect(row(db, "driveItem", id)).toMatchObject({ ownerMemberId: orgA.staff.memberId, createdByMemberId: orgA.manager.memberId });
    const inside = folder(db, orgA.owner, { space: "my", parentId: id });
    expect(row(db, "driveItem", inside).ownerMemberId).toBe(orgA.staff.memberId);
  });

  test("a colleague's My files: staff and drive.view cannot add, drive.edit (editor) can", () => {
    const { db, orgA } = createDriveWorld();
    const viewer = db.addMember({ organizationId: orgA.organizationId, permissions: VIEW });
    const editor = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT });
    expect(errorOf(() => folder(db, orgA.staff, { space: "my", ownerMemberId: orgA.manager.memberId }))).toContain("[drive.forbidden]");
    expect(errorOf(() => folder(db, viewer, { space: "my", ownerMemberId: orgA.manager.memberId }))).toContain("[drive.forbidden]");
    expect(row(db, "driveItem", folder(db, editor, { space: "my", ownerMemberId: orgA.manager.memberId })).ownerMemberId).toBe(orgA.manager.memberId);
  });

  test("container checks: space, kind, trash, org, owner, member, Docs gate", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const store = folder(db, orgA.staff, { space: "store" });
    const aFile = file(db, orgA.staff, { space: "store" });
    const trashed = folder(db, orgA.staff, { space: "store" });
    db.patch("driveItem", trashed, { trashed: true, trashRootId: trashed });
    const mine = folder(db, orgA.staff, { space: "my" });
    const inB = folder(db, orgB.staff, { space: "store" });
    expect(errorOf(() => folder(db, orgA.staff, { space: "my", parentId: store }))).toContain("[drive.space_mismatch]");
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", parentId: aFile }))).toContain("[drive.invalid]");
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", parentId: trashed }))).toContain("[drive.trashed]");
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", parentId: inB }))).toContain("[drive.not_found]");
    expect(errorOf(() => folder(db, orgA.owner, { space: "my", parentId: mine, ownerMemberId: orgA.manager.memberId }))).toContain("[drive.invalid]");
    expect(errorOf(() => folder(db, orgA.owner, { space: "my", ownerMemberId: orgB.staff.memberId }))).toContain("[drive.not_found]");
    const gatedOut = db.addMember({ organizationId: orgA.organizationId, permissions: '{"dashboard":{"view":false}}' });
    expect(errorOf(() => folder(db, gatedOut, { space: "store" }))).toContain("[drive.forbidden]");
  });

  test(`depth is capped at ${DRIVE_MAX_DEPTH}; the org at ${DRIVE_MAX_ITEMS_PER_ORG} items`, () => {
    const { db, orgA } = createDriveWorld();
    let parentId = "";
    for (let i = 0; i < DRIVE_MAX_DEPTH; i++) parentId = folder(db, orgA.staff, { space: "store", parentId });
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", parentId }))).toContain("[drive.too_deep]");
    db.patch("driveUsage", orgA.organizationId, { itemCount: DRIVE_MAX_ITEMS_PER_ORG });
    expect(errorOf(() => folder(db, orgA.staff, { space: "store" }))).toContain("[drive.too_many_items]");
  });
});

describe("renameDriveItem / toggleDriveStar", () => {
  test("rename needs editor; blocked types stay blocked; no-op when unchanged", () => {
    const { db, orgA } = createDriveWorld();
    const editor = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT });
    const colleagues = folder(db, orgA.manager, { space: "store", name: "Team" });
    const rename = (by: FakeMember, itemId: string, name: string) => () => db.run(R.renameDriveItem, by, { itemId, name, actingMemberId: "" });
    expect(errorOf(rename(orgA.staff, colleagues, "Mine"))).toContain("[drive.forbidden]");
    rename(editor, colleagues, " Shared ")();
    expect(row(db, "driveItem", colleagues)).toMatchObject({ name: "Shared", lastEditorMemberId: editor.memberId });
    const before = row(db, "driveItem", colleagues);
    rename(editor, colleagues, "Shared")();
    expect(row(db, "driveItem", colleagues)).toBe(before);
    const pdf = file(db, orgA.staff, { space: "store" });
    expect(errorOf(rename(orgA.staff, pdf, "setup.exe"))).toContain("[drive.blocked_type]");
    expect(errorOf(rename(orgA.staff, pdf, "a/b"))).toContain("[drive.invalid_name]");
    rename(orgA.staff, folder(db, orgA.staff, { space: "store" }), "tools.exe")(); // folders have no type
    db.patch("driveItem", pdf, { trashed: true, trashRootId: pdf });
    expect(errorOf(rename(orgA.staff, pdf, "b.pdf"))).toContain("[drive.trashed]");
  });

  test("star toggles per member and needs viewer", () => {
    const { db, orgA } = createDriveWorld();
    const viewer = db.addMember({ organizationId: orgA.organizationId, permissions: VIEW });
    const managers = folder(db, orgA.manager, { space: "my" });
    const star = (by: FakeMember) => () => db.run(R.toggleDriveStar, by, { itemId: managers, actingMemberId: "" });
    expect(errorOf(star(orgA.staff))).toContain("[drive.forbidden]");
    star(viewer)();
    expect(db.rows("driveStar")).toEqual([expect.objectContaining({ id: `${managers}:${viewer.memberId}`, memberId: viewer.memberId, organizationId: orgA.organizationId })]);
    star(viewer)();
    expect(db.rows("driveStar")).toHaveLength(0);
  });
});

describe("acknowledgeDriveNotice / refreshMyDriveAccess", () => {
  test("one acknowledgement per (member, notice, surface); the operator's on a tablet", () => {
    const { db, orgA } = createDriveWorld();
    const ack = (by: FakeMember, surface: string, o: { notice?: string; acting?: string } = {}) => () => db.run(R.acknowledgeDriveNotice, by, {
      organizationId: orgA.organizationId, notice: o.notice ?? "drive_management_v1", surface, actingMemberId: o.acting ?? "" });
    ack(orgA.staff, "personal")();
    ack(orgA.staff, "personal")();
    // The staff member unlocked the owner-account tablet (resolveDeviceOperator's row).
    db.insert("deviceOperatorSession", {
      identity: orgA.owner.identity, organizationId: orgA.organizationId, memberId: orgA.staff.memberId,
      memberName: "Staff", role: "staff", resolvedAt: new FakeTimestamp(db.nowMicros),
    });
    ack(orgA.owner, "store", { acting: orgA.staff.memberId })();
    const rows = db.rows("driveNoticeAck");
    expect(rows.map((r) => r.id).sort()).toEqual([`${orgA.staff.memberId}:drive_management_v1:personal`, `${orgA.staff.memberId}:drive_management_v1:store`].sort());
    expect(row(db, "driveNoticeAck", `${orgA.staff.memberId}:drive_management_v1:store`).userId).toBe(orgA.owner.identity);
    ack(orgA.staff, "store")(); // the member's own device now sees it (self rule)
    expect(row(db, "driveNoticeAck", `${orgA.staff.memberId}:drive_management_v1:store`).userId).toBe(orgA.staff.identity);
    expect(errorOf(ack(orgA.staff, "kiosk"))).toContain("[drive.invalid]");
    expect(errorOf(ack(orgA.staff, "manager", { notice: "v0" }))).toContain("[drive.invalid]");
  });

  test("refreshMyDriveAccess rebuilds the caller's rows only; service is a no-op; outsiders are refused", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const doc = newDoc(db, orgA.staff, { space: "store" });
    db.transact((tables) => { for (const r of db.rows("documentReaderIndex")) (tables.documentReaderIndex as { delete(r: Row): void }).delete(r); });
    db.run(R.refreshMyDriveAccess, orgA.manager, { organizationId: orgA.organizationId });
    expect(readers(db, doc)).toEqual(hexes(orgA.manager));
    expect(db.rows("driveAdminIndex").map((r) => (r.userId as FakeIdentity).hex)).toContain(orgA.manager.identity.hex);
    const before = db.rows("driveAdminIndex").length;
    db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "test", registeredAt: new FakeTimestamp(db.nowMicros) });
    db.run(R.refreshMyDriveAccess, SERVICE_IDENTITY, { organizationId: orgA.organizationId });
    expect(db.rows("driveAdminIndex")).toHaveLength(before);
    expect(errorOf(() => db.run(R.refreshMyDriveAccess, orgB.staff, { organizationId: orgA.organizationId }))).toContain("[drive.forbidden]");
  });
});

describe("moveDriveEntries — same space", () => {
  test("moves roots only; cycle, depth, role, status and batch checks", () => {
    const { db, orgA } = createDriveWorld();
    const a = folder(db, orgA.staff, { space: "store" });
    const child = folder(db, orgA.staff, { space: "store", parentId: a });
    const b = folder(db, orgA.staff, { space: "store" });
    move(db, orgA.staff, { items: [a], space: "store", parentId: b });
    expect(row(db, "driveItem", a).parentId).toBe(b);
    expect(row(db, "driveItem", child).parentId).toBe(a);
    expect(errorOf(() => move(db, orgA.staff, { items: [b], space: "store", parentId: child }))).toContain("[drive.cycle]");
    expect(errorOf(() => move(db, orgA.staff, { items: [a], space: "store", parentId: a }))).toContain("[drive.cycle]");
    let deep = "";
    for (let i = 0; i < DRIVE_MAX_DEPTH - 2; i++) deep = folder(db, orgA.owner, { space: "store", parentId: deep });
    expect(errorOf(() => move(db, orgA.staff, { items: [b], space: "store", parentId: deep }))).toContain("[drive.too_deep]"); // b › a › child
    expect(errorOf(() => move(db, orgA.manager, { items: [folder(db, orgA.owner, { space: "store" })], space: "store", parentId: b }))).toBe("(no error)");
    expect(errorOf(() => move(db, orgA.staff, { items: [folder(db, orgA.manager, { space: "store" })], space: "store", parentId: b }))).toContain("[drive.forbidden]");
    expect(errorOf(() => move(db, orgA.staff, { items: [file(db, orgA.staff, { space: "store", status: "pending" })], space: "store" }))).toContain("[drive.invalid]");
    const tooMany = Array.from({ length: DRIVE_MAX_BATCH + 1 }, uuid);
    expect(errorOf(() => move(db, orgA.staff, { items: tooMany, space: "store" }))).toContain("[drive.batch_too_large]");
    expect(errorOf(() => db.run(R.moveDriveEntries, orgA.staff, { organizationId: orgA.organizationId, itemIds: "[nope", documentIds: "", targetSpace: "store", targetParentId: "", targetOwnerMemberId: "", actingMemberId: "" }))).toContain("[drive.invalid]");
  });

  test("an oversized id list is refused before it is parsed", () => {
    const { db, orgA } = createDriveWorld();
    const huge = JSON.stringify(Array.from({ length: 60_000 }, uuid)); // 2.3 MB; parsing it took seconds
    expect(huge.length).toBeGreaterThan(DRIVE_ID_LIST_MAX_CHARS);
    const started = performance.now();
    expect(errorOf(() => db.run(R.moveDriveEntries, orgA.staff, { organizationId: orgA.organizationId, itemIds: "[]", documentIds: huge, targetSpace: "store", targetParentId: "", targetOwnerMemberId: "", actingMemberId: "" }))).toContain("[drive.batch_too_large]");
    expect(performance.now() - started).toBeLessThan(250);
  });

  test("a document moves with manager, or editor plus drive.edit", () => {
    const { db, orgA } = createDriveWorld();
    const editor = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT });
    const doc = newDoc(db, orgA.manager, { space: "store" });
    const target = folder(db, orgA.staff, { space: "store" });
    expect(errorOf(() => move(db, orgA.staff, { docs: [doc], space: "store", parentId: target }))).toContain("[drive.forbidden]");
    move(db, editor, { docs: [doc], space: "store", parentId: target });
    expect(docRow(db, doc)).toMatchObject({ folderId: target, visibility: "org_edit" });
  });

  test("a document from before Drive (no document_file row) gets one, typed 'doc', only when it leaves the root", () => {
    const { db, orgA } = createDriveWorld();
    const legacy = uuid();
    const now = new FakeTimestamp(db.nowMicros);
    db.insert("document", {
      id: legacy, organizationId: orgA.organizationId, ownerMemberId: orgA.staff.memberId, title: "Old", excerpt: "", icon: undefined,
      visibility: "org_edit", templateId: undefined, pageSetup: undefined, wordCount: 0, createdAt: now, updatedAt: now,
      lastEditorMemberId: undefined, trashedAt: undefined, trashedByMemberId: undefined,
    });
    const target = folder(db, orgA.manager, { space: "store" });
    move(db, orgA.manager, { docs: [legacy], space: "store" });
    expect(db.find("documentFile", legacy)).toBeNull();
    move(db, orgA.manager, { docs: [legacy], space: "store", parentId: target });
    expect(row(db, "documentFile", legacy)).toMatchObject({ organizationId: orgA.organizationId, fileType: "doc", folderId: target });
    move(db, orgA.manager, { docs: [legacy], space: "store" });
    expect(row(db, "documentFile", legacy)).toMatchObject({ fileType: "doc", folderId: "" });
    expect(row(db, "document", legacy).updatedAt).toBe(now); // a folder change never rewrites the document row
  });

  test("a colleague's document inside a moved folder needs the same right as one moved on its own", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const editor = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT });
    const mine = folder(db, orgA.staff, { space: "store" });
    const target = folder(db, orgA.staff, { space: "store" });
    newDoc(db, colleague, { space: "store", folderId: mine });
    expect(errorOf(() => move(db, orgA.staff, { items: [mine], space: "store", parentId: target }))).toContain("[drive.forbidden]");
    expect(row(db, "driveItem", mine).parentId).toBe("");
    move(db, editor, { items: [mine], space: "store", parentId: target });
    expect(row(db, "driveItem", mine).parentId).toBe(target);
  });
});

describe("moveDriveEntries — across spaces (Q3)", () => {
  test("My → Store publishes the subtree: spaces flip, private docs become org_edit, readers follow", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const mine = folder(db, orgA.staff, { space: "my" });
    const sub = folder(db, orgA.staff, { space: "my", parentId: mine });
    const doc = newDoc(db, orgA.staff, { space: "my", folderId: sub });
    expect(readers(db, doc)).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff));
    move(db, orgA.staff, { items: [mine], space: "store" });
    expect(row(db, "driveItem", mine)).toMatchObject({ space: "store", parentId: "" });
    expect(row(db, "driveItem", sub)).toMatchObject({ space: "store", parentId: mine, ownerMemberId: orgA.staff.memberId });
    expect(docRow(db, doc)).toMatchObject({ visibility: "org_edit", folderId: sub });
    expect(readers(db, doc)).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff, colleague));
    move(db, orgA.staff, { items: [mine], space: "my" });
    expect(docRow(db, doc).visibility).toBe("private");
    expect(readers(db, doc)).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff));
  });

  test("drive.edit (editor) cannot move others' items across spaces or owners", () => {
    const { db, orgA } = createDriveWorld();
    const editor = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT });
    const managersStore = folder(db, orgA.manager, { space: "store" });
    const staffsMine = folder(db, orgA.staff, { space: "my" });
    expect(errorOf(() => move(db, editor, { items: [managersStore], space: "my", ownerMemberId: orgA.manager.memberId }))).toContain("[drive.forbidden]");
    expect(errorOf(() => move(db, editor, { items: [staffsMine], space: "store" }))).toContain("[drive.forbidden]");
    expect(errorOf(() => move(db, editor, { items: [staffsMine], space: "my", ownerMemberId: orgA.manager.memberId }))).toContain("[drive.forbidden]");
    expect([row(db, "driveItem", managersStore).space, row(db, "driveItem", staffsMine).space]).toEqual(["store", "my"]);
  });

  test("an admin cannot publish an active member's My files, but may rescue a departed member's", () => {
    const { db, orgA } = createDriveWorld();
    const mine = folder(db, orgA.staff, { space: "my" });
    expect(errorOf(() => move(db, orgA.manager, { items: [mine], space: "store" }))).toContain("[drive.space_mismatch]");
    db.patch("orgMember", orgA.staff.memberId, { status: "disabled" });
    move(db, orgA.manager, { items: [mine], space: "store" });
    expect(row(db, "driveItem", mine)).toMatchObject({ space: "store", ownerMemberId: orgA.staff.memberId });
  });

  test("into someone's My files only when every moved row is already theirs; owners never change", () => {
    const { db, orgA } = createDriveWorld();
    const store = folder(db, orgA.staff, { space: "store" });
    folder(db, orgA.staff, { space: "store", parentId: store });
    move(db, orgA.manager, { items: [store], space: "my", ownerMemberId: orgA.staff.memberId });
    expect(row(db, "driveItem", store)).toMatchObject({ space: "my", ownerMemberId: orgA.staff.memberId });
    const mixed = folder(db, orgA.staff, { space: "store" });
    file(db, orgA.manager, { space: "store", parentId: mixed });
    expect(errorOf(() => move(db, orgA.staff, { items: [mixed], space: "my" }))).toContain("[drive.space_mismatch]");
    const managers = folder(db, orgA.manager, { space: "my" });
    expect(errorOf(() => move(db, orgA.owner, { items: [managers], space: "my", ownerMemberId: orgA.staff.memberId }))).toContain("[drive.space_mismatch]");
  });

  test("setDocumentFolder: into a Store folder publishes (org_view is kept), and the Q3 rule applies", () => {
    const { db, orgA } = createDriveWorld();
    const storeFolder = folder(db, orgA.manager, { space: "store" });
    const doc = newDoc(db, orgA.staff, { space: "my" });
    const set = (by: FakeMember, documentId: string, space: string, folderId: string) => () => db.run(R.setDocumentFolder, by, { documentId, space, folderId, ownerMemberId: "", actingMemberId: "" });
    expect(errorOf(set(orgA.manager, doc, "store", storeFolder))).toContain("[drive.space_mismatch]");
    set(orgA.staff, doc, "store", storeFolder)();
    expect(docRow(db, doc)).toMatchObject({ folderId: storeFolder, visibility: "org_edit" });
    const viewOnly = newDoc(db, orgA.manager, { space: "store", visibility: "org_view" });
    set(orgA.manager, viewOnly, "store", storeFolder)();
    expect(docRow(db, viewOnly)).toMatchObject({ folderId: storeFolder, visibility: "org_view" });
  });
});

describe("createDriveDocument", () => {
  test("Store: org_edit by default, owned by the actor, seeded, readable by the org only", () => {
    const { db, orgA } = createDriveWorld();
    const parent = folder(db, orgA.staff, { space: "store" });
    // A real gzip member (the module rejects sheet seeds shorter than a gzip header + trailer).
    const seed = gzipSync(new TextEncoder().encode('{"sheets":{}}'));
    const id = newDoc(db, orgA.staff, { space: "store", folderId: parent, fileType: "sheet", initialState: seed });
    expect(docRow(db, id)).toMatchObject({ fileType: "sheet", folderId: parent, visibility: "org_edit", title: "Q3 plan",
      ownerMemberId: orgA.staff.memberId, lastEditorMemberId: orgA.staff.memberId, excerpt: "cells", wordCount: 3 });
    expect(row(db, "documentSnapshot", id)).toMatchObject({ byteLength: seed.byteLength, plainText: "cells", compactedByMemberId: orgA.staff.memberId });
    expect(readers(db, id)).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff));
    // Type and folder are a document_file row written with the document; the document row keeps its shipped columns.
    expect(row(db, "documentFile", id)).toMatchObject({ documentId: id, organizationId: orgA.organizationId, fileType: "sheet", folderId: parent });
    expect(Object.keys(row(db, "document", id))).not.toContain("fileType");
  });

  test("My files: private, owned by the space owner even when an admin creates it", () => {
    const { db, orgA } = createDriveWorld();
    const id = newDoc(db, orgA.manager, { space: "my", ownerMemberId: orgA.staff.memberId, fileType: "slides" });
    expect(docRow(db, id)).toMatchObject({ visibility: "private", ownerMemberId: orgA.staff.memberId, lastEditorMemberId: orgA.manager.memberId, folderId: "" });
    expect(db.find("documentSnapshot", id)).toBeNull();
    expect(readers(db, id)).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff));
  });

  test("refuses a mismatched visibility, unknown type, reused id, oversized seed and a colleague's My files", () => {
    const { db, orgA } = createDriveWorld();
    expect(errorOf(() => newDoc(db, orgA.staff, { space: "my", visibility: "org_edit" }))).toContain("[drive.invalid]");
    expect(errorOf(() => newDoc(db, orgA.staff, { space: "store", visibility: "private" }))).toContain("[drive.invalid]");
    expect(errorOf(() => newDoc(db, orgA.staff, { space: "store", fileType: "form" }))).toContain("[drive.invalid]");
    expect(errorOf(() => newDoc(db, orgA.staff, { space: "store", initialState: new Uint8Array(deps.docLimits.stateMaxBytes + 1) }))).toContain("[doc.too_large]");
    expect(errorOf(() => newDoc(db, orgA.staff, { space: "my", ownerMemberId: orgA.manager.memberId }))).toContain("[drive.forbidden]");
    const id = newDoc(db, orgA.staff, { space: "store" });
    expect(errorOf(() => db.run(R.createDriveDocument, orgA.staff, { organizationId: orgA.organizationId, documentId: id, fileType: "doc", space: "store", folderId: "", ownerMemberId: "", visibility: "", title: "", templateId: "", initialState: undefined, html: undefined, plainText: undefined, wordCount: undefined, actingMemberId: "" }))).toContain("[drive.invalid]");
    expect(db.rows("document")).toHaveLength(1);
  });
});

describe("cross-org ids → [drive.not_found], nothing written", () => {
  test("move / setDocumentFolder / rename / star with another store's ids", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const aFolder = folder(db, orgA.owner, { space: "store" });
    const bFolder = folder(db, orgB.owner, { space: "store" });
    const bDoc = newDoc(db, orgB.owner, { space: "store" });
    const snapshot = () => JSON.stringify([db.rows("driveItem"), db.rows("document"), db.rows("documentFile"), db.rows("driveStar")], (_k, v) => typeof v === "bigint" ? `${v}` : v);
    const before = snapshot();
    expect(errorOf(() => move(db, orgA.owner, { items: [bFolder], space: "store", parentId: aFolder }))).toContain("[drive.not_found]");
    expect(errorOf(() => move(db, orgA.owner, { docs: [bDoc], space: "store", parentId: aFolder }))).toContain("[drive.not_found]");
    expect(errorOf(() => move(db, orgA.owner, { items: [aFolder], space: "store", parentId: bFolder }))).toContain("[drive.not_found]");
    expect(errorOf(() => db.run(R.setDocumentFolder, orgA.owner, { documentId: bDoc, space: "store", folderId: aFolder, ownerMemberId: "", actingMemberId: "" }))).toContain("[drive.not_found]");
    expect(errorOf(() => db.run(R.renameDriveItem, orgA.owner, { itemId: bFolder, name: "x", actingMemberId: "" }))).toContain("[drive.not_found]");
    expect(errorOf(() => db.run(R.toggleDriveStar, orgA.owner, { itemId: bFolder, actingMemberId: "" }))).toContain("[drive.not_found]");
    expect(errorOf(() => move(db, orgA.owner, { items: [bFolder], space: "store", org: orgB.organizationId }))).toContain("[drive.forbidden]");
    expect(snapshot()).toBe(before);
  });
});
