// The QR log-in writes the tablet's operator session (CONTRACTS C36, U7): index.ts's
// real device-login reducers over the two-org fake database, and the sheet lease the
// operator then takes through the real drive/sheets.ts factory.
//
// device_login_request keeps its shipped columns (older tablets decode it
// positionally; the harness's fake refuses any other column), so who asked for a
// request is a device_login_requester row, written and deleted with it.

import { describe, expect, test } from "bun:test";
import { FakeIdentity, FakeTimestamp, FakeUuid, SERVICE_IDENTITY, loadModule, type FakeDb, type FakeMember, type Row } from "../../drive/fake-db";
import { MODULE, acquire, createSheetWorld, errorOf, lease, newSheet, operatorSession, sheetClient } from "../helpers/sheet-server-harness";

const S = 1_000_000n;
const { pruneEphemeral } = loadModule(["pruneEphemeral"]);

/** A request row as createDeviceLoginRequest writes it; `requester: null` = one from before device_login_requester. */
function qr(db: FakeDb, tablet: FakeMember, patch: Record<string, unknown> = {}, requester: FakeMember | null = tablet): FakeUuid {
  const id = new FakeUuid();
  db.insert("deviceLoginRequest", {
    id, organizationId: tablet.organizationId, deviceId: "tablet-1", nonce: `nonce-${id.toString()}`, status: "approved",
    memberId: undefined, intent: "login", createdAt: new FakeTimestamp(db.nowMicros),
    expiresAt: new FakeTimestamp(db.nowMicros + 120n * S), ...patch,
  });
  if (requester) {
    db.insert("deviceLoginRequester", {
      requestId: id, requesterIdentity: requester.identity, organizationId: tablet.organizationId, createdAt: new FakeTimestamp(db.nowMicros),
    });
  }
  return id;
}

/** Hex of the identity that asked for a request, or null when it has no requester row. */
function requesterHex(db: FakeDb, request: Row): string | null {
  const row = db.find("deviceLoginRequester", request.id);
  return row ? (row.requesterIdentity as FakeIdentity).hex : null;
}

describe("QR log-in writes the tablet's operator session (U7)", () => {
  test("the full handshake: request → phone approves → tablet consumes → it may act for the operator", () => {
    const { db, orgA } = createSheetWorld();
    db.run(MODULE.createDeviceLoginRequest, orgA.staff, { organizationId: orgA.organizationId, deviceId: "tablet-1", nonce: "nonce-abcdef" });
    const request = db.rows("deviceLoginRequest")[0];
    expect(request).toMatchObject({ status: "pending", organizationId: orgA.organizationId });
    // The requester is its own row, keyed by the request's uuid (the RLS rule joins uuid = uuid).
    expect(db.rows("deviceLoginRequester")).toEqual([{
      requestId: request.id, requesterIdentity: orgA.staff.identity, organizationId: orgA.organizationId, createdAt: request.createdAt,
    }]);
    db.run(MODULE.approveDeviceLogin, orgA.colleague, { nonce: "nonce-abcdef", intent: "login" });
    db.run(MODULE.consumeDeviceLogin, orgA.staff, { id: request.id });
    expect(db.find("deviceOperatorSession", orgA.staff.identity)).toMatchObject({
      organizationId: orgA.organizationId, memberId: orgA.colleague.memberId, memberName: "Org A  colleague ", role: "staff",
    });
    // The tablet punches this operator by the request id (recordOperatorPunch's grant).
    expect(db.find("deviceOperatorGrant", `${orgA.staff.identity.hex}:${request.id.toString()}`)).toMatchObject({
      organizationId: orgA.organizationId, memberId: orgA.colleague.memberId,
    });
    expect(db.rows("deviceLoginRequest")[0].status).toBe("consumed");
    expect(requesterHex(db, request)).toBe(orgA.staff.identity.hex); // kept while the request row exists
    const id = newSheet(db, orgA.manager);
    acquire(db, sheetClient(orgA.staff, { acting: orgA.colleague }), id);
    expect(lease(db, id).holderActorMemberId).toBe(orgA.colleague.memberId);
  });

  test("no session unless approved, unexpired, requested by the consumer and for an active member", () => {
    const { db, orgA } = createSheetWorld();
    const cases: Array<[string, Record<string, unknown>, FakeMember | null]> = [
      ["a request from before device_login_requester", { memberId: orgA.colleague.memberId }, null],
      ["still pending", { status: "pending" }, orgA.staff],
      ["expired", { memberId: orgA.colleague.memberId, expiresAt: new FakeTimestamp(db.nowMicros - S) }, orgA.staff],
    ];
    for (const [name, patch, requester] of cases) {
      const id = qr(db, orgA.staff, patch, requester);
      db.run(MODULE.consumeDeviceLogin, orgA.staff, { id });
      expect([name, db.find("deviceOperatorSession", orgA.staff.identity)]).toEqual([name, null]);
      expect(db.find("deviceLoginRequest", id)?.status).toBe("consumed");
    }
    db.run(MODULE.setMemberStatus, orgA.owner, { organizationId: orgA.organizationId, memberId: orgA.colleague.memberId, status: "inactive" });
    db.run(MODULE.consumeDeviceLogin, orgA.staff, { id: qr(db, orgA.staff, { memberId: orgA.colleague.memberId }) });
    expect(db.find("deviceOperatorSession", orgA.staff.identity)).toBeNull();
  });

  test("only the requester (or the service identity) consumes a request; one from before the requester table is anyone's", () => {
    const { db, orgA } = createSheetWorld();
    // device_login_requester is readable by anyone (a rule-free join target), so a colleague may know the id.
    const id = qr(db, orgA.staff, { memberId: orgA.colleague.memberId });
    expect(errorOf(() => db.run(MODULE.consumeDeviceLogin, orgA.owner, { id }))).toBe("Request not found");
    expect(db.find("deviceLoginRequest", id)?.status).toBe("approved");
    expect(db.find("deviceOperatorSession", orgA.owner.identity)).toBeNull();
    // The admin console's revoke (service identity): consumed, and no session for anyone.
    db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "test", registeredAt: new FakeTimestamp(db.nowMicros) });
    db.run(MODULE.consumeDeviceLogin, SERVICE_IDENTITY, { id });
    expect(db.find("deviceLoginRequest", id)?.status).toBe("consumed");
    expect(db.rows("deviceOperatorSession")).toHaveLength(0);
    const legacy = qr(db, orgA.staff, { memberId: orgA.colleague.memberId }, null);
    db.run(MODULE.consumeDeviceLogin, orgA.owner, { id: legacy });
    expect(db.find("deviceLoginRequest", legacy)?.status).toBe("consumed");
    expect(db.rows("deviceOperatorSession")).toHaveLength(0);
  });

  // Review (compat r1): after the publish no tablet can read a request that has no requester row (the rule joins
  // device_login_requester), so approving one reported a success the tablet never saw, and a rescan said "used".
  test("a pending QR from before device_login_requester is refused as expired, for every intent", () => {
    const { db, orgA } = createSheetWorld();
    const pending = { status: "pending", intent: undefined };
    for (const intent of ["login", "punch-in", "punch-out"]) {
      const legacy = qr(db, orgA.staff, { ...pending, nonce: `nonce-legacy-${intent}` }, null);
      expect(errorOf(() => db.run(MODULE.approveDeviceLogin, orgA.colleague, { nonce: `nonce-legacy-${intent}`, intent })))
        .toBe("QR code expired — refresh it on the store device");
      // Refused before any punch is applied (the fake has no punch tables: a punch would fail with another error).
      expect(db.find("deviceLoginRequest", legacy)).toMatchObject({ status: "pending", memberId: undefined });
    }
    // The same tablet's next QR has a requester row and is approved.
    const fresh = qr(db, orgA.staff, { ...pending, nonce: "nonce-fresh-1" });
    db.run(MODULE.approveDeviceLogin, orgA.colleague, { nonce: "nonce-fresh-1", intent: "login" });
    expect(db.find("deviceLoginRequest", fresh)).toMatchObject({ status: "approved", memberId: orgA.colleague.memberId });
  });

  test("a colleague cannot re-issue a tablet's QR to take the session its approval writes", () => {
    const { db, orgA, orgB } = createSheetWorld();
    const request = { organizationId: orgA.organizationId, deviceId: "tablet-1", nonce: "nonce-abcdef" };
    db.run(MODULE.createDeviceLoginRequest, orgA.staff, request);
    // A colleague who learned the tablet's deviceId + nonce (rows were org-readable before the requester rule) replays them.
    expect(errorOf(() => db.run(MODULE.createDeviceLoginRequest, orgA.colleague, request))).toBe("Nonce already in use");
    expect(errorOf(() => db.run(MODULE.createDeviceLoginRequest, orgA.colleague, { ...request, deviceId: "phone-9" }))).toBe("Nonce already in use");
    expect(errorOf(() => db.run(MODULE.createDeviceLoginRequest, orgB.staff, { ...request, organizationId: orgB.organizationId }))).toBe("Nonce already in use");
    // A request of the colleague's own for the same deviceId does not delete the tablet's.
    db.run(MODULE.createDeviceLoginRequest, orgA.colleague, { ...request, nonce: "nonce-colleague" });
    const rows = db.rows("deviceLoginRequest");
    expect(rows.map((r) => [r.nonce, r.status, requesterHex(db, r)]).sort()).toEqual([
      ["nonce-abcdef", "pending", orgA.staff.identity.hex],
      ["nonce-colleague", "pending", orgA.colleague.identity.hex],
    ]);
    // The manager scans the tablet's QR: only the tablet gets the session.
    db.run(MODULE.approveDeviceLogin, orgA.manager, { nonce: "nonce-abcdef", intent: "login" });
    const approved = rows.find((r) => r.nonce === "nonce-abcdef")!;
    db.run(MODULE.consumeDeviceLogin, orgA.staff, { id: approved.id });
    expect(db.find("deviceOperatorSession", orgA.staff.identity)).toMatchObject({ memberId: orgA.manager.memberId });
    expect(db.find("deviceOperatorSession", orgA.colleague.identity)).toBeNull();
  });

  test("the tablet may re-issue its own nonce; a nonce held by two rows is never approved", () => {
    const { db, orgA } = createSheetWorld();
    const request = { organizationId: orgA.organizationId, deviceId: "tablet-1", nonce: "nonce-abcdef" };
    db.run(MODULE.createDeviceLoginRequest, orgA.staff, request);
    db.run(MODULE.createDeviceLoginRequest, orgA.staff, request);   // the QR pane re-enabled with the same nonce
    db.run(MODULE.createDeviceLoginRequest, orgA.staff, { ...request, nonce: "nonce-next-1" });
    expect(db.rows("deviceLoginRequest").map((r) => r.nonce)).toEqual(["nonce-next-1"]);
    // The replaced requests' requester rows went with them.
    expect(db.rows("deviceLoginRequester").map((r) => String(r.requestId))).toEqual([String(db.rows("deviceLoginRequest")[0].id)]);
    // Two rows for one nonce can only predate the uniqueness check.
    for (const requester of [orgA.staff, orgA.colleague]) qr(db, orgA.staff, { nonce: "nonce-dup-1", status: "pending", intent: undefined }, requester);
    expect(errorOf(() => db.run(MODULE.approveDeviceLogin, orgA.manager, { nonce: "nonce-dup-1", intent: "login" }))).toBe("QR code not recognised");
    expect(db.rows("deviceLoginRequest").filter((r) => r.nonce === "nonce-dup-1").map((r) => r.status)).toEqual(["pending", "pending"]);
  });

  test("a requester row lives exactly as long as its request (stale prune, re-issue, pruneEphemeral)", () => {
    const { db, orgA } = createSheetWorld();
    const request = { organizationId: orgA.organizationId, deviceId: "tablet-1", nonce: "nonce-abcdef" };
    db.run(MODULE.createDeviceLoginRequest, orgA.staff, request);
    db.run(MODULE.createDeviceLoginRequest, orgA.colleague, { ...request, deviceId: "tablet-2", nonce: "nonce-other-1" });
    expect(db.rows("deviceLoginRequester")).toHaveLength(2);
    // An hour later, any new request of the org prunes both stale ones — and their requester rows.
    db.advance(3_601n * S);
    db.run(MODULE.createDeviceLoginRequest, orgA.staff, { ...request, nonce: "nonce-later-1" });
    expect(db.rows("deviceLoginRequest").map((r) => r.nonce)).toEqual(["nonce-later-1"]);
    expect(db.rows("deviceLoginRequester")).toHaveLength(1);
    // pruneEphemeral (service): expired requests go with their requester rows, and orphans are swept.
    db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "test", registeredAt: new FakeTimestamp(db.nowMicros) });
    db.insert("deviceLoginRequester", {
      requestId: new FakeUuid(), requesterIdentity: orgA.staff.identity, organizationId: orgA.organizationId, createdAt: new FakeTimestamp(db.nowMicros),
    });
    const live = qr(db, orgA.manager, { expiresAt: new FakeTimestamp(db.nowMicros + 3_600n * S) });
    db.advance(121n * S);
    db.run(pruneEphemeral, SERVICE_IDENTITY, {});
    expect(db.rows("deviceLoginRequest").map((r) => String(r.id))).toEqual([String(live)]);
    expect(db.rows("deviceLoginRequester").map((r) => String(r.requestId))).toEqual([String(live)]);
  });

  test("a later QR log-in replaces the tablet's operator", () => {
    const { db, orgA } = createSheetWorld();
    operatorSession(db, orgA.staff, orgA.manager, db.nowMicros - 5n * S);
    db.run(MODULE.consumeDeviceLogin, orgA.staff, { id: qr(db, orgA.staff, { memberId: orgA.colleague.memberId }) });
    const row = db.find("deviceOperatorSession", orgA.staff.identity);
    expect(row).toMatchObject({ memberId: orgA.colleague.memberId });
    expect((row?.resolvedAt as FakeTimestamp).microsSinceUnixEpoch).toBe(db.nowMicros);
  });
});
