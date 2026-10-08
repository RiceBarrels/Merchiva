// renameDriveDocument (spacetimedb/src/drive/documents.ts): the acting-aware form of
// the Docs renameDocument. Rights are the minimum of the tablet's and the operator's
// docRoleFor (editor needed), the rename is attributed to the effective member, and
// an id from another store is not found. Real module code — the factory plus the real
// `driveDeps` wiring and the real renameDocument of spacetimedb/src/index.ts — over the
// two-org fake database.

import { afterEach, describe, expect, test } from "bun:test";
import { DriveClientError } from "@/lib/drive/errors";
import { renameDriveDocument as renameDriveDocumentAction } from "@/lib/spacetimedb/actions/drive";
import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";
import type { DriveDeps } from "../../../spacetimedb/src/drive/context";
import { defineDriveDocumentReducers } from "../../../spacetimedb/src/drive/documents";
import { DRIVE_OPERATOR_SESSION_TTL_MICROS } from "../../../spacetimedb/src/drive/logic";
import type { DriveSchema } from "../../../spacetimedb/src/drive/types";
import {
  FakeIdentity, FakeTimestamp, FakeUuid, SERVICE_IDENTITY, createDriveWorld, loadModule, moduleStubs, registerServiceIdentity,
  type FakeDb, type FakeMember, type Row,
} from "./fake-db";

const deps = loadModule(["driveDeps"], { Timestamp: FakeTimestamp }).driveDeps as DriveDeps;
const { renameDriveDocument } = defineDriveDocumentReducers(moduleStubs().spacetimedb as unknown as DriveSchema, deps);
const { renameDocument } = loadModule(["renameDocument"]);
const uuid = (): string => crypto.randomUUID();
const EDIT = '{"drive":{"edit":true}}';

function errorOf(fn: () => void): string {
  try { fn(); } catch (error) { return String((error as Error).message); }
  return "(no error)";
}

/** A document row as the Docs createDocument writes it, last touched by its owner at `db.nowMicros`; a fileType adds its document_file row. */
function addDoc(db: FakeDb, owner: FakeMember, visibility: string, o: { fileType?: string; trashed?: boolean; title?: string } = {}): string {
  const id = uuid();
  const now = new FakeTimestamp(db.nowMicros);
  db.insert("document", {
    id, organizationId: owner.organizationId, ownerMemberId: owner.memberId, title: o.title ?? "Doc", excerpt: "",
    icon: undefined, visibility, templateId: undefined, pageSetup: undefined, wordCount: 0, createdAt: now, updatedAt: now,
    lastEditorMemberId: owner.memberId, trashedAt: o.trashed ? now : undefined, trashedByMemberId: o.trashed ? owner.memberId : undefined,
  });
  if (o.fileType) db.insert("documentFile", { documentId: id, organizationId: owner.organizationId, fileType: o.fileType, folderId: "", updatedAt: now });
  return id;
}

function grant(db: FakeDb, documentId: string, member: FakeMember, role: string): void {
  const now = new FakeTimestamp(db.nowMicros);
  db.insert("documentAccess", {
    id: new FakeUuid(), documentId, organizationId: member.organizationId, memberId: member.memberId, role,
    grantedByMemberId: member.memberId, createdAt: now, updatedAt: now,
  });
}

/** The tablet's device_operator_session row, as resolveDeviceOperator / consumeDeviceLogin write it. */
function session(db: FakeDb, tablet: FakeMember, operator: FakeMember, resolvedAtMicros = db.nowMicros): void {
  db.insert("deviceOperatorSession", {
    identity: tablet.identity, organizationId: operator.organizationId, memberId: operator.memberId,
    memberName: "Operator", role: operator.role, resolvedAt: new FakeTimestamp(resolvedAtMicros),
  });
}

function doc(db: FakeDb, id: string): Row {
  const row = db.find("document", id);
  if (!row) throw new Error(`no document ${id}`);
  return row;
}

/** renameDriveDocument as `by`, acting for `acting` (null = nobody). */
function rename(db: FakeDb, by: FakeMember | FakeIdentity, documentId: string, title: string, acting: FakeMember | string | null = null, atMicros?: bigint): () => void {
  const actingMemberId = acting === null ? "" : typeof acting === "string" ? acting : acting.memberId;
  return () => db.run(renameDriveDocument, by, { documentId, title, actingMemberId }, { atMicros });
}

const updatedAt = (row: Row): bigint => (row.updatedAt as FakeTimestamp).microsSinceUnixEpoch;

describe("renameDriveDocument without acting (= renameDocument)", () => {
  test("an editor renames: the title is cleaned, the row touched and attributed to them", () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.manager, "org_edit");
    const before = updatedAt(doc(db, id));
    rename(db, orgA.staff, id.toUpperCase(), "  Q3 \n  budget\t ")();
    const after = doc(db, id);
    expect(after).toMatchObject({ title: "Q3 budget", lastEditorMemberId: orgA.staff.memberId, ownerMemberId: orgA.manager.memberId });
    expect(updatedAt(after)).toBeGreaterThan(before);
  });

  test("the same title (after cleaning) writes nothing; a long title is cut at 200 characters", () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.manager, "org_edit", { title: "Plan" });
    const before = doc(db, id);
    rename(db, orgA.staff, id, "  Plan ")();
    expect(doc(db, id)).toBe(before);
    rename(db, orgA.staff, id, "x".repeat(250))();
    expect(doc(db, id).title).toBe("x".repeat(200));
  });

  test("Sheets and Slides files rename the same way; fileType and folder stay", () => {
    const { db, orgA } = createDriveWorld();
    for (const fileType of ["sheet", "slides"]) {
      const id = addDoc(db, orgA.staff, "private", { fileType });
      const file = db.find("documentFile", id);
      rename(db, orgA.staff, id, "Renamed")();
      expect(doc(db, id)).toMatchObject({ title: "Renamed", visibility: "private" });
      expect(db.find("documentFile", id)).toBe(file); // type and folder untouched
    }
  });

  test("editor is required: viewer, commenter and no access are refused and nothing changes", () => {
    const { db, orgA } = createDriveWorld();
    const view = addDoc(db, orgA.manager, "org_view");
    const managersPrivate = addDoc(db, orgA.manager, "private");
    const commented = addDoc(db, orgA.manager, "private");
    grant(db, commented, orgA.staff, "commenter");
    for (const id of [view, managersPrivate, commented]) {
      expect(errorOf(rename(db, orgA.staff, id, "Mine"))).toContain("[drive.forbidden]");
      expect(doc(db, id).title).toBe("Doc");
    }
  });

  test("an editor grant, the Drive edit power, a manager and the owner may", () => {
    const { db, orgA } = createDriveWorld();
    const granted = addDoc(db, orgA.manager, "private");
    grant(db, granted, orgA.staff, "editor");
    rename(db, orgA.staff, granted, "Granted")();
    const driveEditor = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT });
    const view = addDoc(db, orgA.staff, "org_view");
    rename(db, driveEditor, view, "Drive edit")();
    expect(doc(db, view)).toMatchObject({ title: "Drive edit", lastEditorMemberId: driveEditor.memberId });
    const staffsPrivate = addDoc(db, orgA.staff, "private");
    rename(db, orgA.manager, staffsPrivate, "By manager")();
    rename(db, orgA.owner, staffsPrivate, "By owner")();
    expect(doc(db, staffsPrivate)).toMatchObject({ title: "By owner", lastEditorMemberId: orgA.owner.memberId });
  });

  test("a trashed document: trashed for an editor, forbidden (checked first) for a non-editor", () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.manager, "org_view", { trashed: true });
    expect(errorOf(rename(db, orgA.manager, id, "x"))).toContain("[drive.trashed]");
    expect(errorOf(rename(db, orgA.staff, id, "x"))).toContain("[drive.forbidden]");
    expect(doc(db, id).title).toBe("Doc");
  });

  test("matches the real renameDocument for the same caller and input", () => {
    const { db, orgA } = createDriveWorld();
    const visible = (row: Row) => ({ title: row.title, lastEditorMemberId: row.lastEditorMemberId });
    for (const title of ["  Weekly   report ", " Doc ", "y".repeat(240), ""]) {
      const viaDocs = addDoc(db, orgA.manager, "org_edit");
      const viaDrive = addDoc(db, orgA.manager, "org_edit");
      const created = [updatedAt(doc(db, viaDocs)), updatedAt(doc(db, viaDrive))];
      db.run(renameDocument, orgA.staff, { documentId: viaDocs, title });
      rename(db, orgA.staff, viaDrive, title)();
      const [a, b] = [doc(db, viaDocs), doc(db, viaDrive)];
      expect(visible(b)).toEqual(visible(a));
      // Touched exactly when renameDocument touches (" Doc " cleans to the current title: neither writes).
      expect(updatedAt(b) > created[1]).toBe(updatedAt(a) > created[0]);
      expect(updatedAt(b) > created[1]).toBe(title !== " Doc ");
    }
  });
});

describe("tenant boundary", () => {
  test("another store's document, a missing id and a non-member all read as not found", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const inB = addDoc(db, orgB.staff, "org_edit");
    for (const who of [orgA.owner, orgA.manager, orgA.staff]) {
      expect(errorOf(rename(db, who, inB, "x"))).toContain("[drive.not_found]");
    }
    expect(errorOf(rename(db, FakeIdentity.random(), inB, "x"))).toContain("[drive.not_found]");
    expect(errorOf(rename(db, orgA.owner, uuid(), "x"))).toContain("[drive.not_found]");
    expect(errorOf(rename(db, orgA.owner, "", "x"))).toContain("[drive.not_found]");
    // Acting for a member of the document's own store does not open the door for an outsider.
    expect(errorOf(rename(db, orgA.owner, inB, "x", orgB.staff))).toContain("[drive.not_found]");
    expect(doc(db, inB)).toMatchObject({ title: "Doc", lastEditorMemberId: orgB.staff.memberId });
  });

  test("the same person in both stores renames in B only with B's rights", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const twin = db.addMember({ organizationId: orgB.organizationId, identity: orgA.owner.identity });
    const bPrivate = addDoc(db, orgB.manager, "private");
    expect(errorOf(rename(db, orgA.owner, bPrivate, "x"))).toContain("[drive.forbidden]");
    const bShared = addDoc(db, orgB.manager, "org_edit");
    rename(db, orgA.owner, bShared, "As B staff")();
    expect(doc(db, bShared).lastEditorMemberId).toBe(twin.memberId);
  });
});

describe("owner-account tablet acting for a staff operator (no session needed)", () => {
  test("the rename is attributed to the operator", () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.manager, "org_edit");
    rename(db, orgA.owner, id, "By operator", orgA.staff)();
    expect(doc(db, id)).toMatchObject({ title: "By operator", lastEditorMemberId: orgA.staff.memberId });
  });

  test("the owner's reach does not leak to the operator", () => {
    const { db, orgA } = createDriveWorld();
    const managersPrivate = addDoc(db, orgA.manager, "private");
    const view = addDoc(db, orgA.manager, "org_view");
    for (const id of [managersPrivate, view]) {
      expect(errorOf(rename(db, orgA.owner, id, "x", orgA.staff))).toContain("[drive.forbidden]");
    }
    rename(db, orgA.owner, managersPrivate, "Owner alone")();
    expect(doc(db, managersPrivate).title).toBe("Owner alone");
    expect(doc(db, view).title).toBe("Doc");
  });

  test("an operator's own grant or Drive edit power counts (the owner tablet has manager everywhere)", () => {
    const { db, orgA } = createDriveWorld();
    const granted = addDoc(db, orgA.manager, "private");
    grant(db, granted, orgA.staff, "editor");
    rename(db, orgA.owner, granted, "Granted", orgA.staff)();
    const driveEditor = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT });
    const view = addDoc(db, orgA.manager, "org_view");
    rename(db, orgA.owner, view, "Drive edit", driveEditor)();
    expect(doc(db, granted).lastEditorMemberId).toBe(orgA.staff.memberId);
    expect(doc(db, view).lastEditorMemberId).toBe(driveEditor.memberId);
  });
});

describe("staff-account tablet with a session for a manager operator", () => {
  test("a Store doc both may edit: renamed and attributed to the operator", () => {
    const { db, orgA } = createDriveWorld();
    session(db, orgA.staff, orgA.manager);
    const id = addDoc(db, orgA.owner, "org_edit");
    rename(db, orgA.staff, id, "By manager", orgA.manager)();
    expect(doc(db, id)).toMatchObject({ title: "By manager", lastEditorMemberId: orgA.manager.memberId });
  });

  test("no escalation: the operator's private doc → device_scope; a view-only Store doc → forbidden", () => {
    const { db, orgA } = createDriveWorld();
    session(db, orgA.staff, orgA.manager);
    const managersPrivate = addDoc(db, orgA.manager, "private");
    const colleaguesView = addDoc(db, orgA.owner, "org_view");
    expect(errorOf(rename(db, orgA.staff, managersPrivate, "x", orgA.manager))).toContain("[drive.device_scope]");
    expect(errorOf(rename(db, orgA.staff, colleaguesView, "x", orgA.manager))).toContain("[drive.forbidden]");
    expect([doc(db, managersPrivate).title, doc(db, colleaguesView).title]).toEqual(["Doc", "Doc"]);
  });

  test("the tablet account's own private doc stays out of the operator's reach", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    session(db, orgA.staff, colleague);
    const tabletsPrivate = addDoc(db, orgA.staff, "private");
    expect(errorOf(rename(db, orgA.staff, tabletsPrivate, "x", colleague))).toContain("[drive.forbidden]");
  });
});

describe("[drive.operator]", () => {
  test("no session or one for someone else is refused; exactly 12 h works, a moment later does not", () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.owner, "org_edit");
    expect(errorOf(rename(db, orgA.staff, id, "x", orgA.manager))).toContain("[drive.operator]");
    const start = db.nowMicros;
    session(db, orgA.staff, orgA.manager, start);
    const other = db.addMember({ organizationId: orgA.organizationId, role: "manager" });
    expect(errorOf(rename(db, orgA.staff, id, "x", other))).toContain("[drive.operator]");
    expect(doc(db, id).title).toBe("Doc");
    rename(db, orgA.staff, id, "On time", orgA.manager, start + DRIVE_OPERATOR_SESSION_TTL_MICROS)();
    expect(doc(db, id).title).toBe("On time");
    expect(errorOf(rename(db, orgA.staff, id, "Late", orgA.manager, start + DRIVE_OPERATOR_SESSION_TTL_MICROS + 1n)))
      .toContain("[drive.operator]");
    expect(doc(db, id).title).toBe("On time");
  });

  test("an inactive operator, one from another store, or an unknown id is refused even for an owner tablet", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const id = addDoc(db, orgA.manager, "org_edit");
    const disabled = db.addMember({ organizationId: orgA.organizationId, status: "disabled" });
    for (const acting of [disabled, orgB.staff, uuid()]) {
      expect(errorOf(rename(db, orgA.owner, id, "x", acting))).toContain("[drive.operator]");
    }
    expect(doc(db, id).title).toBe("Doc");
  });

  test("acting as yourself (any case) is not acting", () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.manager, "org_edit");
    rename(db, orgA.staff, id, "Self", orgA.staff.memberId.toUpperCase())();
    expect(doc(db, id).lastEditorMemberId).toBe(orgA.staff.memberId);
  });
});

describe("the service identity", () => {
  test("acts for an active member without a session; unregistered, it is an outsider", () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.staff, "private");
    expect(errorOf(rename(db, SERVICE_IDENTITY, id, "x", orgA.staff))).toContain("[drive.not_found]");
    registerServiceIdentity(db);
    rename(db, SERVICE_IDENTITY, id, "By support", orgA.staff)();
    expect(doc(db, id)).toMatchObject({ title: "By support", lastEditorMemberId: orgA.staff.memberId });
  });
});

describe("the renameDriveDocument write wrapper (lib/spacetimedb/actions/drive.ts)", () => {
  afterEach(() => clearConnection());

  /** The app connection as `caller`: each renameDriveDocument call runs the module's reducer in `db`. */
  function connectAs(db: FakeDb, caller: FakeMember): Array<Record<string, unknown>> {
    const calls: Array<Record<string, unknown>> = [];
    const reducer = async (args: Record<string, unknown>) => {
      calls.push(args);
      db.run(renameDriveDocument, caller, args);
    };
    setConnection({ reducers: { renameDriveDocument: reducer } } as never);
    setActiveOrgId(caller.organizationId);
    return calls;
  }

  test("an owner tablet renames for its operator: lowercase id, raw title, acting member passed through", async () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.manager, "org_edit");
    const calls = connectAs(db, orgA.owner);
    await renameDriveDocumentAction(id.toUpperCase(), "  New   name ", { actingMemberId: ` ${orgA.staff.memberId} ` });
    expect(calls).toEqual([{ documentId: id, title: "  New   name ", actingMemberId: orgA.staff.memberId }]);
    expect(doc(db, id)).toMatchObject({ title: "New name", lastEditorMemberId: orgA.staff.memberId });
    await renameDriveDocumentAction(id, "Own name");
    expect(calls[1]).toEqual({ documentId: id, title: "Own name", actingMemberId: "" });
    expect(doc(db, id).lastEditorMemberId).toBe(orgA.owner.memberId);
  });

  test("the module's refusal reaches the caller; nothing is written", async () => {
    const { db, orgA } = createDriveWorld();
    const id = addDoc(db, orgA.manager, "private");
    connectAs(db, orgA.owner);
    const error = await renameDriveDocumentAction(id, "x", { actingMemberId: orgA.staff.memberId }).then(() => null, (e: unknown) => e);
    expect(String((error as Error).message)).toContain("[drive.forbidden]");
    expect(doc(db, id).title).toBe("Doc");
  });

  test("no connection → not_connected; bindings without the reducer → not_published", async () => {
    const code = (p: Promise<void>) => p.then(() => "(resolved)", (e: unknown) => (e instanceof DriveClientError ? e.code : String(e)));
    expect(await code(renameDriveDocumentAction(uuid(), "x"))).toBe("not_connected");
    setConnection({ reducers: {} } as never);
    expect(await code(renameDriveDocumentAction(uuid(), "x"))).toBe("not_published");
  });
});
