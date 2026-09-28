// drive_admin_index + document_reader_index maintenance (spacetimedb/src/drive/access-index.ts),
// run against the REAL docRoleFor / docMemberGate and the REAL member-write reducers of
// spacetimedb/src/index.ts, over the two-org fake database.

import { describe, expect, test } from "bun:test";
import {
  driveAdminScopeOf,
  dropDocumentReaders,
  dropDriveAdminIndex,
  dropMemberDocReaders,
  rekeyAccessIdentity,
  syncDocumentReaders,
  syncDriveAdminIndex,
  syncMemberDocReaders,
  type AccessMemberRow,
  type GateFor,
  type RoleFor,
} from "../../../spacetimedb/src/drive/access-index";
import type { DriveCtx } from "../../../spacetimedb/src/drive/types";
import {
  FakeIdentity,
  FakeTimestamp,
  FakeUuid,
  SERVICE_IDENTITY,
  registerServiceIdentity,
  createDriveWorld,
  loadModule,
  type FakeDb,
  type FakeMember,
  type Row,
} from "./fake-db";

const REDUCERS = [
  "createOrg", "acceptInvitation", "updateMemberPermissions", "setMemberStatus", "leaveOrg",
  "migrateOwnerPermissionsV1", "loginWithPassword",
] as const;
const mod = loadModule(["docRoleFor", "docMemberGate", "reassignMembersRole", ...REDUCERS]);
const roleFor = mod.docRoleFor as RoleFor;
const gate = mod.docMemberGate as GateFor;

const VIEW = '{"drive":{"view":true}}';
const EDIT = '{"drive":{"edit":true}}';
const NO_DOCS = '{"dashboard":{"view":false},"drive":{"view":true}}';

/** The module functions take the typed reducer context; the fake one is structurally the same at runtime. */
function asCtx(db: FakeDb, sender: FakeIdentity = SERVICE_IDENTITY): DriveCtx {
  return db.ctx(sender) as unknown as DriveCtx;
}
function rowOf(db: FakeDb, m: FakeMember): AccessMemberRow {
  return db.member(m) as unknown as AccessMemberRow;
}
/** Runs a module function in one transaction, like a reducer. */
function write(db: FakeDb, body: (ctx: DriveCtx) => void): void {
  const ctx = asCtx(db);
  db.transact(() => body(ctx));
}
function patchMember(db: FakeDb, m: FakeMember, patch: Record<string, unknown>): void {
  db.patch("orgMember", m.memberId, patch);
}

function adminHexes(db: FakeDb): string[] {
  return db.rows("driveAdminIndex").map((r) => (r.userId as FakeIdentity).hex).sort();
}
function readers(db: FakeDb, documentId: string): string[] {
  return db.rows("documentReaderIndex").filter((r) => r.documentId === documentId).map((r) => (r.userId as FakeIdentity).hex).sort();
}
function hexes(...members: FakeMember[]): string[] {
  return [...new Set(members.map((m) => m.identity.hex))].sort();
}
function addDoc(db: FakeDb, owner: FakeMember, visibility: string): string {
  const id = crypto.randomUUID();
  db.insert("document", {
    id, organizationId: owner.organizationId, ownerMemberId: owner.memberId, title: "Doc", excerpt: "", icon: undefined,
    visibility, templateId: undefined, pageSetup: undefined, wordCount: 0, createdAt: new FakeTimestamp(db.nowMicros),
    updatedAt: new FakeTimestamp(db.nowMicros), lastEditorMemberId: owner.memberId, trashedAt: undefined,
    trashedByMemberId: undefined,
  });
  return id;
}
function docRow(db: FakeDb, id: string): { id: string; organizationId: string; ownerMemberId: string; visibility: string } {
  return db.find("document", id) as unknown as { id: string; organizationId: string; ownerMemberId: string; visibility: string };
}

describe("syncDriveAdminIndex", () => {
  test("owners, managers and gated drive.view / drive.edit members get a row; nobody else", () => {
    const { db, orgA } = createDriveWorld();
    const viewer = db.addMember({ organizationId: orgA.organizationId, permissions: VIEW });
    const editor = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT });
    const gatedOut = db.addMember({ organizationId: orgA.organizationId, permissions: NO_DOCS });
    const disabled = db.addMember({ organizationId: orgA.organizationId, permissions: EDIT, status: "disabled" });
    write(db, (ctx) => {
      for (const m of [orgA.owner, orgA.manager, orgA.staff, viewer, editor, gatedOut, disabled]) syncDriveAdminIndex(ctx, rowOf(db, m), gate);
    });
    expect(adminHexes(db)).toEqual(hexes(orgA.owner, orgA.manager, viewer, editor));
  });

  test("the opaque scope is created once, per org, and is all a row carries", () => {
    const { db, orgA, orgB } = createDriveWorld();
    write(db, (ctx) => syncDriveAdminIndex(ctx, rowOf(db, orgA.staff), gate));
    expect(db.rows("driveOrgState")).toHaveLength(0); // nobody holds the power yet: no scope, no write
    write(db, (ctx) => {
      syncDriveAdminIndex(ctx, rowOf(db, orgA.owner), gate);
      syncDriveAdminIndex(ctx, rowOf(db, orgA.manager), gate);
      syncDriveAdminIndex(ctx, rowOf(db, orgB.owner), gate);
    });
    const scopeA = db.find("driveOrgState", orgA.organizationId)?.adminScope as string;
    const scopeB = db.find("driveOrgState", orgB.organizationId)?.adminScope as string;
    expect(scopeA).toMatch(/^[0-9a-f-]{36}$/);
    expect(scopeB).not.toBe(scopeA);
    write(db, (ctx) => expect(driveAdminScopeOf(ctx, orgA.organizationId)).toBe(scopeA));
    const ownerRow = db.find("driveAdminIndex", `${scopeA}:${orgA.owner.identity.hex}`);
    expect(Object.keys(ownerRow ?? {}).sort()).toEqual(["adminScope", "id", "userId"]);
    const before = db.rows("driveAdminIndex");
    write(db, (ctx) => syncDriveAdminIndex(ctx, rowOf(db, orgA.owner), gate)); // idempotent
    expect(db.rows("driveAdminIndex")).toEqual(before);
  });

  test("losing the power, the gate or the membership drops the row", () => {
    const { db, orgA } = createDriveWorld();
    const viewer = db.addMember({ organizationId: orgA.organizationId, permissions: VIEW });
    write(db, (ctx) => syncDriveAdminIndex(ctx, rowOf(db, viewer), gate));
    expect(adminHexes(db)).toEqual(hexes(viewer));
    patchMember(db, viewer, { permissions: NO_DOCS });
    write(db, (ctx) => syncDriveAdminIndex(ctx, rowOf(db, viewer), gate));
    expect(adminHexes(db)).toEqual([]);
    patchMember(db, viewer, { permissions: VIEW });
    write(db, (ctx) => syncDriveAdminIndex(ctx, rowOf(db, viewer), gate));
    write(db, (ctx) => dropDriveAdminIndex(ctx, rowOf(db, viewer), gate));
    expect(adminHexes(db)).toEqual([]);
  });

  test("a second, removed membership row of the same identity never drops the active row's access", () => {
    const { db, orgA } = createDriveWorld();
    const old = db.addMember({ organizationId: orgA.organizationId, permissions: "{}", status: "removed" });
    const rejoined = db.addMember({ organizationId: orgA.organizationId, permissions: VIEW, identity: old.identity });
    write(db, (ctx) => syncDriveAdminIndex(ctx, rowOf(db, rejoined), gate));
    write(db, (ctx) => syncDriveAdminIndex(ctx, rowOf(db, old), gate));
    write(db, (ctx) => dropDriveAdminIndex(ctx, rowOf(db, old), gate));
    expect(adminHexes(db)).toEqual(hexes(rejoined));
  });
});

describe("document readers", () => {
  test("private: its owner, org owners and managers, drive.view/edit members — not colleagues, not other orgs", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const viewer = db.addMember({ organizationId: orgA.organizationId, permissions: VIEW });
    const gatedOut = db.addMember({ organizationId: orgA.organizationId, permissions: NO_DOCS });
    // The same person owns org B and is plain staff in org A: org B's power never leaks into A.
    const twoOrgs = db.addMember({ organizationId: orgA.organizationId, identity: orgB.owner.identity });
    const doc = addDoc(db, orgA.staff, "private");
    write(db, (ctx) => syncDocumentReaders(ctx, docRow(db, doc), roleFor));
    expect(readers(db, doc)).toEqual(hexes(orgA.staff, orgA.owner, orgA.manager, viewer));
    expect(readers(db, doc)).not.toContain(gatedOut.identity.hex);
    expect(readers(db, doc)).not.toContain(twoOrgs.identity.hex);
    expect(readers(db, doc)).not.toContain(orgB.manager.identity.hex);
  });

  test("store documents reach every gated active member; grants add readers; re-syncing removes stale rows", () => {
    const { db, orgA } = createDriveWorld();
    const colleague = db.addMember({ organizationId: orgA.organizationId });
    const disabled = db.addMember({ organizationId: orgA.organizationId, status: "disabled" });
    const doc = addDoc(db, orgA.staff, "org_view");
    write(db, (ctx) => syncDocumentReaders(ctx, docRow(db, doc), roleFor));
    expect(readers(db, doc)).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff, colleague));
    expect(readers(db, doc)).not.toContain(disabled.identity.hex);

    db.patch("document", doc, { visibility: "private" });
    db.insert("documentAccess", {
      id: new FakeUuid(), documentId: doc, organizationId: orgA.organizationId, memberId: colleague.memberId, role: "viewer",
      grantedByMemberId: orgA.staff.memberId, createdAt: new FakeTimestamp(db.nowMicros), updatedAt: new FakeTimestamp(db.nowMicros),
    });
    write(db, (ctx) => syncDocumentReaders(ctx, docRow(db, doc), roleFor));
    expect(readers(db, doc)).toEqual(hexes(orgA.owner, orgA.manager, orgA.staff, colleague));
    write(db, (ctx) => dropDocumentReaders(ctx, doc));
    expect(readers(db, doc)).toEqual([]);
  });

  test("syncMemberDocReaders follows one member's power over its own org only", () => {
    const { db, orgA, orgB } = createDriveWorld();
    const member = db.addMember({ organizationId: orgA.organizationId });
    const inB = db.addMember({ organizationId: orgB.organizationId, identity: member.identity });
    const privA = addDoc(db, orgA.staff, "private");
    const storeA = addDoc(db, orgA.staff, "org_edit");
    const privB = addDoc(db, orgB.staff, "org_edit");
    write(db, (ctx) => {
      for (const id of [privA, storeA, privB]) syncDocumentReaders(ctx, docRow(db, id), roleFor);
    });
    expect(readers(db, privA)).not.toContain(member.identity.hex);
    expect(readers(db, storeA)).toContain(member.identity.hex);
    expect(readers(db, privB)).toContain(inB.identity.hex);

    patchMember(db, member, { permissions: VIEW });
    write(db, (ctx) => syncMemberDocReaders(ctx, rowOf(db, member), roleFor));
    expect(readers(db, privA)).toContain(member.identity.hex);

    patchMember(db, member, { status: "disabled" });
    write(db, (ctx) => syncMemberDocReaders(ctx, rowOf(db, member), roleFor));
    expect(readers(db, privA)).not.toContain(member.identity.hex);
    expect(readers(db, storeA)).not.toContain(member.identity.hex);
    expect(readers(db, privB)).toContain(member.identity.hex); // org B's rows are untouched

    write(db, (ctx) => dropMemberDocReaders(ctx, rowOf(db, inB), roleFor));
    expect(readers(db, privB)).not.toContain(member.identity.hex);
  });
});

describe("rekeyAccessIdentity", () => {
  test("moves admin rows, reader rows, pending uploads and notice acks to the new identity", () => {
    const { db, orgA } = createDriveWorld();
    const doc = addDoc(db, orgA.staff, "org_edit");
    write(db, (ctx) => {
      syncDriveAdminIndex(ctx, rowOf(db, orgA.manager), gate);
      syncDocumentReaders(ctx, docRow(db, doc), roleFor);
    });
    const old = orgA.manager.identity;
    const next = FakeIdentity.random();
    db.insert("driveItem", { id: crypto.randomUUID(), organizationId: orgA.organizationId, uploaderIdentity: old, status: "pending" });
    db.insert("driveNoticeAck", { id: `${orgA.manager.memberId}:n:manager`, organizationId: orgA.organizationId, memberId: orgA.manager.memberId, userId: old });
    // The new identity already reads the doc (e.g. a second membership): no duplicate row.
    db.insert("documentReaderIndex", { id: `${doc}:${next.hex}`, documentId: doc, userId: next });

    write(db, (ctx) => rekeyAccessIdentity(ctx, old as never, next as never));
    const all = [...db.rows("driveAdminIndex"), ...db.rows("documentReaderIndex"), ...db.rows("driveNoticeAck")];
    expect(all.some((r) => (r.userId as FakeIdentity).hex === old.hex)).toBe(false);
    expect(adminHexes(db)).toContain(next.hex);
    expect(readers(db, doc).filter((h) => h === next.hex)).toHaveLength(1);
    expect((db.rows("driveItem")[0].uploaderIdentity as FakeIdentity).hex).toBe(next.hex);
    expect(db.rows("driveAdminIndex").every((r) => r.id === `${r.adminScope}:${(r.userId as FakeIdentity).hex}`)).toBe(true);
  });
});

// ── Every member write site in index.ts keeps both indexes current ──────────

describe("index.ts member-write call sites", () => {
  function inviteAndAccept(db: FakeDb, organizationId: string, permissions: string, email = "new@example.test"): FakeIdentity {
    const identity = FakeIdentity.random();
    db.insert("user", { identity, email, displayName: "New", passwordHash: undefined });
    db.insert("orgInvitation", {
      id: new FakeUuid(), organizationId, email, role: "staff", permissions, token: "tok-" + email,
      expiresAt: new FakeTimestamp(db.nowMicros + 10_000_000_000n), acceptedAt: undefined, createdAt: new FakeTimestamp(db.nowMicros),
    });
    db.run(mod.acceptInvitation, identity, { token: "tok-" + email });
    return identity;
  }

  test("createOrg: the owner is a Drive admin of the new org from the start", () => {
    const { db } = createDriveWorld();
    const founder = FakeIdentity.random();
    db.insert("user", { identity: founder, email: "f@example.test", displayName: "F", passwordHash: undefined });
    db.run(mod.createOrg, founder, { name: "New shop" });
    const org = db.rows("organization").find((o) => o.name === "New shop");
    const scope = db.find("driveOrgState", org?.orgIdText)?.adminScope;
    expect(db.find("driveAdminIndex", `${scope}:${founder.hex}`)).not.toBeNull();
  });

  test("acceptInvitation / updateMemberPermissions / setMemberStatus / leaveOrg", () => {
    const { db, orgA } = createDriveWorld();
    const privateDoc = addDoc(db, orgA.staff, "private");
    const storeDoc = addDoc(db, orgA.staff, "org_edit");
    write(db, (ctx) => {
      syncDocumentReaders(ctx, docRow(db, privateDoc), roleFor);
      syncDocumentReaders(ctx, docRow(db, storeDoc), roleFor);
    });

    const joined = inviteAndAccept(db, orgA.organizationId, VIEW);
    expect(adminHexes(db)).toContain(joined.hex);
    expect(readers(db, privateDoc)).toContain(joined.hex);

    const plain = inviteAndAccept(db, orgA.organizationId, "{}", "plain@example.test");
    expect(adminHexes(db)).not.toContain(plain.hex);
    expect(readers(db, privateDoc)).not.toContain(plain.hex);
    expect(readers(db, storeDoc)).toContain(plain.hex);
    const plainMember = db.rows("orgMember").find((m) => (m.userId as FakeIdentity).hex === plain.hex) as Row;
    const plainId = String(plainMember.id);

    db.run(mod.updateMemberPermissions, orgA.owner, { organizationId: orgA.organizationId, memberId: plainId, role: "staff", permissions: EDIT });
    expect(adminHexes(db)).toContain(plain.hex);
    expect(readers(db, privateDoc)).toContain(plain.hex);

    db.run(mod.setMemberStatus, orgA.owner, { organizationId: orgA.organizationId, memberId: plainId, status: "disabled" });
    expect(adminHexes(db)).not.toContain(plain.hex);
    expect(readers(db, storeDoc)).not.toContain(plain.hex);
    db.run(mod.setMemberStatus, orgA.owner, { organizationId: orgA.organizationId, memberId: plainId, status: "active" });
    expect(readers(db, privateDoc)).toContain(plain.hex);

    db.run(mod.leaveOrg, plain, { organizationId: orgA.organizationId });
    expect(adminHexes(db)).not.toContain(plain.hex);
    expect(readers(db, storeDoc)).not.toContain(plain.hex);
    expect(readers(db, privateDoc)).not.toContain(plain.hex);
  });

  test("reassignMembersRole and migrateOwnerPermissionsV1 re-sync the rewritten rows", () => {
    const { db, orgA } = createDriveWorld();
    const cashier = db.addMember({ organizationId: orgA.organizationId, role: "cashier", permissions: VIEW });
    write(db, (ctx) => (mod.reassignMembersRole as (...a: unknown[]) => void)(ctx, orgA.organizationId, "role-1", "cashier", "clerk"));
    expect(db.member(cashier).role).toBe("clerk");
    expect(adminHexes(db)).toContain(cashier.identity.hex);

    registerServiceIdentity(db);
    db.run(mod.migrateOwnerPermissionsV1, SERVICE_IDENTITY, { dryRun: false });
    expect(JSON.parse(String(db.member(orgA.owner).permissions)).drive).toEqual({ view: true, edit: true });
    expect(adminHexes(db)).toContain(orgA.owner.identity.hex);
  });

  test("loginWithPassword re-keys the indexes to the new identity", () => {
    const { db, orgA } = createDriveWorld();
    const doc = addDoc(db, orgA.staff, "private");
    write(db, (ctx) => {
      syncDriveAdminIndex(ctx, rowOf(db, orgA.manager), gate);
      syncDocumentReaders(ctx, docRow(db, doc), roleFor);
    });
    const old = orgA.manager.identity;
    db.insert("user", { identity: old, email: "m@example.test", displayName: "M", passwordHash: undefined });
    db.insert("userSecret", { identity: old, passwordHash: "h", updatedAt: new FakeTimestamp(db.nowMicros) });
    const fresh = FakeIdentity.random();
    db.run(mod.loginWithPassword, fresh, { email: "m@example.test", passwordHash: "h" });
    expect(adminHexes(db)).toContain(fresh.hex);
    expect(adminHexes(db)).not.toContain(old.hex);
    expect(readers(db, doc)).toContain(fresh.hex);
    expect(readers(db, doc)).not.toContain(old.hex);
  });
});
