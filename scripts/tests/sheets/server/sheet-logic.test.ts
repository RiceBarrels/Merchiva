// Pure Sheets server rules (spacetimedb/src/drive/sheet-logic.ts, sheets.md §3.2 / §5.1),
// imported directly — the file has no imports, so this suite can never skip.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHEET_LEASE_DETACHED_GRACE_MICROS, SHEET_LEASE_REQUEST_GRACE_MICROS, SHEET_LEASE_REQUEST_MAX_AGE_MICROS,
  SHEET_LEASE_RESERVE_MICROS, SHEET_LEASE_TTL_MICROS, SHEET_NAME_MAX, SHEET_ORG_MAX_BYTES, SHEET_VERSION_AUTO_KEEP,
  SHEET_VERSION_MAX_BYTES, cleanSheetName, cleanSheetSessionId, isGzipBytes, sheetBytesFit, sheetLeaseDecision,
  sheetLeaseState, sheetRequestLive, sheetVersionPrunePlan, type SheetLeaseCaller, type SheetLeaseTimes,
  type SheetVersionMeta,
} from "../../../../spacetimedb/src/drive/sheet-logic";

const S = 1_000_000n; // one second in µs
const NOW = 1_000_000n * S;

/** A lease held by member "m-a" (actor "a"), session "sa", connection "ca", heartbeat now, no request. */
function held(patch: Partial<SheetLeaseTimes> = {}): SheetLeaseTimes {
  return {
    holderMemberId: "m-a", holderActorMemberId: "a", holderSessionId: "sa", holderConnectionId: "ca",
    heartbeatMicros: NOW, lastEditMicros: NOW - 60n * S, requestedBySessionId: "", requestedByConnectionId: "",
    requestedMicros: 0n, ...patch,
  };
}
const request = (session: string, at: bigint, connection = `c-${session}`): Partial<SheetLeaseTimes> =>
  ({ requestedBySessionId: session, requestedByConnectionId: connection, requestedMicros: at });
const released = (at: bigint, patch: Partial<SheetLeaseTimes> = {}): SheetLeaseTimes =>
  held({ holderMemberId: "", holderActorMemberId: "", holderSessionId: "", holderConnectionId: "", heartbeatMicros: at, ...patch });
const caller = (actor: string, session: string, member = `m-${actor}`): SheetLeaseCaller =>
  ({ memberId: member, actorMemberId: actor, sessionId: session });

describe("sheetLeaseState", () => {
  test("free, held, detached and expired at the exact boundaries", () => {
    expect(sheetLeaseState(null, NOW)).toBe("free");
    expect(sheetLeaseState(released(NOW), NOW)).toBe("free");
    expect(sheetLeaseState(held({ heartbeatMicros: NOW - SHEET_LEASE_TTL_MICROS }), NOW)).toBe("held");
    expect(sheetLeaseState(held({ heartbeatMicros: NOW - SHEET_LEASE_TTL_MICROS - 1n }), NOW)).toBe("expired");
    expect(sheetLeaseState(held({ holderConnectionId: "", heartbeatMicros: NOW - SHEET_LEASE_DETACHED_GRACE_MICROS }), NOW)).toBe("detached");
    expect(sheetLeaseState(held({ holderConnectionId: "", heartbeatMicros: NOW - SHEET_LEASE_DETACHED_GRACE_MICROS - 1n }), NOW)).toBe("expired");
  });

  test("a request is live only with an open socket and younger than 10 minutes", () => {
    expect(sheetRequestLive(null, NOW)).toBe(false);
    expect(sheetRequestLive(held(), NOW)).toBe(false);
    expect(sheetRequestLive(held(request("sb", NOW - 5n * S)), NOW)).toBe(true);
    expect(sheetRequestLive(held(request("sb", NOW - 5n * S, "")), NOW)).toBe(false); // (d) socket closed
    expect(sheetRequestLive(held(request("sb", NOW - SHEET_LEASE_REQUEST_MAX_AGE_MICROS)), NOW)).toBe(false); // (e)
    expect(sheetRequestLive(held(request("sb", NOW - SHEET_LEASE_REQUEST_MAX_AGE_MICROS + 1n)), NOW)).toBe(true);
  });
});

describe("sheetLeaseDecision — every row of sheets.md §5.1", () => {
  const rows: Array<[string, SheetLeaseTimes | null, SheetLeaseCaller, string]> = [
    ["no row → grant", null, caller("b", "sb"), "grant"],
    ["holder = my member + session → rebind", held(), caller("a", "sa"), "rebind"],
    ["rebind even while expired", held({ heartbeatMicros: NOW - 10n * 60n * S }), caller("a", "sa"), "rebind"],
    ["rebind needs the same member", held(), caller("a", "sa", "m-other"), "grant"],
    ["free, another live request, released < 60 s ago → queued",
      released(NOW - 59n * S, request("sb", NOW - 70n * S)), caller("c", "sc"), "queued"],
    ["free, another live request, released ≥ 60 s ago → grant",
      released(NOW - SHEET_LEASE_RESERVE_MICROS, request("sb", NOW - 70n * S)), caller("c", "sc"), "grant"],
    ["free, my own live request → grant", released(NOW - 5n * S, request("sb", NOW - 20n * S)), caller("b", "sb"), "grant"],
    ["free, no request → grant", released(NOW - 5n * S), caller("b", "sb"), "grant"],
    ["expired, another live request → queued",
      held({ heartbeatMicros: NOW - 60n * S, ...request("sb", NOW - 5n * S) }), caller("c", "sc"), "queued"],
    ["expired, my live request → grant", held({ heartbeatMicros: NOW - 60n * S, ...request("sb", NOW - 5n * S) }), caller("b", "sb"), "grant"],
    ["expired, no request → grant", held({ heartbeatMicros: NOW - 60n * S }), caller("b", "sb"), "grant"],
    ["held, same actor on another session → grant (takeover)", held(), caller("a", "s2"), "grant"],
    ["detached, same actor on another session → grant", held({ holderConnectionId: "", heartbeatMicros: NOW - S }), caller("a", "s2"), "grant"],
    ["held, my request ≥ 30 s old and no edit since → grant",
      held({ lastEditMicros: NOW - 40n * S, ...request("sb", NOW - SHEET_LEASE_REQUEST_GRACE_MICROS) }), caller("b", "sb"), "grant"],
    ["held, my request ≥ 30 s old but the holder edited since → request",
      held({ lastEditMicros: NOW - 10n * S, ...request("sb", NOW - 40n * S) }), caller("b", "sb"), "request"],
    ["held, my request < 30 s old → request",
      held({ lastEditMicros: NOW - 60n * S, ...request("sb", NOW - 29n * S) }), caller("b", "sb"), "request"],
    ["detached, my ready request → request (waits for expiry)",
      held({ holderConnectionId: "", heartbeatMicros: NOW - S, lastEditMicros: NOW - 90n * S, ...request("sb", NOW - 60n * S) }), caller("b", "sb"), "request"],
    ["held, another live request → queued", held(request("sb", NOW - 5n * S)), caller("c", "sc"), "queued"],
    ["detached, another live request → queued",
      held({ holderConnectionId: "", heartbeatMicros: NOW - S, ...request("sb", NOW - 5n * S) }), caller("c", "sc"), "queued"],
    ["held, no live request → request", held(), caller("b", "sb"), "request"],
    ["held, only a dead request (socket closed) → request", held(request("sb", NOW - 5n * S, "")), caller("c", "sc"), "request"],
  ];
  for (const [name, lease, who, expected] of rows) {
    test(name, () => expect(sheetLeaseDecision(lease, NOW, who)).toBe(expected));
  }

  test("(a) A holds, B asks, A releases, C acquires → queued; then B → grant", () => {
    const afterRelease = released(NOW, request("sb", NOW - 10n * S));
    expect(sheetLeaseDecision(afterRelease, NOW + S, caller("c", "sc"))).toBe("queued");
    expect(sheetLeaseDecision(afterRelease, NOW + S, caller("b", "sb"))).toBe("grant");
  });

  test("(b) B asks while A holds; C asking is queued and B's request stands", () => {
    const withB = held(request("sb", NOW - 3n * S));
    expect(sheetLeaseDecision(withB, NOW, caller("c", "sc"))).toBe("queued");
    expect(sheetLeaseDecision(withB, NOW, caller("b", "sb"))).toBe("request");
  });

  test("(c) a request made 55 s before the release is reserved 59 s after it, not at 61 s", () => {
    const releaseAt = NOW;
    const lease = released(releaseAt, request("sb", releaseAt - 55n * S));
    expect(sheetLeaseDecision(lease, releaseAt + 59n * S, caller("c", "sc"))).toBe("queued");
    expect(sheetLeaseDecision(lease, releaseAt + 61n * S, caller("c", "sc"))).toBe("grant");
  });

  test("(d) (e) a dead request reserves nothing", () => {
    expect(sheetLeaseDecision(released(NOW, request("sb", NOW - S, "")), NOW + S, caller("c", "sc"))).toBe("grant");
    expect(sheetLeaseDecision(released(NOW, request("sb", NOW - SHEET_LEASE_REQUEST_MAX_AGE_MICROS)), NOW + S, caller("c", "sc"))).toBe("grant");
  });

  test("(f) the same actor on another session takes over at once", () => {
    expect(sheetLeaseDecision(held(request("sb", NOW - S)), NOW, caller("a", "s-phone"))).toBe("grant");
  });

  test("(g) the same tablet account with a different operator is another person", () => {
    const tablet = held({ holderMemberId: "m-tablet", holderActorMemberId: "op-1" });
    expect(sheetLeaseDecision(tablet, NOW, { memberId: "m-tablet", actorMemberId: "op-2", sessionId: "s-2" })).toBe("request");
    const asked = held({ holderMemberId: "m-tablet", holderActorMemberId: "op-1", ...request("sb", NOW - S) });
    expect(sheetLeaseDecision(asked, NOW, { memberId: "m-tablet", actorMemberId: "op-2", sessionId: "s-2" })).toBe("queued");
  });
});

describe("sheetVersionPrunePlan", () => {
  const MIB = 1_048_576;
  const v = (id: string, kind: string, byteLength: number, at: number): SheetVersionMeta =>
    ({ id, kind, byteLength, createdMicros: BigInt(at) * S });
  const autos = (n: number, bytes = 10): SheetVersionMeta[] => Array.from({ length: n }, (_, i) => v(`a${i}`, "auto", bytes, i + 1));

  test("the 11th auto prunes the oldest auto only", () => {
    expect(sheetVersionPrunePlan(autos(9), { kind: "auto", byteLength: 10 })).toEqual({ accept: true, deleteIds: [] });
    expect(sheetVersionPrunePlan([...autos(10), v("n1", "named", 10, 0)], { kind: "auto", byteLength: 10 }))
      .toEqual({ accept: true, deleteIds: ["a0"] });
  });

  test("a named version never prunes by count but frees bytes from the oldest autos", () => {
    expect(sheetVersionPrunePlan(autos(10), { kind: "named", byteLength: 10 })).toEqual({ accept: true, deleteIds: [] });
    const big = [v("a0", "auto", 20 * MIB, 1), v("a1", "auto", 20 * MIB, 2), v("n0", "named", 20 * MIB, 0)];
    expect(sheetVersionPrunePlan(big, { kind: "restore", byteLength: 8 * MIB })).toEqual({ accept: true, deleteIds: ["a0"] });
  });

  test("named / restore bytes alone over the budget: refused; an auto that cannot fit: skipped", () => {
    const named = [v("n0", "named", 60 * MIB, 0), v("a0", "auto", MIB, 1)];
    expect(sheetVersionPrunePlan(named, { kind: "named", byteLength: 5 * MIB })).toEqual({ accept: false, deleteIds: [] });
    expect(sheetVersionPrunePlan(named, { kind: "auto", byteLength: 5 * MIB })).toEqual({ accept: false, deleteIds: [] });
    expect(sheetVersionPrunePlan(named, { kind: "named", byteLength: 4 * MIB })).toEqual({ accept: true, deleteIds: ["a0"] });
    expect(SHEET_VERSION_MAX_BYTES).toBe(64 * MIB);
    expect(SHEET_VERSION_AUTO_KEEP).toBe(10);
  });

  test("oldest first, ties broken by id", () => {
    const tie = [v("b", "auto", 40 * MIB, 5), v("a", "auto", 40 * MIB, 5)];
    expect(sheetVersionPrunePlan(tie, { kind: "auto", byteLength: MIB }).deleteIds).toEqual(["a"]);
  });
});

describe("input helpers and the org budget", () => {
  test("isGzipBytes: the gzip header on at least 18 bytes", () => {
    expect(isGzipBytes(new Uint8Array([0x1f, 0x8b, 0x08, ...new Array(15).fill(0)]))).toBe(true);
    expect(isGzipBytes(new Uint8Array([0x1f, 0x8b, 0x08, ...new Array(14).fill(0)]))).toBe(false);
    expect(isGzipBytes(new Uint8Array([0x1f, 0x8b, 0x07, ...new Array(15).fill(0)]))).toBe(false);
    expect(isGzipBytes(new Uint8Array(0))).toBe(false);
  });

  test("cleanSheetSessionId trims, lowercases and requires 8–64 of [a-z0-9-]", () => {
    expect(cleanSheetSessionId("  ABCDEF12-3456 ")).toBe("abcdef12-3456");
    for (const bad of ["", "short", "has space here", "under_score1", "x".repeat(65)]) expect(cleanSheetSessionId(bad)).toBeNull();
    expect(cleanSheetSessionId("x".repeat(64))).toBe("x".repeat(64));
  });

  test("cleanSheetName collapses whitespace and clamps by code point", () => {
    expect(cleanSheetName("  Ana \n  María  ")).toBe("Ana María");
    expect(Array.from(cleanSheetName("😀".repeat(100)))).toHaveLength(SHEET_NAME_MAX);
  });

  test("sheetBytesFit: shrinking always fits; growth up to 256 MiB in total", () => {
    expect(SHEET_ORG_MAX_BYTES).toBe(268_435_456n);
    expect(sheetBytesFit(SHEET_ORG_MAX_BYTES + 5n, -1n)).toBe(true);
    expect(sheetBytesFit(SHEET_ORG_MAX_BYTES - 10n, 10n)).toBe(true);
    expect(sheetBytesFit(SHEET_ORG_MAX_BYTES - 10n, 11n)).toBe(false);
  });

  test("sheet-logic.ts has no imports (Bun loads it directly; lib/sheets mirrors it)", () => {
    const source = readFileSync(join(import.meta.dir, "..", "..", "..", "..", "spacetimedb", "src", "drive", "sheet-logic.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});
