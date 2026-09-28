// Sheet edit-lease reducers (sheets.md §3.3–§3.4, §3.8 H2–H4, H7): the real
// drive/sheets.ts factory with index.ts's real `sheetDeps` and Docs reducers, over the
// two-org fake database. The QR log-in (U7) is in device-login.test.ts.

import { describe, expect, test } from "bun:test";
import { DRIVE_OPERATOR_SESSION_TTL_MICROS } from "../../../../spacetimedb/src/drive/logic";
import {
  SHEET_LEASE_DETACHED_GRACE_MICROS, SHEET_LEASE_REQUEST_GRACE_MICROS,
} from "../../../../spacetimedb/src/drive/sheet-logic";
import { FakeTimestamp, type FakeDb, type FakeMember } from "../../drive/fake-db";
import {
  MODULE, R, acquire, asClient, createSheetWorld, errorOf, lease, newSheet, operatorSession, push, sheetClient,
  type SheetClient,
} from "../helpers/sheet-server-harness";

const S = 1_000_000n;

function release(db: FakeDb, c: SheetClient, documentId: string): void {
  asClient(db, R.releaseSheetLease, c, { documentId });
}
function heartbeat(db: FakeDb, c: SheetClient, documentId: string, epoch?: bigint): void {
  asClient(db, R.heartbeatSheetLease, c, { documentId, leaseEpoch: epoch ?? lease(db, documentId).epoch });
}
function disconnect(db: FakeDb, c: SheetClient): void {
  db.run(MODULE.onDisconnect, c.member, {}, { connectionId: c.connection });
}

describe("acquire, rebind, grant", () => {
  test("the first acquire creates the row; names come from the server, never the client", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.colleague);
    acquire(db, a, id);
    expect(lease(db, id)).toMatchObject({
      documentId: id, organizationId: orgA.organizationId, epoch: 1n, holderMemberId: orgA.colleague.memberId,
      holderActorMemberId: orgA.colleague.memberId, holderSessionId: a.sessionId, holderConnectionId: a.connection.hex,
      holderName: "Org A colleague", lastSeq: 0n, requestedByMemberId: "", requestedBySessionId: "",
    });
    // A client-supplied name is not even an argument.
    asClient(db, R.acquireSheetLease, a, { documentId: id, holderName: "Mallory" });
    expect(lease(db, id).holderName).toBe("Org A colleague");
  });

  test("the same session on a new connection re-binds: epoch and lastSeq stay", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.staff);
    acquire(db, a, id);
    push(db, a, id);
    const before = lease(db, id);
    a.connection = sheetClient(orgA.staff).connection;
    acquire(db, a, id);
    expect(lease(db, id)).toMatchObject({ epoch: before.epoch, lastSeq: 1n, holderConnectionId: a.connection.hex });
  });

  test("a grant after a release bumps epoch and resets lastSeq; the old session is fenced", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.staff);
    const b = sheetClient(orgA.colleague);
    acquire(db, a, id);
    push(db, a, id);
    release(db, a, id);
    expect(lease(db, id)).toMatchObject({ holderMemberId: "", holderSessionId: "", holderConnectionId: "", epoch: 1n, lastSeq: 1n });
    acquire(db, b, id);
    expect(lease(db, id)).toMatchObject({ epoch: 2n, lastSeq: 0n, holderMemberId: orgA.colleague.memberId });
    expect(errorOf(() => push(db, a, id, { epoch: 1n, seq: 2n }))).toContain("[sheet.lease]");
  });

  test("the same person on another tab takes over at once; a colleague asks instead", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const laptop = sheetClient(orgA.staff);
    const phone = sheetClient(orgA.staff);
    acquire(db, laptop, id);
    acquire(db, phone, id);
    expect(lease(db, id)).toMatchObject({ epoch: 2n, holderSessionId: phone.sessionId });
    expect(errorOf(() => heartbeat(db, laptop, id, 1n))).toContain("[sheet.lease]");
    const colleague = sheetClient(orgA.colleague);
    acquire(db, colleague, id);
    expect(lease(db, id)).toMatchObject({ epoch: 2n, holderSessionId: phone.sessionId, requestedBySessionId: colleague.sessionId,
      requestedByMemberId: orgA.colleague.memberId, requestedByName: "Org A colleague", requestedByConnectionId: colleague.connection.hex });
  });

  test("a takeover by the same person keeps a third party's live request", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    acquire(db, sheetClient(orgA.staff), id);
    const colleague = sheetClient(orgA.colleague);
    acquire(db, colleague, id);
    const asked = lease(db, id).requestedAt;
    const phone = sheetClient(orgA.staff);
    acquire(db, phone, id);
    expect(lease(db, id)).toMatchObject({
      epoch: 2n, holderSessionId: phone.sessionId, requestedBySessionId: colleague.sessionId,
      requestedByMemberId: orgA.colleague.memberId, requestedByConnectionId: colleague.connection.hex, requestedAt: asked,
    });
  });

  test("queued writes nothing: a live request is never overwritten", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    acquire(db, sheetClient(orgA.staff), id);
    const b = sheetClient(orgA.colleague);
    acquire(db, b, id);
    const withRequest = lease(db, id);
    acquire(db, sheetClient(orgA.manager), id);
    expect(lease(db, id)).toEqual(withRequest);
  });

  test("a request becomes a grant after 30 s without holder edits, not while the holder types", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.staff);
    const b = sheetClient(orgA.colleague);
    acquire(db, a, id);
    const asked = db.nowMicros + S;
    acquire(db, b, id, { atMicros: asked });
    heartbeat(db, a, id);
    acquire(db, b, id, { atMicros: asked + SHEET_LEASE_REQUEST_GRACE_MICROS - S });
    expect(lease(db, id).holderSessionId).toBe(a.sessionId);
    push(db, a, id, { atMicros: asked + 2n * S });
    acquire(db, b, id, { atMicros: asked + SHEET_LEASE_REQUEST_GRACE_MICROS + S });
    expect(lease(db, id).holderSessionId).toBe(a.sessionId); // edited after the request: still a request
    expect(lease(db, id).requestedAt).toEqual(new FakeTimestamp(asked)); // refreshed, grace clock kept

    // A sheet whose holder is still connected but does not edit: the request wins after the grace.
    const idle = newSheet(db, orgA.staff);
    acquire(db, sheetClient(orgA.staff), idle);
    const t0 = db.nowMicros + S;
    const b2 = sheetClient(orgA.colleague);
    acquire(db, b2, idle, { atMicros: t0 });
    acquire(db, b2, idle, { atMicros: t0 + SHEET_LEASE_REQUEST_GRACE_MICROS });
    expect(lease(db, idle)).toMatchObject({ epoch: 2n, holderSessionId: b2.sessionId, requestedBySessionId: "" });
  });

  test("a live connection and a well-formed session id are required", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    expect(errorOf(() => db.run(R.acquireSheetLease, orgA.staff, { documentId: id, sessionId: "session-0001", actingMemberId: "" }, { connectionId: null })))
      .toContain("[sheet.lease]");
    expect(errorOf(() => asClient(db, R.acquireSheetLease, sheetClient(orgA.staff, { sessionId: "bad id" }), { documentId: id })))
      .toContain("[sheet.invalid]");
  });

  test("only sheets, only editors, only the sheet's own organization", () => {
    const { db, orgA, orgB } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const docId = crypto.randomUUID();
    db.run(R.createDriveDocument, orgA.staff, {
      organizationId: orgA.organizationId, documentId: docId, fileType: "doc", space: "store", folderId: "", ownerMemberId: "",
      visibility: "", title: "Notes", templateId: "", initialState: undefined, html: undefined, plainText: undefined, wordCount: undefined, actingMemberId: "",
    });
    expect(errorOf(() => acquire(db, sheetClient(orgA.staff), docId))).toContain("[sheet.not_sheet]");
    const viewOnly = newSheet(db, orgA.staff, { visibility: "org_view" });
    expect(errorOf(() => acquire(db, sheetClient(orgA.colleague), viewOnly))).toContain("[doc.forbidden]");
    expect(errorOf(() => acquire(db, sheetClient(orgB.owner), id))).toContain("[doc.forbidden]");
    expect(db.find("documentEditLease", id)).toBeNull();
  });
});

describe("release, decline, cancel", () => {
  test("release keeps epoch, lastSeq and the request, and stamps the reservation clock", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.staff);
    const b = sheetClient(orgA.colleague);
    acquire(db, a, id);
    acquire(db, b, id);
    release(db, sheetClient(orgA.staff), id); // another session of the same member: not the holder, no-op
    expect(lease(db, id).holderSessionId).toBe(a.sessionId);
    release(db, a, id);
    const row = lease(db, id);
    expect(row).toMatchObject({ holderMemberId: "", holderName: "", epoch: 1n, requestedBySessionId: b.sessionId });
    expect((row.heartbeatAt as FakeTimestamp).microsSinceUnixEpoch).toBe(db.nowMicros);
    release(db, a, id); // idempotent
    acquire(db, sheetClient(orgA.manager), id); // reserved for B
    expect(lease(db, id).holderMemberId).toBe("");
    acquire(db, b, id);
    expect(lease(db, id)).toMatchObject({ epoch: 2n, holderSessionId: b.sessionId, requestedBySessionId: "" });
  });

  test("decline clears the request and counts as holder activity; it needs the lease", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.staff);
    const b = sheetClient(orgA.colleague);
    acquire(db, a, id);
    acquire(db, b, id);
    expect(errorOf(() => asClient(db, R.declineSheetLeaseRequest, b, { documentId: id, leaseEpoch: 1n }))).toContain("[sheet.lease]");
    asClient(db, R.declineSheetLeaseRequest, a, { documentId: id, leaseEpoch: 1n });
    const row = lease(db, id);
    expect(row).toMatchObject({ requestedBySessionId: "", requestedByMemberId: "", requestedByName: "", holderSessionId: a.sessionId });
    expect((row.lastEditAt as FakeTimestamp).microsSinceUnixEpoch).toBe(db.nowMicros);
    expect(row.heartbeatAt).toEqual(row.lastEditAt);
  });

  test("cancel withdraws only the caller's own request, idempotently", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    acquire(db, sheetClient(orgA.staff), id);
    const b = sheetClient(orgA.colleague);
    acquire(db, b, id);
    asClient(db, R.cancelSheetLeaseRequest, sheetClient(orgA.manager), { documentId: id });
    expect(lease(db, id).requestedBySessionId).toBe(b.sessionId);
    asClient(db, R.cancelSheetLeaseRequest, b, { documentId: id });
    expect(lease(db, id).requestedBySessionId).toBe("");
    asClient(db, R.cancelSheetLeaseRequest, b, { documentId: id });
  });

  test("naming another member's session releases or cancels nothing, for a viewer or an editor", () => {
    // Session ids are readable by every reader of the sheet (document_edit_lease is reader-scoped).
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff, { visibility: "org_view" });
    const holder = sheetClient(orgA.staff);
    const asker = sheetClient(orgA.manager);
    acquire(db, holder, id);
    acquire(db, asker, id);
    const before = lease(db, id);
    expect(before).toMatchObject({ holderSessionId: holder.sessionId, requestedBySessionId: asker.sessionId });
    const as = (member: FakeMember, sessionId: string) => sheetClient(member, { sessionId });
    for (const member of [orgA.colleague, orgA.owner]) { // a viewer; an owner
      asClient(db, R.releaseSheetLease, as(member, holder.sessionId), { documentId: id });
      asClient(db, R.cancelSheetLeaseRequest, as(member, asker.sessionId), { documentId: id });
    }
    asClient(db, R.releaseSheetLease, as(orgA.manager, holder.sessionId), { documentId: id }); // the requester
    asClient(db, R.cancelSheetLeaseRequest, as(orgA.staff, asker.sessionId), { documentId: id }); // the holder
    expect(lease(db, id)).toEqual(before);
  });
});

describe("disconnects and access changes (H2–H4, H7)", () => {
  test("onDisconnect detaches the holder's connection and withdraws requests made from the closing one", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const a = sheetClient(orgA.staff);
    const b = sheetClient(orgA.colleague);
    acquire(db, a, id);
    acquire(db, b, id);
    disconnect(db, b);
    expect(lease(db, id)).toMatchObject({ requestedBySessionId: "", requestedByConnectionId: "", holderConnectionId: a.connection.hex });
    disconnect(db, a);
    const row = lease(db, id);
    expect(row).toMatchObject({ holderConnectionId: "", holderSessionId: a.sessionId, epoch: 1n });
    expect((row.heartbeatAt as FakeTimestamp).microsSinceUnixEpoch).toBe(db.nowMicros);
    // Within the grace a colleague only asks; the holder re-binds from its new socket.
    acquire(db, b, id);
    expect(lease(db, id).holderConnectionId).toBe("");
    a.connection = sheetClient(orgA.staff).connection;
    acquire(db, a, id);
    expect(lease(db, id)).toMatchObject({ epoch: 1n, holderConnectionId: a.connection.hex });
    // Detached again and past the grace: the colleague's live request wins.
    disconnect(db, a);
    acquire(db, b, id, { atMicros: db.nowMicros + SHEET_LEASE_DETACHED_GRACE_MICROS + S });
    expect(lease(db, id)).toMatchObject({ epoch: 2n, holderSessionId: b.sessionId });
  });

  test("trashDocument drops the lease but keeps the row (epoch stays monotonic)", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    const b = sheetClient(orgA.manager);
    acquire(db, sheetClient(orgA.colleague), id);
    acquire(db, b, id);
    db.run(MODULE.trashDocument, orgA.staff, { documentId: id });
    expect(lease(db, id)).toMatchObject({ holderMemberId: "", requestedByMemberId: "", epoch: 1n });
    expect(errorOf(() => acquire(db, b, id))).toContain("[doc.trashed]");
  });

  test("making the sheet private clears a holder and a requester who can no longer edit it", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    acquire(db, sheetClient(orgA.colleague), id);
    acquire(db, sheetClient(orgA.manager), id);
    db.run(MODULE.setDocumentVisibility, orgA.staff, { documentId: id, visibility: "private" });
    // The colleague lost access; the manager (a doc manager by role) keeps the request.
    expect(lease(db, id)).toMatchObject({ holderMemberId: "", requestedByMemberId: orgA.manager.memberId });
  });

  test("revoking a grant clears the grantee's lease", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff, { space: "my" });
    db.run(MODULE.grantDocumentAccess, orgA.staff, { documentId: id, memberId: orgA.colleague.memberId, role: "editor" });
    const c = sheetClient(orgA.colleague);
    acquire(db, c, id);
    expect(lease(db, id).holderMemberId).toBe(orgA.colleague.memberId);
    db.run(MODULE.grantDocumentAccess, orgA.staff, { documentId: id, memberId: orgA.colleague.memberId, role: "viewer" });
    expect(lease(db, id).holderMemberId).toBe("");
    db.run(MODULE.grantDocumentAccess, orgA.staff, { documentId: id, memberId: orgA.colleague.memberId, role: "editor" });
    acquire(db, c, id);
    db.run(MODULE.revokeDocumentAccess, orgA.staff, { documentId: id, memberId: orgA.colleague.memberId });
    expect(lease(db, id)).toMatchObject({ holderMemberId: "", epoch: 2n });
  });

  test("a Drive move into its owner's My files clears a colleague's lease", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff);
    acquire(db, sheetClient(orgA.colleague), id);
    db.run(R.moveDriveEntries, orgA.staff, {
      organizationId: orgA.organizationId, itemIds: "[]", documentIds: JSON.stringify([id]), targetSpace: "my",
      targetParentId: "", targetOwnerMemberId: "", actingMemberId: "",
    });
    expect(db.find("document", id)?.visibility).toBe("private");
    expect(lease(db, id).holderMemberId).toBe("");
  });

  test("a disabled member's leases and requests are cleared; so are a leaving member's", () => {
    const { db, orgA } = createSheetWorld();
    const first = newSheet(db, orgA.staff);
    const second = newSheet(db, orgA.staff);
    acquire(db, sheetClient(orgA.colleague), first);
    acquire(db, sheetClient(orgA.staff), second);
    acquire(db, sheetClient(orgA.colleague), second);
    db.run(MODULE.setMemberStatus, orgA.owner, { organizationId: orgA.organizationId, memberId: orgA.colleague.memberId, status: "inactive" });
    expect(lease(db, first).holderMemberId).toBe("");
    expect(lease(db, second)).toMatchObject({ holderMemberId: orgA.staff.memberId, requestedByMemberId: "" });
    acquire(db, sheetClient(orgA.manager), first);
    db.run(MODULE.leaveOrg, orgA.manager, { organizationId: orgA.organizationId });
    expect(lease(db, first).holderMemberId).toBe("");
  });
});

describe("acting operator: the intersection of tablet and operator", () => {
  test("a staff-account tablet cannot reach an operator's private sheet", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.colleague, { space: "my" });
    operatorSession(db, orgA.staff, orgA.colleague);
    expect(errorOf(() => acquire(db, sheetClient(orgA.staff, { acting: orgA.colleague }), id))).toContain("[doc.forbidden]");
  });

  test("an owner-account tablet edits an operator's sheet as the operator", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.staff, { space: "my" });
    const tablet = sheetClient(orgA.owner, { acting: orgA.staff });
    acquire(db, tablet, id);
    expect(lease(db, id)).toMatchObject({ holderMemberId: orgA.owner.memberId, holderActorMemberId: orgA.staff.memberId, holderName: "Org A staff" });
    push(db, tablet, id);
    const update = db.rows("documentUpdate").find((r) => r.documentId === id);
    expect(update?.memberId).toBe(orgA.staff.memberId);
    expect(db.find("document", id)?.lastEditorMemberId).toBe(orgA.staff.memberId);
  });

  test("acting never adds rights: an operator without access is refused on the owner's own sheet", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.owner, { space: "my" });
    expect(errorOf(() => acquire(db, sheetClient(orgA.owner, { acting: orgA.staff }), id))).toContain("[doc.forbidden]");
  });

  test("a staff-account tablet acts on a Store sheet only with a fresh operator session", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.manager);
    const tablet = sheetClient(orgA.staff, { acting: orgA.colleague });
    expect(errorOf(() => acquire(db, tablet, id))).toContain("[drive.operator]");
    operatorSession(db, orgA.staff, orgA.colleague, db.nowMicros - DRIVE_OPERATOR_SESSION_TTL_MICROS - S);
    expect(errorOf(() => acquire(db, tablet, id))).toContain("[drive.operator]");
    db.patch("deviceOperatorSession", orgA.staff.identity, { resolvedAt: new FakeTimestamp(db.nowMicros) });
    acquire(db, tablet, id);
    expect(lease(db, id)).toMatchObject({ holderMemberId: orgA.staff.memberId, holderActorMemberId: orgA.colleague.memberId });
    // Another operator on the same tablet account is another person: a request, not a takeover.
    db.patch("deviceOperatorSession", orgA.staff.identity, { memberId: orgA.manager.memberId });
    const next = sheetClient(orgA.staff, { acting: orgA.manager });
    acquire(db, next, id);
    expect(lease(db, id)).toMatchObject({ holderActorMemberId: orgA.colleague.memberId, requestedByActorMemberId: orgA.manager.memberId });
    // The first operator's writes are now refused: the session names someone else.
    expect(errorOf(() => push(db, tablet, id))).toContain("[drive.operator]");
  });

  test("another operator on the holder's own session is a fresh grant: the first one's queued writes are fenced", () => {
    const { db, orgA } = createSheetWorld();
    const id = newSheet(db, orgA.manager);
    const first = sheetClient(orgA.owner, { acting: orgA.staff });
    acquire(db, first, id);
    push(db, first, id);
    const second: SheetClient = { ...first, acting: orgA.colleague.memberId }; // same account, session and socket
    acquire(db, second, id);
    const row = lease(db, id);
    expect(row).toMatchObject({
      epoch: 2n, lastSeq: 0n, holderMemberId: orgA.owner.memberId, holderSessionId: first.sessionId,
      holderActorMemberId: orgA.colleague.memberId, holderName: "Org A colleague",
    });
    for (const at of [row.acquiredAt, row.heartbeatAt, row.lastEditAt]) {
      expect((at as FakeTimestamp).microsSinceUnixEpoch).toBe(db.nowMicros);
    }
    // The first operator's next batch (old epoch, seq 2) lands nowhere, under either actor.
    expect(errorOf(() => push(db, first, id, { epoch: 1n, seq: 2n }))).toContain("[sheet.lease]");
    expect(errorOf(() => push(db, second, id, { epoch: 1n, seq: 2n }))).toContain("[sheet.lease]");
    push(db, second, id);
    expect(db.rows("documentUpdate").filter((r) => r.documentId === id).map((r) => r.memberId))
      .toEqual([orgA.staff.memberId, orgA.colleague.memberId]);
    // The same operator on a new socket re-binds: epoch and lastSeq stay.
    second.connection = sheetClient(orgA.owner).connection;
    acquire(db, second, id);
    expect(lease(db, id)).toMatchObject({ epoch: 2n, lastSeq: 1n, holderConnectionId: second.connection.hex });
  });
});
