// lib/sheets/lease.ts — the client mirror of the edit lease (sheets.md §5): the same truth table as
// server/sheet-logic.test.ts in milliseconds, plus the views the lease control renders. Also the lease
// row mapper, the route's access intersection and the publish probe that includes the lease table.

import { describe, expect, test } from "bun:test";
import { docsProbeQueries } from "@/lib/docs/queries";
import type { DocAccess } from "@/lib/docs/types";
import { intersectDocAccess } from "@/lib/sheets/access";
import {
  SHEET_LEASE_DETACHED_GRACE_MS, SHEET_LEASE_REQUEST_GRACE_MS, SHEET_LEASE_REQUEST_MAX_AGE_MS, SHEET_LEASE_RESERVE_MS,
  SHEET_LEASE_TTL_MS, sheetLeaseDecision, sheetLeaseState, sheetLeaseView, sheetRequestLive,
  type SheetLeaseMe, type SheetLeaseRow,
} from "@/lib/sheets/lease";
import { mapLeaseRow, mapVersionState } from "@/lib/sheets/mappers";
import { sheetsProbeQueries } from "@/lib/sheets/queries";

const S = 1000;
const NOW = 1_700_000_000_000;
const at = (ms: number) => new Date(ms);

/** A lease held by member "m-a" (actor "a"), session "sa", connection "ca", heartbeat now, no request. */
function held(patch: Partial<SheetLeaseRow> = {}): SheetLeaseRow {
  return {
    documentId: "doc", organizationId: "org", epoch: 3n, holderMemberId: "m-a", holderActorMemberId: "a",
    holderSessionId: "sa", holderConnectionId: "ca", holderName: "Ana", acquiredAt: at(NOW - 600 * S),
    heartbeatAt: at(NOW), lastEditAt: at(NOW - 60 * S), lastSeq: 7n, requestedByMemberId: "", requestedByActorMemberId: "",
    requestedBySessionId: "", requestedByConnectionId: "", requestedByName: "", requestedAt: at(0), ...patch,
  };
}
const request = (session: string, whenMs: number, connection = `c-${session}`, name = `Name ${session}`): Partial<SheetLeaseRow> =>
  ({ requestedByMemberId: `m-${session}`, requestedBySessionId: session, requestedByConnectionId: connection, requestedByName: name, requestedAt: at(whenMs) });
const released = (whenMs: number, patch: Partial<SheetLeaseRow> = {}): SheetLeaseRow =>
  held({ holderMemberId: "", holderActorMemberId: "", holderSessionId: "", holderConnectionId: "", holderName: "", heartbeatAt: at(whenMs), ...patch });
const me = (actor: string, session: string, member = `m-${actor}`, canEdit = true): SheetLeaseMe =>
  ({ memberId: member, actorMemberId: actor, sessionId: session, canEdit });

describe("sheetLeaseState / sheetRequestLive", () => {
  test("free, held, detached and expired at the exact boundaries", () => {
    expect(sheetLeaseState(null, NOW)).toBe("free");
    expect(sheetLeaseState(released(NOW), NOW)).toBe("free");
    expect(sheetLeaseState(held({ heartbeatAt: at(NOW - SHEET_LEASE_TTL_MS) }), NOW)).toBe("held");
    expect(sheetLeaseState(held({ heartbeatAt: at(NOW - SHEET_LEASE_TTL_MS - 1) }), NOW)).toBe("expired");
    expect(sheetLeaseState(held({ holderConnectionId: "", heartbeatAt: at(NOW - SHEET_LEASE_DETACHED_GRACE_MS) }), NOW)).toBe("detached");
    expect(sheetLeaseState(held({ holderConnectionId: "", heartbeatAt: at(NOW - SHEET_LEASE_DETACHED_GRACE_MS - 1) }), NOW)).toBe("expired");
  });

  test("a request is live only with an open socket and younger than 10 minutes", () => {
    expect(sheetRequestLive(null, NOW)).toBe(false);
    expect(sheetRequestLive(held(), NOW)).toBe(false);
    expect(sheetRequestLive(held(request("sb", NOW - 5 * S)), NOW)).toBe(true);
    expect(sheetRequestLive(held(request("sb", NOW - 5 * S, "")), NOW)).toBe(false);
    expect(sheetRequestLive(held(request("sb", NOW - SHEET_LEASE_REQUEST_MAX_AGE_MS)), NOW)).toBe(false);
    expect(sheetRequestLive(held(request("sb", NOW - SHEET_LEASE_REQUEST_MAX_AGE_MS + 1)), NOW)).toBe(true);
  });
});

describe("sheetLeaseDecision — every row of sheets.md §5.1", () => {
  const rows: Array<[string, SheetLeaseRow | null, SheetLeaseMe, string]> = [
    ["no row → grant", null, me("b", "sb"), "grant"],
    ["holder = my member + session → rebind", held(), me("a", "sa"), "rebind"],
    ["rebind even while expired", held({ heartbeatAt: at(NOW - 600 * S) }), me("a", "sa"), "rebind"],
    ["rebind needs the same member", held(), me("a", "sa", "m-other"), "grant"],
    ["free, another live request, released < 60 s ago → queued", released(NOW - 59 * S, request("sb", NOW - 70 * S)), me("c", "sc"), "queued"],
    ["free, another live request, released ≥ 60 s ago → grant",
      released(NOW - SHEET_LEASE_RESERVE_MS, request("sb", NOW - 70 * S)), me("c", "sc"), "grant"],
    ["free, my own live request → grant", released(NOW - 5 * S, request("sb", NOW - 20 * S)), me("b", "sb"), "grant"],
    ["free, no request → grant", released(NOW - 5 * S), me("b", "sb"), "grant"],
    ["expired, another live request → queued", held({ heartbeatAt: at(NOW - 60 * S), ...request("sb", NOW - 5 * S) }), me("c", "sc"), "queued"],
    ["expired, my live request → grant", held({ heartbeatAt: at(NOW - 60 * S), ...request("sb", NOW - 5 * S) }), me("b", "sb"), "grant"],
    ["expired, no request → grant", held({ heartbeatAt: at(NOW - 60 * S) }), me("b", "sb"), "grant"],
    ["held, same actor on another session → grant (takeover)", held(), me("a", "s2"), "grant"],
    ["detached, same actor on another session → grant", held({ holderConnectionId: "", heartbeatAt: at(NOW - S) }), me("a", "s2"), "grant"],
    ["held, my request ≥ 30 s old and no edit since → grant",
      held({ lastEditAt: at(NOW - 40 * S), ...request("sb", NOW - SHEET_LEASE_REQUEST_GRACE_MS) }), me("b", "sb"), "grant"],
    ["held, my request ≥ 30 s old but the holder edited since → request",
      held({ lastEditAt: at(NOW - 10 * S), ...request("sb", NOW - 40 * S) }), me("b", "sb"), "request"],
    ["held, my request < 30 s old → request", held({ lastEditAt: at(NOW - 60 * S), ...request("sb", NOW - 29 * S) }), me("b", "sb"), "request"],
    ["detached, my ready request → request (waits for expiry)",
      held({ holderConnectionId: "", heartbeatAt: at(NOW - S), lastEditAt: at(NOW - 90 * S), ...request("sb", NOW - 60 * S) }), me("b", "sb"), "request"],
    ["held, another live request → queued", held(request("sb", NOW - 5 * S)), me("c", "sc"), "queued"],
    ["detached, another live request → queued",
      held({ holderConnectionId: "", heartbeatAt: at(NOW - S), ...request("sb", NOW - 5 * S) }), me("c", "sc"), "queued"],
    ["held, no live request → request", held(), me("b", "sb"), "request"],
    ["held, only a dead request (socket closed) → request", held(request("sb", NOW - 5 * S, "")), me("c", "sc"), "request"],
  ];
  for (const [name, row, who, expected] of rows) {
    test(name, () => expect(sheetLeaseDecision(row, NOW, who)).toBe(expected));
  }

  test("review cases (a)–(g)", () => {
    const afterRelease = released(NOW, request("sb", NOW - 10 * S));
    expect(sheetLeaseDecision(afterRelease, NOW + S, me("c", "sc"))).toBe("queued");
    expect(sheetLeaseDecision(afterRelease, NOW + S, me("b", "sb"))).toBe("grant");
    const withB = held(request("sb", NOW - 3 * S));
    expect(sheetLeaseDecision(withB, NOW, me("c", "sc"))).toBe("queued");
    expect(sheetLeaseDecision(withB, NOW, me("b", "sb"))).toBe("request");
    const lease = released(NOW, request("sb", NOW - 55 * S));
    expect(sheetLeaseDecision(lease, NOW + 59 * S, me("c", "sc"))).toBe("queued");
    expect(sheetLeaseDecision(lease, NOW + 61 * S, me("c", "sc"))).toBe("grant");
    expect(sheetLeaseDecision(released(NOW, request("sb", NOW - S, "")), NOW + S, me("c", "sc"))).toBe("grant");
    expect(sheetLeaseDecision(held(request("sb", NOW - S)), NOW, me("a", "s-phone"))).toBe("grant");
    const tablet = held({ holderMemberId: "m-tablet", holderActorMemberId: "op-1" });
    expect(sheetLeaseDecision(tablet, NOW, me("op-2", "s-2", "m-tablet"))).toBe("request");
  });
});

describe("sheetLeaseView", () => {
  test("a member who cannot edit only sees the view-only state", () => {
    expect(sheetLeaseView(held(), NOW, me("b", "sb", "m-b", false))).toEqual({ kind: "cannot_edit" });
    expect(sheetLeaseView(null, NOW, me("b", "sb", "m-b", false))).toEqual({ kind: "cannot_edit" });
  });

  test("mine: epoch, lastSeq and another session's live request with its start time", () => {
    expect(sheetLeaseView(held(), NOW, me("a", "sa"))).toEqual({ kind: "mine", epoch: 3n, lastSeq: 7n, request: null });
    expect(sheetLeaseView(held(request("sb", NOW - 4 * S, "c-sb", "Bo")), NOW, me("a", "sa")))
      .toEqual({ kind: "mine", epoch: 3n, lastSeq: 7n, request: { name: "Bo", sinceMs: NOW - 4 * S } });
    // A dead request is not shown to the holder.
    expect(sheetLeaseView(held(request("sb", NOW - 4 * S, "")), NOW, me("a", "sa"))).toMatchObject({ kind: "mine", request: null });
  });

  test("another operator on the holder's own session is not 'mine' (the server makes it a fresh grant)", () => {
    const view = sheetLeaseView(held({ holderMemberId: "m-tablet", holderActorMemberId: "op-1", holderSessionId: "s1" }), NOW, me("op-2", "s1", "m-tablet"));
    expect(view).toMatchObject({ kind: "other", samePerson: false });
  });

  test("free: reserved for someone else, reserved for me, or open", () => {
    expect(sheetLeaseView(null, NOW, me("c", "sc"))).toEqual({ kind: "free", reservedForName: null, reservedForMe: false });
    const reserved = released(NOW - 10 * S, request("sb", NOW - 20 * S, "c-sb", "Bo"));
    expect(sheetLeaseView(reserved, NOW, me("c", "sc"))).toEqual({ kind: "free", reservedForName: "Bo", reservedForMe: false });
    expect(sheetLeaseView(reserved, NOW, me("b", "sb"))).toEqual({ kind: "free", reservedForName: null, reservedForMe: true });
    expect(sheetLeaseView(reserved, NOW - 10 * S + SHEET_LEASE_RESERVE_MS, me("c", "sc")))
      .toEqual({ kind: "free", reservedForName: null, reservedForMe: false });
  });

  test("other: holder name, state, my request pending/ready, and someone else's request", () => {
    expect(sheetLeaseView(held(), NOW, me("b", "sb"))).toEqual({
      kind: "other", holderName: "Ana", samePerson: false, state: "held", myRequest: "none", otherRequestName: null,
    });
    expect(sheetLeaseView(held(request("sb", NOW - 5 * S)), NOW, me("b", "sb"))).toMatchObject({ myRequest: "pending", otherRequestName: null });
    const ready = held({ lastEditAt: at(NOW - 60 * S), ...request("sb", NOW - 31 * S) });
    expect(sheetLeaseView(ready, NOW, me("b", "sb"))).toMatchObject({ myRequest: "ready" });
    expect(sheetLeaseView(held(request("sb", NOW - 5 * S, "c-sb", "Bo")), NOW, me("c", "sc")))
      .toMatchObject({ myRequest: "none", otherRequestName: "Bo" });
    expect(sheetLeaseView(held({ holderConnectionId: "", heartbeatAt: at(NOW - 20 * S) }), NOW, me("b", "sb")))
      .toMatchObject({ kind: "other", state: "expired" });
    expect(sheetLeaseView(held({ holderConnectionId: "", heartbeatAt: at(NOW - S) }), NOW, me("b", "sb")))
      .toMatchObject({ kind: "other", state: "detached" });
  });

  test("the same person on another tab or device sees samePerson", () => {
    expect(sheetLeaseView(held(), NOW, me("a", "s-phone"))).toMatchObject({ kind: "other", samePerson: true, holderName: "Ana" });
  });
});

describe("mapLeaseRow / mapVersionState", () => {
  test("a generated-shape row maps with Dates, bigints and hex connection ids", () => {
    const ts = (ms: number) => ({ toDate: () => new Date(ms) });
    const conn = { toHexString: () => "c0ffee" };
    const row = mapLeaseRow({
      documentId: "ABC-DEF", organizationId: "org", epoch: 4n, holderMemberId: "m1", holderActorMemberId: "op",
      holderSessionId: "s1", holderConnectionId: conn, holderName: "Ana", acquiredAt: ts(1), heartbeatAt: ts(2),
      lastEditAt: ts(3), lastSeq: 9n, requestedByMemberId: "", requestedByActorMemberId: "", requestedBySessionId: "",
      requestedByConnectionId: "", requestedByName: "", requestedAt: ts(4),
    });
    expect(row.documentId).toBe("abc-def");
    expect(row.holderConnectionId).toBe("c0ffee");
    expect(row.epoch).toBe(4n);
    expect(row.lastSeq).toBe(9n);
    expect(row.heartbeatAt.getTime()).toBe(2);
    expect(row.requestedAt.getTime()).toBe(4);
  });

  test("a malformed row degrades to a free lease instead of throwing", () => {
    const row = mapLeaseRow({});
    expect(row.holderMemberId).toBe("");
    expect(row.epoch).toBe(0n);
    expect(row.heartbeatAt.getTime()).toBe(0);
    expect(sheetLeaseState(row, NOW)).toBe("free");
  });

  test("a version state keeps its bytes and falls back to their length", () => {
    const state = mapVersionState({ versionId: "V1", documentId: "D1", organizationId: "o", state: [1, 2, 3], byteLength: 0 });
    expect(state).toEqual({ versionId: "v1", documentId: "d1", organizationId: "o", state: new Uint8Array([1, 2, 3]), byteLength: 3 });
  });
});

describe("intersectDocAccess", () => {
  const access = (role: DocAccess["role"], edit: boolean, manage = false): DocAccess =>
    ({ role, canView: role !== "none", canComment: edit, canEdit: edit, canManage: manage });

  test("the lower role wins and every flag is ANDed", () => {
    expect(intersectDocAccess(access("manager", true, true), access("editor", true))).toEqual(access("editor", true));
    expect(intersectDocAccess(access("viewer", false), access("manager", true, true))).toEqual(access("viewer", false));
    expect(intersectDocAccess(access("editor", true), access("none", false))).toEqual(access("none", false));
  });

  test("a trashed doc keeps editing off even for two managers", () => {
    const trashedManager: DocAccess = { role: "manager", canView: true, canComment: false, canEdit: false, canManage: true };
    expect(intersectDocAccess(trashedManager, access("manager", true, true))).toEqual(trashedManager);
  });
});

describe("sheetsProbeQueries", () => {
  test("every Docs table plus the lease and version-state tables, zero rows each", () => {
    const queries = sheetsProbeQueries();
    expect(queries.slice(0, -2)).toEqual(docsProbeQueries());
    expect(queries.slice(-2)).toEqual([
      `SELECT * FROM "document_edit_lease" WHERE "document_edit_lease"."document_id" = ''`,
      `SELECT * FROM "document_version_state" WHERE "document_version_state"."version_id" = ''`,
    ]);
  });
});
