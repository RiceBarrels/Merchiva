// Docs policy rules added with Drive, run against the REAL reducers of
// spacetimedb/src/index.ts (extracted by ./server-source.ts):
// - opening a private document to the store needs its owner (or rescues a departed owner's file);
// - a member never has a role on another organization's document;
// - every document write keeps document_reader_index = "docRoleFor ≥ viewer";
// - a manager's invitation cannot grant the Drive power.
// The suites above the last one stub isServiceCaller; the last one runs the real
// one (a regression guard for the null-vs-undefined find bug).

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { newDocumentId } from "@/lib/docs/ids";
import { SERVICE_IDENTITY, createDriveWorld, loadModule, moduleStubs, registerServiceIdentity, type FakeIdentity } from "../drive/fake-db";
import { FakeDocServer, FakeHex, FakeTimestamp, FakeUuid, type FakeMember, type Row } from "./fake-server";
import { loadServerDeclarations } from "./server-source";

class StubSenderError extends Error {}

const typeBuilder: unknown = new Proxy(function typeBuilderStub() {}, {
  get: () => typeBuilder,
  apply: () => typeBuilder,
});

const SERVICE_HEX = "5e".repeat(16);

const REDUCERS = [
  "createDocument",
  "duplicateDocument",
  "setDocumentVisibility",
  "grantDocumentAccess",
  "revokeDocumentAccess",
  "trashDocument",
  "deleteDocumentForever",
] as const;
type ReducerName = (typeof REDUCERS)[number];

const decls = loadServerDeclarations([...REDUCERS, "docRoleFor"], {
  spacetimedb: { reducer: (_params: unknown, fn: unknown) => fn, clientDisconnected: (fn: unknown) => fn },
  t: typeBuilder,
  SenderError: StubSenderError,
  isServiceCaller: (ctx: { sender: FakeHex }) => ctx.sender.hex === SERVICE_HEX,
});
if (!decls) throw new Error("spacetimedb/src/index.ts does not define the docs reducers");

const ORG = "org-doc-policy";
const OTHER_ORG = "org-doc-policy-other";
const VIEW = '{"drive":{"view":true}}';

interface World {
  server: FakeDocServer;
  owner: FakeMember;
  manager: FakeMember;
  author: FakeMember;
  colleague: FakeMember;
  driveViewer: FakeMember;
  call(member: FakeMember | FakeHex, reducer: ReducerName, args: Record<string, unknown>): void;
  readers(documentId: string): string[];
  depart(member: FakeMember): void;
}

function world(): World {
  const server = new FakeDocServer();
  const owner = server.addMember({ organizationId: ORG, role: "owner" });
  const manager = server.addMember({ organizationId: ORG, role: "manager" });
  const author = server.addMember({ organizationId: ORG });
  const colleague = server.addMember({ organizationId: ORG });
  const driveViewer = server.addMember({ organizationId: ORG, permissions: VIEW });
  server.addMember({ organizationId: OTHER_ORG, role: "owner" });
  let micros = BigInt(Date.now()) * 1000n;
  const call: World["call"] = (member, reducer, args) => {
    const fn = decls?.[reducer] as (ctx: unknown, args: Record<string, unknown>) => void;
    const sender = member instanceof FakeHex ? member : member.identity;
    server.transact((db) =>
      fn({ db, sender, connectionId: FakeHex.random(), timestamp: new FakeTimestamp(++micros), newUuidV4: () => new FakeUuid(randomUUID()) }, args),
    );
  };
  const readers = (documentId: string) =>
    server.rows("documentReaderIndex").filter((r) => r.documentId === documentId).map((r) => (r.userId as FakeHex).hex).sort();
  const depart = (member: FakeMember) => {
    const row = server.rows("orgMember").find((m) => String(m.id) === member.memberId) as Row;
    server.transact((db) => (db.orgMember as { id: { update(r: Row): void } }).id.update({ ...row, status: "removed" }));
  };
  return { server, owner, manager, author, colleague, driveViewer, call, readers, depart };
}

function hexes(...members: FakeMember[]): string[] {
  return members.map((m) => m.identity.hex).sort();
}

function createPrivate(w: World, by: FakeMember): string {
  const documentId = newDocumentId();
  w.call(by, "createDocument", { organizationId: ORG, documentId, title: "Notes", visibility: "private" });
  return documentId;
}

describe("setDocumentVisibility: publishing a private document to the store", () => {
  test("an org manager cannot publish an active member's private document", () => {
    const w = world();
    const doc = createPrivate(w, w.author);
    expect(() => w.call(w.manager, "setDocumentVisibility", { documentId: doc, visibility: "org_edit" })).toThrow(
      "[doc.forbidden] Only the owner can share a private file with the whole store",
    );
    expect(() => w.call(w.owner, "setDocumentVisibility", { documentId: doc, visibility: "org_view" })).toThrow("[doc.forbidden]");
    expect(w.server.rows("document")[0].visibility).toBe("private");
  });

  test("its owner can; an admin can rescue a departed owner's document; the service identity can", () => {
    const w = world();
    const mine = createPrivate(w, w.author);
    w.call(w.author, "setDocumentVisibility", { documentId: mine, visibility: "org_edit" });
    expect(w.server.rows("document").find((d) => d.id === mine)?.visibility).toBe("org_edit");

    const orphan = createPrivate(w, w.colleague);
    w.depart(w.colleague);
    w.call(w.manager, "setDocumentVisibility", { documentId: orphan, visibility: "org_view" });
    expect(w.server.rows("document").find((d) => d.id === orphan)?.visibility).toBe("org_view");

    const other = createPrivate(w, w.driveViewer);
    w.call(new FakeHex(SERVICE_HEX), "setDocumentVisibility", { documentId: other, visibility: "org_edit" });
    expect(w.server.rows("document").find((d) => d.id === other)?.visibility).toBe("org_edit");
  });

  test("making a store document private stays a manager's call (only publishing is restricted)", () => {
    const w = world();
    const documentId = newDocumentId();
    w.call(w.author, "createDocument", { organizationId: ORG, documentId, title: "Menu", visibility: "org_edit" });
    w.call(w.manager, "setDocumentVisibility", { documentId, visibility: "private" });
    expect(w.server.rows("document")[0].visibility).toBe("private");
  });
});

describe("docRoleFor across organizations", () => {
  test("a member's role on another organization's document is none, whatever its role or power", () => {
    const docRoleFor = decls.docRoleFor as (ctx: unknown, doc: object, member: object) => string;
    const ctx = { db: { documentAccess: { byDocumentId: { filter: () => [][Symbol.iterator]() } } } };
    const doc = { id: newDocumentId(), organizationId: "org-a", ownerMemberId: "m1", visibility: "org_edit" };
    for (const role of ["owner", "manager", "staff"]) {
      for (const permissions of ["{}", '{"drive":{"edit":true}}']) {
        expect(docRoleFor(ctx, doc, { id: { toString: () => "m1" }, organizationId: "org-b", role, permissions })).toBe("none");
      }
    }
    expect(docRoleFor(ctx, doc, { id: { toString: () => "m1" }, organizationId: "org-a", role: "staff", permissions: "{}" })).toBe("manager");
  });
});

describe("document writes keep document_reader_index current", () => {
  test("create → visibility → grant / revoke → duplicate → delete forever", () => {
    const w = world();
    const doc = createPrivate(w, w.author);
    expect(w.readers(doc)).toEqual(hexes(w.owner, w.manager, w.author, w.driveViewer));

    w.call(w.author, "setDocumentVisibility", { documentId: doc, visibility: "org_view" });
    expect(w.readers(doc)).toEqual(hexes(w.owner, w.manager, w.author, w.colleague, w.driveViewer));
    w.call(w.author, "setDocumentVisibility", { documentId: doc, visibility: "private" });
    expect(w.readers(doc)).not.toContain(w.colleague.identity.hex);

    w.call(w.author, "grantDocumentAccess", { documentId: doc, memberId: w.colleague.memberId, role: "commenter" });
    expect(w.readers(doc)).toContain(w.colleague.identity.hex);
    w.call(w.author, "revokeDocumentAccess", { documentId: doc, memberId: w.colleague.memberId });
    expect(w.readers(doc)).not.toContain(w.colleague.identity.hex);

    const copy = newDocumentId();
    w.call(w.driveViewer, "duplicateDocument", { sourceDocumentId: doc, documentId: copy, title: "Copy" });
    // The copy is the drive viewer's own private doc: its author and colleagues don't read it.
    expect(w.readers(copy)).toEqual(hexes(w.owner, w.manager, w.driveViewer));

    w.call(w.author, "trashDocument", { documentId: doc });
    expect(w.readers(doc)).toEqual(hexes(w.owner, w.manager, w.author, w.driveViewer)); // trash does not change who may read
    w.call(w.author, "deleteDocumentForever", { documentId: doc });
    expect(w.readers(doc)).toEqual([]);
    expect(w.readers(copy)).toHaveLength(3);
  });

  test("members of another organization are never readers", () => {
    const w = world();
    const documentId = newDocumentId();
    w.call(w.author, "createDocument", { organizationId: ORG, documentId, title: "Store", visibility: "org_edit" });
    const orgMembers = w.server.rows("orgMember").filter((m) => m.organizationId === ORG).map((m) => (m.userId as FakeHex).hex).sort();
    expect(w.readers(documentId)).toEqual(orgMembers);
  });
});

describe("inviteToOrg: only owners grant the Drive power", () => {
  const mod = loadModule(["inviteToOrg"]);
  const drive = '{"dashboard":{"view":true},"drive":{"view":true,"edit":true}}';
  const stored = (db: ReturnType<typeof createDriveWorld>["db"], email: string) =>
    JSON.parse(String(db.rows("orgInvitation").find((i) => i.email === email)?.permissions));

  test("a manager's invitation is stored with drive off; everything else is kept", () => {
    const { db, orgA } = createDriveWorld();
    db.run(mod.inviteToOrg, orgA.manager, { organizationId: orgA.organizationId, email: "a@example.test", role: "staff", permissions: drive });
    expect(stored(db, "a@example.test")).toEqual({ dashboard: { view: true }, drive: { view: false, edit: false } });
  });

  test("an owner's (or the service identity's) invitation keeps it", () => {
    const { db, orgA } = createDriveWorld();
    registerServiceIdentity(db);
    db.run(mod.inviteToOrg, orgA.owner, { organizationId: orgA.organizationId, email: "b@example.test", role: "staff", permissions: drive });
    db.run(mod.inviteToOrg, SERVICE_IDENTITY, { organizationId: orgA.organizationId, email: "c@example.test", role: "staff", permissions: drive });
    expect(stored(db, "b@example.test").drive).toEqual({ view: true, edit: true });
    expect(stored(db, "c@example.test").drive).toEqual({ view: true, edit: true });
  });
});

// Regression guard: in SpacetimeDB 2.10 a unique-index `find` returns null on a
// miss, and isServiceCaller once tested `!== undefined`, so EVERY caller counted
// as the service identity and the owner-only publish and the invite strip did
// nothing. These tests run the real isServiceCaller over fake-db, whose `find`
// also returns null.
describe("the real isServiceCaller (only the registered service identity)", () => {
  const stubs = moduleStubs();
  delete stubs.isServiceCaller;
  const real = loadServerDeclarations(["isServiceCaller", "createDocument", "setDocumentVisibility", "inviteToOrg"], stubs);
  if (!real) throw new Error("spacetimedb/src/index.ts does not define isServiceCaller and the docs reducers");
  const drive = '{"drive":{"view":true,"edit":true}}';

  const setup = () => {
    const w = createDriveWorld();
    w.db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "service", registeredAt: w.db.ctx(SERVICE_IDENTITY).timestamp });
    const documentId = newDocumentId();
    w.db.run(real.createDocument, w.orgA.staff, { organizationId: w.orgA.organizationId, documentId, title: "Private", visibility: "private" });
    const isService = (identity: FakeIdentity) => (real.isServiceCaller as (ctx: unknown) => boolean)(w.db.ctx(identity));
    const invite = (email: string) => {
      w.db.run(real.inviteToOrg, w.orgA.manager, { organizationId: w.orgA.organizationId, email, role: "staff", permissions: drive });
      return JSON.parse(String(w.db.rows("orgInvitation").find((i) => i.email === email)?.permissions));
    };
    return { ...w, documentId, isService, invite };
  };

  test("the setup runs: the service identity is recognised, the private doc exists, the invitation is stored", () => {
    const w = setup();
    expect(w.isService(SERVICE_IDENTITY)).toBe(true);
    expect(w.db.find("document", w.documentId)?.visibility).toBe("private");
    expect(w.invite("setup@example.test")).toHaveProperty("drive");
  });

  test("a staff caller is not the service identity", () => {
    const w = setup();
    expect(w.isService(w.orgA.staff.identity)).toBe(false);
  });

  test("an org manager cannot publish a staff member's private document", () => {
    const w = setup();
    expect(() => w.db.run(real.setDocumentVisibility, w.orgA.manager, { documentId: w.documentId, visibility: "org_edit" })).toThrow(
      "[doc.forbidden]",
    );
  });

  test("a manager's invitation is stored with drive off", () => {
    const w = setup();
    expect(w.invite("strip@example.test").drive).toEqual({ view: false, edit: false });
  });
});
