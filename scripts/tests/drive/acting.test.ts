// Acting member (store tablet operator), DS §4.4: acting only attributes and
// NARROWS — every role is the minimum of the caller's and the operator's.
// Runs the real drive/context.ts + drive/reducers.ts with the real `driveDeps`
// wiring object of spacetimedb/src/index.ts, over the two-org fake database.

import { describe, expect, test } from "bun:test";
import {
  adminOf, docRoleOf, resolveDriveActor, type DriveActor, type DriveDeps,
} from "../../../spacetimedb/src/drive/context";
import { defineDriveReducers } from "../../../spacetimedb/src/drive/reducers";
import { defineDriveTrashReducers } from "../../../spacetimedb/src/drive/trash";
import { DRIVE_NOTICE_ID, DRIVE_OPERATOR_SESSION_TTL_MICROS } from "../../../spacetimedb/src/drive/logic";
import type { DriveCtx, DriveSchema } from "../../../spacetimedb/src/drive/types";
import {
  FakeIdentity, FakeTimestamp, SERVICE_IDENTITY, createDriveWorld, loadModule, moduleStubs,
  type FakeDb, type FakeMember, type Row,
} from "./fake-db";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
const R = { ...defineDriveReducers(stdb, deps), ...defineDriveTrashReducers(stdb, deps) };

const uuid = (): string => crypto.randomUUID();

function errorOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    return String((error as Error).message);
  }
  return "(no error)";
}

/** The service_identity row registerServiceIdentity writes: driveDeps checks the table, not the test stub. */
function registerService(db: FakeDb): void {
  db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "test", registeredAt: new FakeTimestamp(db.nowMicros) });
}

/** The tablet's device_operator_session row, as resolveDeviceOperator writes it. */
function session(db: FakeDb, tablet: FakeMember, operator: FakeMember, resolvedAtMicros = db.nowMicros): void {
  db.insert("deviceOperatorSession", {
    identity: tablet.identity, organizationId: operator.organizationId, memberId: operator.memberId,
    memberName: "Operator", role: operator.role, resolvedAt: new FakeTimestamp(resolvedAtMicros),
  });
}

function folder(db: FakeDb, by: FakeMember, input: { space: string; parentId?: string; ownerMemberId?: string; acting?: FakeMember; name?: string }): string {
  const itemId = uuid();
  db.run(R.createDriveFolder, by, {
    organizationId: by.organizationId, itemId, space: input.space, parentId: input.parentId ?? "",
    ownerMemberId: input.ownerMemberId ?? "", name: input.name ?? "Folder", actingMemberId: input.acting?.memberId ?? "",
  });
  return itemId;
}

function item(db: FakeDb, id: string): Row {
  const row = db.find("driveItem", id);
  if (!row) throw new Error(`no drive_item ${id}`);
  return row;
}

/** resolveDriveActor inside a transaction (it self-heals the caller's admin row). */
function actorFor(db: FakeDb, sender: FakeIdentity, organizationId: string, acting: string, atMicros?: bigint): DriveActor {
  const ctx = db.ctx(sender, { atMicros }) as unknown as DriveCtx;
  return db.transact(() => resolveDriveActor(ctx, deps, organizationId, acting));
}

function addDoc(db: FakeDb, owner: FakeMember, visibility: string): Row {
  return db.insert("document", {
    id: uuid(), organizationId: owner.organizationId, ownerMemberId: owner.memberId, title: "Doc", excerpt: "",
    icon: undefined, visibility, templateId: undefined, pageSetup: undefined, wordCount: 0,
    createdAt: new FakeTimestamp(db.nowMicros), updatedAt: new FakeTimestamp(db.nowMicros),
    lastEditorMemberId: owner.memberId, trashedAt: undefined, trashedByMemberId: undefined,
  });
}

describe("owner-account tablet acting for a staff operator", () => {
  test("new rows belong to and are attributed to the operator; no session is needed", () => {
    const { db, orgA } = createDriveWorld();
    const mine = folder(db, orgA.owner, { space: "my", acting: orgA.staff });
    expect(item(db, mine)).toMatchObject({ space: "my", ownerMemberId: orgA.staff.memberId, createdByMemberId: orgA.staff.memberId });
    const shared = folder(db, orgA.owner, { space: "store", acting: orgA.staff });
    expect(item(db, shared)).toMatchObject({ ownerMemberId: orgA.staff.memberId, createdByMemberId: orgA.staff.memberId });
    expect(item(db, shared).uploaderIdentity).toBe(orgA.owner.identity);
  });

  test("rights are the operator's: the owner's reach does not leak to the staff operator", () => {
    const { db, orgA } = createDriveWorld();
    const managersFolder = folder(db, orgA.manager, { space: "my" });
    expect(errorOf(() => folder(db, orgA.owner, { space: "my", ownerMemberId: orgA.manager.memberId, acting: orgA.staff })))
      .toContain("[drive.forbidden]");
    expect(errorOf(() => db.run(R.renameDriveItem, orgA.owner, { itemId: managersFolder, name: "Mine now", actingMemberId: orgA.staff.memberId })))
      .toContain("[drive.forbidden]");
    // Without acting, the owner may.
    db.run(R.renameDriveItem, orgA.owner, { itemId: managersFolder, name: "Renamed", actingMemberId: "" });
    expect(item(db, managersFolder).name).toBe("Renamed");
  });

  test("the service identity may act for an active member without a session", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    const id = folder(db, orgA.staff, { space: "my" });
    const actor = actorFor(db, SERVICE_IDENTITY, orgA.organizationId, orgA.staff.memberId);
    expect(actor).toMatchObject({ acting: true, isService: true, memberId: orgA.staff.memberId });
    db.run(R.renameDriveItem, SERVICE_IDENTITY, { itemId: id, name: "By support", actingMemberId: orgA.staff.memberId });
    expect(item(db, id)).toMatchObject({ name: "By support", lastEditorMemberId: orgA.staff.memberId });
  });
});

describe("staff-account tablet with a fresh session for a manager operator", () => {
  test("Store writes work and are attributed to the operator", () => {
    const { db, orgA } = createDriveWorld();
    session(db, orgA.staff, orgA.manager);
    const id = folder(db, orgA.staff, { space: "store", acting: orgA.manager });
    expect(item(db, id)).toMatchObject({ ownerMemberId: orgA.manager.memberId, createdByMemberId: orgA.manager.memberId });
  });

  test("no escalation: the operator's My files are out of the tablet's reach → device_scope", () => {
    const { db, orgA } = createDriveWorld();
    const managersFolder = folder(db, orgA.manager, { space: "my" });
    session(db, orgA.staff, orgA.manager);
    expect(errorOf(() => folder(db, orgA.staff, { space: "my", acting: orgA.manager }))).toContain("[drive.device_scope]");
    expect(errorOf(() => folder(db, orgA.staff, { space: "my", parentId: managersFolder, acting: orgA.manager })))
      .toContain("[drive.device_scope]");
    expect(errorOf(() => db.run(R.renameDriveItem, orgA.staff, { itemId: managersFolder, name: "x", actingMemberId: orgA.manager.memberId })))
      .toContain("[drive.device_scope]");
    expect(db.rows("driveItem")).toHaveLength(1);
  });

  test("no escalation in Store either: a colleague's Store folder stays read-only for the tablet", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const theirs = folder(db, colleague, { space: "store" });
    session(db, orgA.staff, orgA.manager);
    // The manager alone could rename it; the staff tablet cannot, so the intersection cannot.
    expect(errorOf(() => db.run(R.renameDriveItem, orgA.staff, { itemId: theirs, name: "x", actingMemberId: orgA.manager.memberId })))
      .toContain("[drive.forbidden]");
    db.run(R.renameDriveItem, orgA.manager, { itemId: theirs, name: "ok", actingMemberId: "" });
    expect(item(db, theirs).name).toBe("ok");
  });

  test("the admin power is the AND of both", () => {
    const { db, orgA } = createDriveWorld();
    session(db, orgA.staff, orgA.manager);
    expect(adminOf(actorFor(db, orgA.staff.identity, orgA.organizationId, orgA.manager.memberId))).toEqual({ view: false, edit: false });
    expect(adminOf(actorFor(db, orgA.owner.identity, orgA.organizationId, orgA.manager.memberId))).toEqual({ view: true, edit: true });
    const viewer = db.addMember({ organizationId: orgA.organizationId, permissions: '{"drive":{"view":true}}' });
    expect(adminOf(actorFor(db, orgA.owner.identity, orgA.organizationId, viewer.memberId))).toEqual({ view: true, edit: false });
  });
});

describe("[drive.operator]", () => {
  test("a session older than 12 h is refused; exactly 12 h still works", () => {
    const { db, orgA } = createDriveWorld();
    const start = db.nowMicros;
    session(db, orgA.staff, orgA.manager, start);
    const at = (micros: bigint) => () => db.run(R.createDriveFolder, orgA.staff, {
      organizationId: orgA.organizationId, itemId: uuid(), space: "store", parentId: "", ownerMemberId: "", name: "F",
      actingMemberId: orgA.manager.memberId,
    }, { atMicros: micros });
    expect(errorOf(at(start + DRIVE_OPERATOR_SESSION_TTL_MICROS))).toBe("(no error)");
    expect(errorOf(at(start + DRIVE_OPERATOR_SESSION_TTL_MICROS + 1n))).toContain("[drive.operator]");
  });

  test("a missing or mismatched session is refused", () => {
    const { db, orgA, orgB } = createDriveWorld();
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", acting: orgA.manager }))).toContain("[drive.operator]");
    const other = db.addMember({ organizationId: orgA.organizationId, role: "manager" });
    session(db, orgA.staff, other);
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", acting: orgA.manager }))).toContain("[drive.operator]");
    // A session for the same member id in another org does not count either.
    db.patch("deviceOperatorSession", orgA.staff.identity, { memberId: orgA.manager.memberId, organizationId: orgB.organizationId });
    expect(errorOf(() => folder(db, orgA.staff, { space: "store", acting: orgA.manager }))).toContain("[drive.operator]");
    expect(db.rows("driveItem")).toHaveLength(0);
  });

  test("an inactive operator, or one from another org, is refused even for an owner tablet", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const disabled = db.addMember({ organizationId: orgA.organizationId, status: "disabled" });
    expect(errorOf(() => folder(db, orgA.owner, { space: "store", acting: disabled }))).toContain("[drive.operator]");
    expect(errorOf(() => folder(db, orgA.owner, { space: "store", acting: orgB.staff }))).toContain("[drive.operator]");
    expect(db.rows("driveItem")).toHaveLength(0);
  });

  test("acting as yourself is not acting", () => {
    const { db, orgA } = createDriveWorld();
    const actor = actorFor(db, orgA.staff.identity, orgA.organizationId, orgA.staff.memberId.toUpperCase());
    expect(actor).toMatchObject({ acting: false, memberId: orgA.staff.memberId });
    expect(actor.operator).toBe(actor.caller);
  });
});

describe("caller resolution", () => {
  test("a non-member is refused; an item id from another org reads as not found", () => {
    const { db, orgA, orgB } = createDriveWorld();
    expect(errorOf(() => folder(db, orgA.owner, { space: "store", acting: undefined, name: "x", ownerMemberId: "" }))).toBe("(no error)");
    expect(errorOf(() => db.run(R.createDriveFolder, orgA.owner, {
      organizationId: orgB.organizationId, itemId: uuid(), space: "store", parentId: "", ownerMemberId: "", name: "x", actingMemberId: "",
    }))).toContain("[drive.forbidden]");
    const inB = folder(db, orgB.owner, { space: "store" });
    expect(errorOf(() => db.run(R.renameDriveItem, orgA.owner, { itemId: inB, name: "x", actingMemberId: "" }))).toContain("[drive.not_found]");
  });

  test("self-heals the caller's drive_admin_index row, never the service identity's", () => {
    const { db, orgA } = createDriveWorld();
    registerService(db);
    expect(db.rows("driveAdminIndex")).toHaveLength(0);
    actorFor(db, orgA.manager.identity, orgA.organizationId, "");
    expect(db.rows("driveAdminIndex").map((r) => (r.userId as FakeIdentity).hex)).toEqual([orgA.manager.identity.hex]);
    actorFor(db, orgA.staff.identity, orgA.organizationId, "");
    actorFor(db, SERVICE_IDENTITY, orgA.organizationId, "");
    expect(db.rows("driveAdminIndex")).toHaveLength(1);
  });
});

describe("docRoleOf", () => {
  test("is the minimum of the caller's and the operator's docRoleFor", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const managersPrivate = addDoc(db, orgA.manager, "private");
    const storeView = addDoc(db, orgA.manager, "org_view");
    const staffsPrivate = addDoc(db, orgA.staff, "private");
    const ownerForStaff = actorFor(db, orgA.owner.identity, orgA.organizationId, orgA.staff.memberId);
    const role = (doc: Row, actor: DriveActor) =>
      db.transact(() => docRoleOf(db.ctx(orgA.owner.identity) as unknown as DriveCtx, deps, doc as never, actor));
    expect(role(managersPrivate, ownerForStaff)).toBe("none");
    expect(role(storeView, ownerForStaff)).toBe("viewer");
    expect(role(staffsPrivate, ownerForStaff)).toBe("manager");
    const ownerAlone = actorFor(db, orgA.owner.identity, orgA.organizationId, "");
    expect(role(managersPrivate, ownerAlone)).toBe("manager");
    // Another organization's document: none, whoever asks.
    expect(role(addDoc(db, orgB.owner, "org_edit"), ownerAlone)).toBe("none");
  });
});

/** moveDriveEntries as `by`, acting for `acting` ('' = nobody). */
function moveAs(db: FakeDb, by: FakeMember, acting: FakeMember | null, o: { items?: string[]; docs?: string[]; space: string; parentId?: string }): () => void {
  return () => db.run(R.moveDriveEntries, by, {
    organizationId: by.organizationId, itemIds: JSON.stringify(o.items ?? []), documentIds: JSON.stringify(o.docs ?? []),
    targetSpace: o.space, targetParentId: o.parentId ?? "", targetOwnerMemberId: "", actingMemberId: acting?.memberId ?? "",
  });
}

describe("acting never publishes: Q3 must hold for the caller AND the operator", () => {
  test("an owner or manager acting for a member cannot publish that member's My files or private docs", () => {
    const { db, orgA } = createDriveWorld();
    const mine = folder(db, orgA.staff, { space: "my" });
    const privateDoc = addDoc(db, orgA.staff, "private").id as string;
    const storeFolder = folder(db, orgA.manager, { space: "store" });
    const setFolder = (by: FakeMember, acting: FakeMember | null) => () => db.run(R.setDocumentFolder, by, {
      documentId: privateDoc, space: "store", folderId: storeFolder, ownerMemberId: "", actingMemberId: acting?.memberId ?? "",
    });
    for (const admin of [orgA.owner, orgA.manager]) {
      expect(errorOf(moveAs(db, admin, orgA.staff, { items: [mine], space: "store" }))).toContain("[drive.space_mismatch]");
      expect(errorOf(moveAs(db, admin, orgA.staff, { docs: [privateDoc], space: "store", parentId: storeFolder }))).toContain("[drive.space_mismatch]");
      expect(errorOf(setFolder(admin, orgA.staff))).toContain("[drive.space_mismatch]");
    }
    expect(item(db, mine).space).toBe("my");
    expect(db.find("document", privateDoc)).toMatchObject({ visibility: "private" });
    expect(db.find("documentFile", privateDoc)).toBeNull(); // no folder change: still a row-less document at the root
    // The member, on their own device, may.
    setFolder(orgA.staff, null)();
    expect(db.find("document", privateDoc)).toMatchObject({ visibility: "org_edit" });
    expect(db.find("documentFile", privateDoc)).toMatchObject({ fileType: "doc", folderId: storeFolder });
  });

  test("where both allow it, acting works: an owner tablet moves the operator's Store folder into the operator's My files", () => {
    const { db, orgA } = createDriveWorld();
    const shared = folder(db, orgA.staff, { space: "store" });
    moveAs(db, orgA.owner, orgA.staff, { items: [shared], space: "my" })();
    expect(item(db, shared)).toMatchObject({ space: "my", ownerMemberId: orgA.staff.memberId });
  });
});

describe("acting trash", () => {
  test("a staff-account tablet cannot trash its operator's My files; a colleague's file stops an owner tablet's cascade", () => {
    const { db, orgA } = createDriveWorld();
    const trash = (by: FakeMember, itemId: string, acting: FakeMember | null) => () => db.run(R.trashDriveEntries, by, {
      organizationId: orgA.organizationId, itemIds: JSON.stringify([itemId]), documentIds: "[]", actingMemberId: acting?.memberId ?? "",
    });
    const managersFolder = folder(db, orgA.manager, { space: "my" });
    session(db, orgA.staff, orgA.manager);
    expect(errorOf(trash(orgA.staff, managersFolder, orgA.manager))).toContain("[drive.device_scope]");
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const staffs = folder(db, orgA.staff, { space: "store" });
    folder(db, colleague, { space: "store", parentId: staffs });
    // The owner alone may trash it all; acting for the staff member narrows to what they manage.
    expect(errorOf(trash(orgA.owner, staffs, orgA.staff))).toContain("[drive.subtree_forbidden]");
    expect(db.rows("driveItem").some((r) => r.trashed)).toBe(false);
    trash(orgA.owner, staffs, null)();
    expect(item(db, staffs).trashed).toBe(true);
  });
});

describe("acknowledgeDriveNotice while acting", () => {
  test("is only for the store surface: nobody acknowledges a member's phone or back-office disclosure for them", () => {
    const { db, orgA } = createDriveWorld();
    const ack = (surface: string) => () => db.run(R.acknowledgeDriveNotice, orgA.manager, {
      organizationId: orgA.organizationId, notice: DRIVE_NOTICE_ID, surface, actingMemberId: orgA.staff.memberId,
    });
    expect(errorOf(ack("personal"))).toContain("[drive.invalid]");
    expect(errorOf(ack("manager"))).toContain("[drive.invalid]");
    expect(db.rows("driveNoticeAck")).toHaveLength(0);
    session(db, orgA.manager, orgA.staff);
    ack("store")();
    expect(db.rows("driveNoticeAck").map((r) => r.id)).toEqual([`${orgA.staff.memberId}:${DRIVE_NOTICE_ID}:store`]);
  });

  test("needs the device's fresh operator session for that member, even from an owner or manager", () => {
    const { db, orgA } = createDriveWorld();
    const ack = (by: FakeMember | FakeIdentity, operator: FakeMember) => () => db.run(R.acknowledgeDriveNotice, by, {
      organizationId: orgA.organizationId, notice: DRIVE_NOTICE_ID, surface: "store", actingMemberId: operator.memberId,
    });
    // Management, from its own phone or back office with no unlock, cannot tick the box for a staff member.
    expect(errorOf(ack(orgA.manager, orgA.staff))).toContain("[drive.operator]");
    expect(errorOf(ack(orgA.owner, orgA.staff))).toContain("[drive.operator]");
    registerService(db);
    expect(errorOf(ack(SERVICE_IDENTITY, orgA.staff))).toContain("[drive.operator]");
    // A session for somebody else, or a stale one, is not an unlock by this member.
    session(db, orgA.manager, orgA.owner);
    expect(errorOf(ack(orgA.manager, orgA.staff))).toContain("[drive.operator]");
    db.patch("deviceOperatorSession", orgA.manager.identity, {
      memberId: orgA.staff.memberId, resolvedAt: new FakeTimestamp(db.nowMicros - DRIVE_OPERATOR_SESSION_TTL_MICROS - 10n),
    });
    expect(errorOf(ack(orgA.manager, orgA.staff))).toContain("[drive.operator]");
    expect(db.rows("driveNoticeAck")).toHaveLength(0);
    // The staff member unlocked the tablet with their PIN: now it records their acknowledgement.
    db.patch("deviceOperatorSession", orgA.manager.identity, { resolvedAt: new FakeTimestamp(db.nowMicros) });
    ack(orgA.manager, orgA.staff)();
    expect(db.rows("driveNoticeAck")).toEqual([expect.objectContaining({ memberId: orgA.staff.memberId, userId: orgA.manager.identity })]);
  });
});

describe("the service identity (driveDeps' own check, not the test stub)", () => {
  test("is recognised by its service_identity row only; any other identity is an outsider", () => {
    const { db, orgA } = createDriveWorld();
    const stranger = FakeIdentity.random();
    const create = (sender: FakeIdentity, organizationId: string) => () => db.run(R.createDriveFolder, sender, {
      organizationId, itemId: uuid(), space: "store", parentId: "", ownerMemberId: "", name: "x", actingMemberId: "",
    });
    expect(errorOf(create(stranger, orgA.organizationId))).toContain("[drive.forbidden]");
    expect(errorOf(create(stranger, uuid()))).toContain("[drive.forbidden]"); // an organization that does not exist
    expect(errorOf(create(SERVICE_IDENTITY, orgA.organizationId))).toContain("[drive.forbidden]"); // not registered yet
    expect(db.rows("driveItem")).toHaveLength(0);
    registerService(db);
    expect(deps.isServiceCaller(db.ctx(stranger) as unknown as DriveCtx)).toBe(false);
    expect(actorFor(db, SERVICE_IDENTITY, orgA.organizationId, "")).toMatchObject({ isService: true });
    create(SERVICE_IDENTITY, orgA.organizationId)();
    expect(db.rows("driveItem")).toHaveLength(1);
  });
});
