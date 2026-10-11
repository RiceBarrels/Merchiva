// Punch-PIN reducers under the attempt limiter: the REAL bodies of index.ts's
// resolveDeviceOperator / recordPunch / setPunchInCode / verifyManagerPin and of
// spacetimedb/src/device/pin-reducers.ts, over the fake database. A reducer that
// throws rolls back here as it does in SpacetimeDB, so these prove a miss is
// COMMITTED (counted) and never lost to a throw.

import { describe, expect, test } from "bun:test";
import {
  DRIVE_FAKE_TABLES, FakeDb, FakeTimestamp, SERVICE_IDENTITY, loadModule, moduleStubs, registerServiceIdentity,
  type FakeMember, type FakeTableDef, type Row,
} from "../drive/fake-db";
import { FakeIdentity } from "../drive/fake-db";
import { definePinReducers, type PinDeps } from "@/spacetimedb/src/device/pin-reducers";
import type { DriveSchema } from "@/spacetimedb/src/drive/types";
import { PIN_FREE_FAILURES, PIN_ORG_LOCK_FAILURES, PIN_WINDOW_MICROS } from "@/spacetimedb/src/device/pin-limit";

const PIN_TABLES: readonly FakeTableDef[] = [
  ...DRIVE_FAKE_TABLES,
  { accessor: "punchEvent", primaryKey: "id", indexes: { byMemberId: "memberId", byOrganizationId: "organizationId" } },
  { accessor: "pinAttemptCounter", primaryKey: "key", indexes: { byOrganizationId: "organizationId" } },
  { accessor: "pinAttemptResult", primaryKey: "identity", indexes: { byOrganizationId: "organizationId" } },
  { accessor: "deviceOperatorGrant", primaryKey: "key", indexes: { byOrganizationId: "organizationId" } },
];

const M = loadModule(["pinDeps", "resolveDeviceOperator", "recordPunch", "setPunchInCode", "verifyManagerPin"]);
const R = definePinReducers(moduleStubs().spacetimedb as unknown as DriveSchema, M.pinDeps as PinDeps);
const MIN = 60_000_000n;
/** Misses that never lock; the next one does. */
const FREE = PIN_FREE_FAILURES - 1;
/** A distinct 4-digit code no member of the world uses (9000–9999). */
const wrong = (i: number) => `9${String(i).padStart(3, "0")}`;

/** A staff account an owner allowed to run a store device (device/store-access.ts). */
const STORE_DEVICE = JSON.stringify({ store_device: { view: true } });

interface World {
  db: FakeDb;
  org: string;
  owner: FakeMember;
  manager: FakeMember;
  /** Also signed in on a second tablet in some tests, so it may run one too. */
  staff: FakeMember;
  tablet: FakeMember;
  /** A staff account nobody allowed to run a store device. */
  plain: FakeMember;
}

function world(): World {
  const db = new FakeDb(PIN_TABLES);
  const org = crypto.randomUUID();
  const add = (role: string, displayName: string, permissions = "{}") =>
    db.addMember({ organizationId: org, role, displayName, permissions });
  const w = { db, org, owner: add("owner", "Olive"), manager: add("manager", "Max"), staff: add("staff", "Sam", STORE_DEVICE), tablet: add("staff", "Front tablet", STORE_DEVICE),
    plain: add("staff", "Pat") };
  const code = (m: FakeMember, c: string) => db.insert("memberPunchCode", {
    memberId: m.memberId, organizationId: org, userId: m.identity, code: c, updatedAt: new FakeTimestamp(db.nowMicros),
  });
  code(w.owner, "1111");
  code(w.manager, "2222");
  code(w.staff, "3333");
  return w;
}

/** Run a reducer; the thrown message, or null when it returned. */
function attempt(db: FakeDb, fn: unknown, who: FakeMember, args: Record<string, unknown>): string | null {
  try {
    db.run(fn, who, args);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const result = (w: World, who: FakeMember): Row | null => w.db.find("pinAttemptResult", who.identity);
const session = (w: World, who: FakeMember): Row | null => w.db.find("deviceOperatorSession", who.identity);
const guess = (w: World, who: FakeMember, code: string, requestId = crypto.randomUUID()) =>
  w.db.run(R.resolveDeviceOperatorAttempt, who, { organizationId: w.org, code, requestId });

describe("resolveDeviceOperatorAttempt", () => {
  test("a right PIN writes the session and an ok row for the request", () => {
    const w = world();
    guess(w, w.tablet, "3333", "req-1");
    expect(session(w, w.tablet)).toMatchObject({ memberId: w.staff.memberId, memberName: "Sam" });
    expect(result(w, w.tablet)).toMatchObject({ requestId: "req-1", kind: "operator", outcome: "ok", lockedUntilMicros: 0n });
  });

  test("wrong PINs are counted without a throw; the last free miss is followed by a lock, and a locked caller is refused even with a right PIN", () => {
    const w = world();
    guess(w, w.tablet, "3333");
    for (let i = 0; i < FREE; i++) guess(w, w.tablet, wrong(i));
    expect(result(w, w.tablet)).toMatchObject({ outcome: "wrong", lockedUntilMicros: 0n });
    expect(session(w, w.tablet)).toBeNull(); // a miss ends the earlier operator's session
    guess(w, w.tablet, wrong(FREE));
    const locked = result(w, w.tablet) as Row;
    expect(locked.outcome).toBe("wrong");
    expect(locked.lockedUntilMicros as bigint).toBeGreaterThan(w.db.nowMicros);
    guess(w, w.tablet, "3333", "while-locked");
    expect(result(w, w.tablet)).toMatchObject({ requestId: "while-locked", outcome: "locked" });
    expect(session(w, w.tablet)).toBeNull();
    // Another identity is not locked by the tablet's misses.
    guess(w, w.staff, "3333");
    expect(result(w, w.staff)?.outcome).toBe("ok");
    // After the lock, the next miss locks for twice as long.
    w.db.advance(2n * MIN);
    guess(w, w.tablet, wrong(FREE + 1));
    const second = result(w, w.tablet) as Row;
    expect((second.lockedUntilMicros as bigint) - w.db.nowMicros).toBe(2n * MIN);
  });

  test("malformed input tests no code and is not counted; managers hear about the first lock of the day once", () => {
    const w = world();
    for (let i = 0; i < 10; i++) guess(w, w.tablet, "12ab");
    expect(w.db.rows("pinAttemptCounter")).toHaveLength(0);
    for (let i = 0; i < PIN_FREE_FAILURES; i++) guess(w, w.tablet, wrong(i));
    const alerts = () => w.db.rows("notification").filter((n) => n.type === "security");
    expect(alerts().map((n) => n.targetId)).toEqual(expect.arrayContaining([w.owner.identity, w.manager.identity]));
    expect(alerts()).toHaveLength(2);
    expect(String(alerts()[0].body)).toContain("Front tablet");
    w.db.advance(MIN);
    guess(w, w.tablet, wrong(PIN_FREE_FAILURES + 1));
    expect(alerts()).toHaveLength(2);
  });

  test("PIN alerts open the team page and are emailed to the owners and managers (security templates)", () => {
    const w = world();
    for (let i = 0; i < PIN_FREE_FAILURES; i++) guess(w, w.tablet, wrong(i));
    const locked = w.db.rows("notification").filter((n) => n.title === "PIN entry locked on a device");
    expect(locked.map((n) => n.link)).toEqual(["/manager/personnel/team", "/manager/personnel/team"]);
    const queued = w.db.rows("notificationDelivery").filter((d) => d.template === "security.pinLocked");
    expect(queued.map((d) => (d.targetId as FakeIdentity).hex).sort()).toEqual([w.owner.identity.hex, w.manager.identity.hex].sort());
    for (const d of queued) {
      expect(d).toMatchObject({ email: true, sourceKind: "device", link: "/manager/personnel/team" });
      const params = JSON.parse(String(d.params)) as Record<string, string>;
      expect(params.actor).toBe("Front tablet");
      expect(String(locked[0].body)).toContain(`${params.count} wrong PINs`);
    }
    w.db.run(R.clearPinLockouts, w.manager, { organizationId: w.org });
    const unlocked = w.db.rows("notificationDelivery").filter((d) => d.template === "security.pinUnlocked");
    expect(unlocked.map((d) => JSON.parse(String(d.params)).actor)).toEqual(["Max", "Max"]);
  });

  test("the store-wide cap pauses PIN entry for every identity", () => {
    const w = world();
    const guessers = Array.from({ length: 13 }, (_, i) => w.db.addMember({ organizationId: w.org, displayName: `g${i}`, permissions: STORE_DEVICE }));
    let n = 0;
    for (const g of guessers) for (let i = 0; i < FREE && n < PIN_ORG_LOCK_FAILURES; i++, n++) guess(w, g, `80${String(n).padStart(2, "0")}`);
    guess(w, w.staff, "3333");
    expect(result(w, w.staff)?.outcome).toBe("locked");
    expect(w.db.rows("notificationDelivery").filter((d) => d.template === "security.manyWrongPins")).toHaveLength(2);
    w.db.advance(61n * MIN);
    guess(w, w.staff, "3333");
    expect(result(w, w.staff)?.outcome).toBe("ok");
  });

  test("rows whose window is over are pruned on the next write", () => {
    const w = world();
    guess(w, w.staff, "9000");
    w.db.advance(PIN_WINDOW_MICROS + 1n);
    guess(w, w.tablet, "9001");
    const keys = w.db.rows("pinAttemptCounter").map((r) => r.key as string);
    expect(keys.some((k) => k.endsWith(w.staff.memberId))).toBe(false);
    expect(keys.some((k) => k.endsWith(w.tablet.memberId))).toBe(true);
  });

  test("the caller's bucket follows its membership: a re-login on a fresh identity starts no new allowance", () => {
    const w = world();
    for (let i = 0; i < FREE; i++) guess(w, w.tablet, wrong(i));
    // Should a membership ever move to another identity, its count moves with it.
    const fresh = FakeIdentity.random();
    w.db.patch("orgMember", w.tablet.memberId, { userId: fresh });
    w.db.run(R.resolveDeviceOperatorAttempt, fresh, { organizationId: w.org, code: wrong(FREE), requestId: "after-relogin" });
    const row = w.db.find("pinAttemptResult", fresh) as Row;
    expect(row).toMatchObject({ requestId: "after-relogin", outcome: "wrong" });
    expect(row.lockedUntilMicros as bigint).toBeGreaterThan(w.db.nowMicros);
  });
});

describe("verifyManagerPinAttempt / verifyManagerPin", () => {
  test("ok for an owner's or manager's PIN, wrong (and counted) for anyone else's", () => {
    const w = world();
    const verify = (code: string) => {
      w.db.run(R.verifyManagerPinAttempt, w.tablet, { organizationId: w.org, code, requestId: code });
      return result(w, w.tablet)?.outcome;
    };
    expect(verify("1111")).toBe("ok");
    expect(verify("2222")).toBe("ok");
    expect(verify("3333")).toBe("wrong");
    expect(w.db.rows("pinAttemptCounter").length).toBe(2); // the tablet's bucket and the store's
  });

  test("the old reducer always refuses: its clients read 'no throw' as a manager's PIN", () => {
    const w = world();
    expect(attempt(w.db, M.verifyManagerPin, w.tablet, { organizationId: w.org, code: "1111" })).toContain("UPDATE_REQUIRED");
  });
});

describe("old resolveDeviceOperator and recordPunch: limited, safe for their clients", () => {
  test("a wrong PIN returns (counted, session dropped); a locked caller gets PIN_LOCKED", () => {
    const w = world();
    expect(attempt(w.db, M.resolveDeviceOperator, w.tablet, { organizationId: w.org, code: "3333" })).toBeNull();
    expect(session(w, w.tablet)?.memberId).toBe(w.staff.memberId);
    for (let i = 0; i < PIN_FREE_FAILURES; i++) {
      expect(attempt(w.db, M.resolveDeviceOperator, w.tablet, { organizationId: w.org, code: wrong(i) })).toBeNull();
    }
    expect(session(w, w.tablet)).toBeNull();
    expect(attempt(w.db, M.resolveDeviceOperator, w.tablet, { organizationId: w.org, code: "3333" })).toBe("PIN_LOCKED");
    expect(attempt(w.db, M.recordPunch, w.tablet, { organizationId: w.org, code: "3333", action: "in" })).toBe("PIN_LOCKED");
  });

  test("recordPunch counts a wrong code instead of throwing, and still punches a right one", () => {
    const w = world();
    expect(attempt(w.db, M.recordPunch, w.tablet, { organizationId: w.org, code: "9000", action: "bogus" })).toBeNull();
    expect(w.db.rows("punchEvent")).toHaveLength(0);
    expect(w.db.rows("pinAttemptCounter").length).toBe(2);
    expect(attempt(w.db, M.recordPunch, w.tablet, { organizationId: w.org, code: "3333", action: "in" })).toBeNull();
    expect(w.db.rows("punchEvent")[0]).toMatchObject({ memberId: w.staff.memberId, action: "in" });
  });
});

describe("punching without a PIN", () => {
  test("recordOperatorPunch punches the member its grant names, and nobody without a fresh grant", () => {
    const w = world();
    const punch = (grantId: string, action: string, who: FakeMember | FakeIdentity = w.tablet) =>
      attempt(w.db, R.recordOperatorPunch, who as FakeMember, { organizationId: w.org, action, grantId });
    expect(punch("none", "in")).toBe("NO_OPERATOR_SESSION");
    guess(w, w.tablet, "3333", "login-1");
    expect(punch("login-1", "in")).toBeNull();
    expect(w.db.rows("punchEvent")[0]).toMatchObject({ memberId: w.staff.memberId, action: "in" });
    w.db.advance(13n * 60n * MIN);
    expect(punch("login-1", "out")).toBe("NO_OPERATOR_SESSION");
  });

  test("two tablets on one store account: each punches its own operator, whatever the other one does", () => {
    const w = world();
    // Both tablets are the same identity (the store account); only their grant ids differ.
    guess(w, w.tablet, "3333", "tablet-1");   // Sam on tablet 1
    guess(w, w.tablet, "2222", "tablet-2");   // Max on tablet 2: the shared session row now names Max
    expect(session(w, w.tablet)?.memberId).toBe(w.manager.memberId);
    guess(w, w.tablet, "9999", "tablet-2b"); // a wrong PIN on tablet 2 drops the shared session
    expect(session(w, w.tablet)).toBeNull();
    expect(attempt(w.db, R.recordOperatorPunch, w.tablet, { organizationId: w.org, action: "in", grantId: "tablet-1" })).toBeNull();
    expect(w.db.rows("punchEvent").map((e) => e.memberId)).toEqual([w.staff.memberId]);
    // A grant is the identity's own: another identity cannot use its id.
    expect(attempt(w.db, R.recordOperatorPunch, w.staff, { organizationId: w.org, action: "in", grantId: "tablet-2" }))
      .toBe("NO_OPERATOR_SESSION");
  });

  test("expired grants are pruned on the next grant (the QR grant: sheets/server/device-login.test.ts)", () => {
    const w = world();
    guess(w, w.tablet, "3333", "old");
    w.db.advance(13n * 60n * MIN);
    guess(w, w.tablet, "2222", "new");
    expect(w.db.rows("deviceOperatorGrant").map((g) => g.key)).toEqual([`${w.tablet.identity.hex}:new`]);
  });

  test("recordSelfPunch punches the caller's own membership; the service identity has none", () => {
    const w = world();
    expect(attempt(w.db, R.recordSelfPunch, w.staff, { organizationId: w.org, action: "in" })).toBeNull();
    expect(w.db.rows("punchEvent")[0]).toMatchObject({ memberId: w.staff.memberId });
    registerServiceIdentity(w.db);
    expect(attempt(w.db, R.recordSelfPunch, SERVICE_IDENTITY as unknown as FakeMember, { organizationId: w.org, action: "in" }))
      .toContain("Not a member");
  });
});

describe("setting a punch code", () => {
  const codeOf = (w: World, m: FakeMember) => w.db.find("memberPunchCode", m.memberId)?.code ?? null;

  test("setOwnPunchInCode: in_use leaves the code unchanged and counts; a free code is set and does not", () => {
    const w = world();
    const set = (code: string) => {
      w.db.run(R.setOwnPunchInCode, w.tablet, { organizationId: w.org, code, requestId: code });
      return result(w, w.tablet)?.outcome;
    };
    expect(set("3333")).toBe("in_use");
    expect(codeOf(w, w.tablet)).toBeNull();
    expect(set("4444")).toBe("ok");
    expect(codeOf(w, w.tablet)).toBe("4444");
    expect(w.db.member(w.tablet).hasPunchCode).toBe(true);
    for (let i = 0; i < FREE - 1; i++) set("2222");
    expect(set("1111")).toBe("in_use");          // the PIN_FREE_FAILURES-th in-use answer locks
    expect(set("6000")).toBe("locked");
    expect(codeOf(w, w.tablet)).toBe("4444");
  });

  test("onboarding a whole store sets free codes without a count, an alert or the store-wide pause", () => {
    const w = world();
    const staff = Array.from({ length: PIN_ORG_LOCK_FAILURES + 5 }, (_, i) => w.db.addMember({ organizationId: w.org, displayName: `s${i}` }));
    staff.forEach((m, i) => w.db.run(R.setOwnPunchInCode, m, { organizationId: w.org, code: String(5000 + i), requestId: "r" }));
    expect(staff.every((m) => result(w, m)?.outcome === "ok")).toBe(true);
    expect(w.db.rows("pinAttemptCounter")).toHaveLength(0);
    expect(w.db.rows("notification").filter((n) => n.type === "security")).toHaveLength(0);
  });

  test("setMemberPunchInCode: a team editor's in-use answer is counted; an owner's is not; others' codes need team.edit", () => {
    const w = world();
    const editor = w.db.addMember({ organizationId: w.org, displayName: "Ed", permissions: JSON.stringify({ team: { edit: true } }) });
    const set = (who: FakeMember, memberId: string, code: string) =>
      attempt(w.db, R.setMemberPunchInCode, who, { organizationId: w.org, memberId, code, requestId: code }) ?? result(w, who)?.outcome;
    expect(set(w.staff, w.tablet.memberId, "7777")).toContain("Cannot change another member");
    expect(set(editor, w.tablet.memberId, "7777")).toBe("ok");
    expect(codeOf(w, w.tablet)).toBe("7777");
    expect(w.db.rows("pinAttemptCounter")).toHaveLength(0);
    for (let i = 0; i < FREE; i++) expect(set(editor, w.tablet.memberId, "1111")).toBe("in_use");
    expect(set(editor, editor.memberId, "2222")).toBe("in_use");   // the last allowed miss: locks
    expect(set(editor, w.tablet.memberId, "3333")).toBe("locked");
    expect(codeOf(w, w.tablet)).toBe("7777");
    for (let i = 0; i < 10; i++) expect(set(w.owner, w.tablet.memberId, "3333")).toBe("in_use");
    const ownerKey = (k: Row) => String(k.key).endsWith(w.owner.memberId);
    expect(w.db.rows("pinAttemptCounter").some(ownerKey)).toBe(false);
  });

  test("old setPunchInCode: a team editor's or a member's in-use code is counted and returns unchanged; an owner still gets the error", () => {
    const w = world();
    const editor = w.db.addMember({ organizationId: w.org, displayName: "Ed", permissions: JSON.stringify({ team: { edit: true } }) });
    const self = { organizationId: w.org, memberId: w.tablet.memberId, code: "3333" };
    expect(attempt(w.db, M.setPunchInCode, w.tablet, self)).toBeNull();
    expect(codeOf(w, w.tablet)).toBeNull();
    expect(w.db.rows("pinAttemptCounter").length).toBe(2);
    // A free code is set and not counted.
    expect(attempt(w.db, M.setPunchInCode, w.tablet, { ...self, code: "4444" })).toBeNull();
    expect(codeOf(w, w.tablet)).toBe("4444");
    expect(w.db.rows("pinAttemptCounter").find((r) => String(r.key).endsWith(w.tablet.memberId))?.failures).toBe(1);
    // A team editor probing a colleague's PIN through anyone's code: counted, never an error.
    for (let i = 0; i < PIN_FREE_FAILURES; i++) expect(attempt(w.db, M.setPunchInCode, editor, { ...self, code: "1111" })).toBeNull();
    expect(codeOf(w, w.tablet)).toBe("4444");
    expect(attempt(w.db, M.setPunchInCode, editor, { ...self, code: "2222" })).toBe("PIN_LOCKED");
    expect(attempt(w.db, M.setPunchInCode, w.owner, self)).toBe("Code already in use at this store");
    expect(attempt(w.db, M.setPunchInCode, w.owner, { ...self, code: "7777" })).toBeNull();
    expect(codeOf(w, w.tablet)).toBe("7777");
    // Clearing tests nothing and is never limited.
    for (let i = 0; i < FREE; i++) attempt(w.db, M.setPunchInCode, w.tablet, { ...self, code: "2222" });
    expect(attempt(w.db, M.setPunchInCode, w.tablet, { ...self, code: "8888" })).toBe("PIN_LOCKED");
    expect(attempt(w.db, M.setPunchInCode, w.tablet, { ...self, code: undefined })).toBeNull();
  });
});

describe("only an account allowed to run a store device logs people in and punches for them", () => {
  test("staff without the store device permission are refused; owners, managers and permitted staff are not", () => {
    const w = world();
    const denied = "[store_device]";
    expect(attempt(w.db, R.resolveDeviceOperatorAttempt, w.plain, { organizationId: w.org, code: "3333", requestId: "p" })).toContain(denied);
    expect(session(w, w.plain)).toBeNull();
    expect(attempt(w.db, R.recordOperatorPunch, w.plain, { organizationId: w.org, action: "in", grantId: "p" })).toContain(denied);
    expect(attempt(w.db, M.resolveDeviceOperator, w.plain, { organizationId: w.org, code: "3333" })).toContain(denied);
    expect(attempt(w.db, M.recordPunch, w.plain, { organizationId: w.org, code: "3333", action: "in" })).toContain(denied);
    for (const who of [w.owner, w.manager, w.tablet]) {
      expect(attempt(w.db, R.resolveDeviceOperatorAttempt, who, { organizationId: w.org, code: "3333", requestId: "ok" })).toBeNull();
      expect(session(w, who)).toMatchObject({ memberId: w.staff.memberId });
    }
  });

  test("a grant written before the account lost the permission punches nobody", () => {
    const w = world();
    w.db.run(R.resolveDeviceOperatorAttempt, w.tablet, { organizationId: w.org, code: "3333", requestId: "g" });
    w.db.patch("orgMember", w.tablet.memberId, { permissions: "{}" });
    expect(attempt(w.db, R.recordOperatorPunch, w.tablet, { organizationId: w.org, action: "in", grantId: "g" })).toContain("[store_device]");
  });
});

describe("clearPinLockouts", () => {
  test("an owner or manager clears the store's locks; staff may not", () => {
    const w = world();
    for (let i = 0; i < PIN_FREE_FAILURES; i++) guess(w, w.tablet, wrong(i));
    expect(attempt(w.db, R.clearPinLockouts, w.staff, { organizationId: w.org })).toContain("owner or manager");
    expect(attempt(w.db, R.clearPinLockouts, w.manager, { organizationId: w.org })).toBeNull();
    expect(w.db.rows("pinAttemptCounter")).toHaveLength(0);
    guess(w, w.tablet, "3333");
    expect(result(w, w.tablet)?.outcome).toBe("ok");
  });

  test("a manager unlocks the store but never their own guessing; an owner clears everything; each clear is announced", () => {
    const w = world();
    for (let i = 0; i < PIN_FREE_FAILURES; i++) guess(w, w.manager, wrong(i));
    for (let i = 0; i < PIN_FREE_FAILURES; i++) guess(w, w.tablet, wrong(100 + i));
    const before = w.db.rows("notification").length;
    expect(attempt(w.db, R.clearPinLockouts, w.manager, { organizationId: w.org })).toBeNull();
    expect(w.db.rows("pinAttemptCounter").map((r) => r.key)).toEqual([`${w.org}:${w.manager.memberId}`]);
    guess(w, w.manager, "1111");
    expect(result(w, w.manager)?.outcome).toBe("locked");
    guess(w, w.tablet, "3333");
    expect(result(w, w.tablet)?.outcome).toBe("ok");
    const cleared = w.db.rows("notification").slice(before).filter((n) => n.title === "PIN entry unlocked");
    expect(cleared.map((n) => n.targetId)).toEqual(expect.arrayContaining([w.owner.identity, w.manager.identity]));
    expect(String(cleared[0].body)).toContain("Max");
    expect(attempt(w.db, R.clearPinLockouts, w.owner, { organizationId: w.org })).toBeNull();
    expect(w.db.rows("pinAttemptCounter")).toHaveLength(0);
  });
});
