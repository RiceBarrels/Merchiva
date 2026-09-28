// The management-visibility notice (components/drive/notice/*) and the Drive actor (drive-actor.tsx,
// use-drive-data.ts). Pure rules run here; mock.module would leak into other test files, so the React
// checks run in child `bun test` processes of THIS file (NOTICE_ACK_SCENARIO; file-type-filter.test.ts's
// pattern): `hooks` renders with ink-testing-library (effects run) against a fake connection, `render`
// server-renders the gates with the hook, the dialog primitives and the buttons mocked.

import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SELF = "./scripts/tests/drive/notice-ack.test.ts";
const SCENARIO = process.env.NOTICE_ACK_SCENARIO ?? "";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = uuid(900);
const NOTICE = "drive_management_v1";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400 && !check(); i++) await sleep(5);
  if (!check()) throw new Error(`timed out waiting for ${what}`);
}

if (SCENARIO === "") {
  const [{ noticeAckState, noticeLocalKey, nextAckRetryDelay, startAckRetryLoop, guardNoticeOpenChange, liteNoticeGate }, { canonicalMemberId, memberGatePermissions }] =
    await Promise.all([import("@/components/drive/notice/notice-ack-state"), import("@/components/drive/drive-actor")]);

  describe("noticeAckState", () => {
    const base = { rows: [], rowsReady: true, memberId: uuid(1), surface: "manager", localAck: false, published: true } as const;
    const row = (patch: Partial<{ memberId: string; notice: string; surface: string }> = {}) => ({ memberId: uuid(1), notice: NOTICE, surface: "manager", ...patch });
    const pick = (s: ReturnType<typeof noticeAckState>) => [s.ready, s.needsAck, s.needsServerWrite];
    test("the matrix", () => {
      expect(pick(noticeAckState({ ...base, memberId: null }))).toEqual([false, false, false]); // member unknown
      expect(pick(noticeAckState({ ...base, rowsReady: false }))).toEqual([false, false, false]); // still subscribing
      expect(pick(noticeAckState(base))).toEqual([true, true, false]); // nothing yet: ask
      expect(pick(noticeAckState({ ...base, rowsReady: false, published: false }))).toEqual([true, true, false]); // no Drive module
      expect(pick(noticeAckState({ ...base, published: false, localAck: true }))).toEqual([true, false, false]); // local only, nothing to send
      expect(pick(noticeAckState({ ...base, localAck: true }))).toEqual([true, false, true]); // local only: re-send
      expect(pick(noticeAckState({ ...base, rowsReady: false, localAck: true }))).toEqual([true, false, false]); // offline, acked here
      const server = noticeAckState({ ...base, rows: [row()] });
      expect([server.serverAck, ...pick(server)]).toEqual([true, true, false, false]);
      expect(pick(noticeAckState({ ...base, rows: [row()], localAck: true }))).toEqual([true, false, false]);
      // An id read through toHexString (no dashes, upper case) still matches.
      expect(noticeAckState({ ...base, rows: [row({ memberId: uuid(1).replace(/-/g, "").toUpperCase() })] }).serverAck).toBe(true);
    });
    test("an acknowledgement counts for its own member, notice and surface only", () => {
      for (const other of [row({ surface: "store" }), row({ surface: "personal" }), row({ notice: "drive_management_v0" }), row({ memberId: uuid(2) })]) {
        expect(pick(noticeAckState({ ...base, rows: [other] }))).toEqual([true, true, false]);
      }
      expect(noticeAckState({ ...base, surface: "store", rows: [row({ surface: "store" })] }).needsAck).toBe(false);
      expect(noticeLocalKey(ORG, uuid(1), "store")).toBe(`merchiva_drive_notice:${NOTICE}:store:${ORG}:${uuid(1)}`);
      expect(new Set((["manager", "store", "personal"] as const).map((s) => noticeLocalKey(ORG, uuid(1), s))).size).toBe(3);
    });
  });

  test("the retry loop re-sends after each delay, and stops once the row is there or on stop()", async () => {
    expect([0, 1, 2, 3, 4, 9, -1, Number.NaN].map(nextAckRetryDelay)).toEqual([5_000, 15_000, 60_000, 300_000, 300_000, 300_000, 5_000, 5_000]);
    {
      const timers: Array<{ run: () => void; ms: number; cleared: boolean }> = [];
      const scheduler = { set: (run: () => void, ms: number) => timers.push({ run, ms, cleared: false }) - 1, clear: (h: unknown) => void (timers[h as number].cleared = true) };
      let [sends, fail, pending] = [0, true, true];
      const fire = () => (timers.at(-1)!.run(), sleep(1));
      const stop = startAckRetryLoop({ send: async () => { sends += 1; if (fail) throw new Error("[drive.network]"); }, pending: () => pending, scheduler });
      expect([timers.map((t) => t.ms), sends]).toEqual([[5_000], 0]); // the caller just sent one
      await fire();
      expect([timers.map((t) => t.ms), sends]).toEqual([[5_000, 15_000], 1]);
      fail = false;
      await fire(); // a sent write keeps the loop until the subscription shows the row
      expect([timers.map((t) => t.ms), sends]).toEqual([[5_000, 15_000, 60_000], 2]);
      pending = false;
      await fire();
      expect([timers.length, sends]).toEqual([3, 2]);
      stop();
      const again = startAckRetryLoop({ send: async () => { sends += 1; }, pending: () => true, scheduler });
      again();
      expect(timers.at(-1)!.cleared).toBe(true);
      await fire();
      expect([timers.length, sends]).toEqual([4, 2]);
    }
  });

  test("the lite gate keeps the app mounted for its person while ready drops (a reconnect); another person is asked", () => {
    const [A, B] = [noticeLocalKey(ORG, uuid(1), "store"), noticeLocalKey(ORG, uuid(2), "store")];
    // One gate over time: each step feeds the scope the previous one kept, as the component's state does.
    let kept: string | null = null;
    const step = (ready: boolean, needsAck: boolean, scope: string | null) => {
      const gate = liteNoticeGate({ ready, needsAck, scope }, kept);
      kept = gate.clearedScope;
      return gate.view;
    };
    expect(step(false, false, null)).toBe("loading"); // before anything is known
    expect(step(false, false, A)).toBe("loading");
    expect(step(true, true, A)).toBe("notice"); // not acknowledged yet: blocked
    expect(step(false, false, A)).toBe("loading"); // before the first acknowledgement a drop still blocks
    expect(step(true, false, A)).toBe("app"); // acknowledged (here or on another device)
    expect(step(false, false, A)).toBe("app"); // reconnect: the ack rows re-subscribe
    expect(step(false, false, null)).toBe("app"); // ... and the member is unknown for a moment
    expect(step(true, true, A)).toBe("app"); // a local ack gone while the server row is on its way
    expect(step(true, false, A)).toBe("app");
    // Another operator signs in on the tablet: gated until their own acknowledgement, and a drop no longer lets them in.
    expect(step(false, false, B)).toBe("loading");
    expect(step(false, false, null)).toBe("loading");
    expect(step(true, true, B)).toBe("notice");
    expect(step(true, false, B)).toBe("app");
    expect(step(false, false, B)).toBe("app");
    // No scope at all (a caller without one): the plain rule, nothing kept.
    expect([liteNoticeGate({ ready: true, needsAck: false }, null), liteNoticeGate({ ready: false, needsAck: false }, null)]).toEqual([
      { view: "app", clearedScope: null }, { view: "loading", clearedScope: null },
    ]);
  });

  test("the blocking dialog cancels every close request; the info dialog closes", () => {
    for (const reason of ["escape-key", "outside-press", "focus-out", "close-press", "imperative-action", "none"]) {
      const calls: boolean[] = [];
      let cancelled = 0;
      guardNoticeOpenChange("acknowledge", (open) => calls.push(open))(false, { reason, cancel: () => void (cancelled += 1) });
      expect([calls, cancelled]).toEqual([[], 1]);
      guardNoticeOpenChange("info", (open) => calls.push(open))(false, { reason, cancel: () => void (cancelled += 1) });
      expect([calls, cancelled]).toEqual([[false], 1]);
    }
  });

  test("member ids and permissions are read the way the module reads them", () => {
    expect([canonicalMemberId(uuid(7).replace(/-/g, "").toUpperCase()), canonicalMemberId(" Member-1 "), canonicalMemberId("")]).toEqual([uuid(7), "member-1", null]);
    for (const raw of ["not json", ""]) expect(memberGatePermissions(raw)).toEqual({ dashboard: { view: true }, drive: { view: false, edit: false } });
    expect(memberGatePermissions('{"dashboard":{"view":false},"drive":{"view":true}}')).toEqual({ dashboard: { view: false }, drive: { view: true, edit: false } });
    expect(memberGatePermissions('{"drive":{"edit":true,"view":"yes"}}')).toEqual({ dashboard: { view: true }, drive: { view: false, edit: true } });
  });

  describe("React (isolated children)", () => {
    for (const scenario of ["hooks", "render"]) {
      test(scenario, () => {
        const env = { ...process.env, NOTICE_ACK_SCENARIO: scenario };
        const proc = Bun.spawnSync([process.execPath, "test", SELF], { cwd: ROOT, env, stdout: "pipe", stderr: "pipe" });
        const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
        if (proc.exitCode !== 0) console.error(output);
        expect(proc.exitCode).toBe(0);
        expect(output).toMatch(/[1-9]\d* pass/);
        expect(output).toContain(" 0 fail");
      }, 60_000);
    }
  });
}

// ── hooks: ink (effects run) against a fake connection ─────────────────────────────────────────
if (SCENARIO === "hooks") {
  type Row = Record<string, unknown>;
  type Predicate = { column: string; value: string };
  const [M1, M2, M3] = [uuid(1), uuid(2), uuid(3)];
  const [identity, other] = ["identity-1", "identity-2"].map((hex) => ({ toHexString: () => hex, toString: () => hex }));
  // A uuid as the SDK decodes it: toString() is hyphenated, toHexString() is not.
  const sdkUuid = (id: string) => ({ __uuid__: true, toString: () => id, toHexString: () => id.replace(/-/g, "") });
  const member = (id: string, role: string, userId: unknown, permissions = "{}") =>
    ({ id: sdkUuid(id), organizationId: ORG, status: "active", role, userId, permissions, displayName: `name ${id.slice(-1)}`, email: "" });
  const doc = (n: number, visibility: string, ownerMemberId: string): Row =>
    ({ id: uuid(n), organizationId: ORG, ownerMemberId, title: `doc ${n}`, visibility, createdAt: new Date(0), updatedAt: new Date(n) });
  const ackRow = (memberId: string, surface: string): Row =>
    ({ id: `${memberId}:${NOTICE}:${surface}`, organizationId: ORG, memberId, notice: NOTICE, surface, userId: identity, acknowledgedAt: new Date() });
  const ROWS: Record<string, Row[]> = {
    orgMember: [], driveNoticeAck: [], documentStar: [], driveUsage: [], driveStar: [],
    driveItem: [
      { id: uuid(101), organizationId: ORG, kind: "folder", status: "ready", space: "store", ownerMemberId: M3, parentId: "", name: "Shared" },
      { id: uuid(102), organizationId: ORG, kind: "file", status: "ready", space: "my", ownerMemberId: M2, parentId: "", name: "p.png", mimeType: "image/png" },
    ],
    document: [doc(201, "org_edit", M3), doc(202, "private", M2), doc(203, "private", M2)],
    documentFile: [201, 202, 203].map((n) => ({ documentId: uuid(n), organizationId: ORG, fileType: "doc", folderId: "", updatedAt: new Date(n) })),
    documentAccess: [{ id: "g1", documentId: uuid(203), organizationId: ORG, memberId: M1, role: "viewer" }],
  };
  let version = 0;
  const setAccount = (role: string, permissions?: string) =>
    ((ROWS.orgMember = [member(M1, role, identity, permissions), member(M2, "staff", other), member(M3, "staff", other)]), (version += 1));
  const PERMS: { role: string; permissions: Row; organizationId: string } = { role: "owner", permissions: {}, organizationId: ORG };
  const OPENED_NONE = new Map<string, number>();

  // Retry timers (5 s and up) are recorded instead of scheduled; shorter ones run for real.
  type Timer = { run: () => void; ms: number; cleared: boolean; fired: boolean };
  const timers: Timer[] = [];
  const [realSet, realClear] = [globalThis.setTimeout, globalThis.clearTimeout];
  globalThis.setTimeout = ((run: () => void, ms = 0, ...rest: unknown[]) =>
    ms < 5_000 ? realSet(run, ms, ...rest) : timers[timers.push({ run, ms, cleared: false, fired: false }) - 1]) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((handle: Timer) =>
    timers.includes(handle) ? void (handle.cleared = true) : realClear(handle as never)) as unknown as typeof clearTimeout;
  const liveTimers = () => timers.filter((t) => !t.cleared && !t.fired);
  const fire = (timer: Timer) => ((timer.fired = true), timer.run());
  const storage = new Map<string, string>();
  const localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) };
  Object.assign(globalThis, { window: { localStorage, addEventListener() {}, removeEventListener() {} } });

  const ackCalls: Row[] = [];
  let failNext = 0;
  const makeConn = (drive: boolean) => ({
    isActive: true,
    subscriptionBuilder() { // applies at once, or fails on drive_* tables for a module without Drive
      const cb: { applied?: (ctx: unknown) => void; failed?: (ctx: unknown, error: unknown) => void } = {};
      const builder = {
        onApplied: (f: typeof cb.applied) => ((cb.applied = f), builder),
        onError: (f: typeof cb.failed) => ((cb.failed = f), builder),
        subscribe(queries: string[]) {
          const missing = !drive && queries.some((sql) => sql.includes("drive_"));
          queueMicrotask(() => (missing ? cb.failed?.({}, new Error("no such table: `drive_item`")) : cb.applied?.({})));
          return { unsubscribe() {}, isActive: () => false };
        },
      };
      return builder;
    },
    reducers: {
      refreshMyDriveAccess: async () => {},
      acknowledgeDriveNotice: async (args: Row) => {
        ackCalls.push(args);
        if (failNext-- > 0) throw new Error("[drive.network] offline");
      },
    },
  });
  const state = { conn: makeConn(true) };

  const fakeTable = (accessor: string) => ({
    __accessor: accessor,
    where(build: (row: Record<string, { eq(value: string): Predicate }>) => Predicate) {
      const row = new Proxy({}, { get: (_t, column) => ({ eq: (value: string) => ({ column: String(column), value }) }) });
      return { __accessor: accessor, predicate: build(row) };
    },
  });
  const ACCESSORS = ["orgMember", "document", "documentUpdate", "documentSnapshot", "documentPresence", "documentComment",
    "documentVersion", "documentStar", "documentAccess", "documentFile", "driveItem", "driveUsage", "driveStar", "driveNoticeAck"];
  const cache = new Map<string, Row[]>();
  const React = await import("react");
  const noSubscribe = () => () => {};
  mock.module("spacetimedb/react", () => ({
    useSpacetimeDB: () => ({ isActive: true, getConnection: () => state.conn, identity }),
    // useTable as dist/react/index.mjs has it: the snapshot sits in a ref only an effect clears, so the render that
    // enables (or changes) a query still returns the previous snapshot, `[[], true]` after a disabled one; `applied`
    // starts false per instance and turns true once the subscription applies.
    useTable: (query: { __accessor: string; predicate?: Predicate }, opts?: { enabled?: boolean }) => {
      const enabled = opts?.enabled ?? true;
      const { column = "", value = "" } = query.predicate ?? {};
      const sql = `${query.__accessor}:${column}:${value}`;
      const [applied, setApplied] = React.useState(false);
      const last = React.useRef<readonly [Row[], boolean] | null>(null);
      const compute = React.useCallback((): readonly [Row[], boolean] => {
        if (!enabled) return [[], true];
        const key = `${sql}:${version}`;
        if (!cache.has(key)) cache.set(key, (ROWS[query.__accessor] ?? []).filter((r) => !column || r[column] === value));
        return [cache.get(key)!, applied];
      }, [enabled, sql, applied, version]); // eslint-disable-line react-hooks/exhaustive-deps
      React.useEffect(() => void (last.current = null), [compute]);
      React.useEffect(() => {
        if (!enabled) return setApplied(false);
        let live = true;
        queueMicrotask(() => live && setApplied(true));
        return () => void (live = false);
      }, [enabled, sql]);
      const getSnapshot = React.useCallback(() => (last.current ??= compute()), [compute]);
      return React.useSyncExternalStore(noSubscribe, getSnapshot, getSnapshot);
    },
    useReducer: () => async () => {},
  }));
  mock.module("@/lib/spacetimedb/generated", () => ({ tables: Object.fromEntries(ACCESSORS.map((a) => [a, fakeTable(a)])), reducers: {} }));
  mock.module("@/lib/context/permissions", () => ({ usePermissions: () => PERMS }));
  mock.module("@/lib/docs/recent", () => ({ useLastOpenedMap: () => OPENED_NONE }));
  mock.module("@/lib/auth/context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

  test("acknowledgements per surface, the retry loop, the actor", async () => {
    const [{ createElement: h, Fragment }, { render }, client, { useManagementNoticeAck }, actorMod, { useDriveData }, { noticeLocalKey }, { useDriveBackendStatus }, { mapDocument }] =
      await Promise.all([
        import("react"), import("ink-testing-library"), import("@/lib/spacetimedb/client"), import("@/components/drive/notice/use-notice-ack"),
        import("@/components/drive/drive-actor"), import("@/components/drive/use-drive-data"), import("@/components/drive/notice/notice-ack-state"),
        import("@/lib/spacetimedb/hooks/useDrive"), import("@/lib/docs/mappers"),
      ]);
    client.setConnection(state.conn as never);
    type Seen = { ack: ReturnType<typeof useManagementNoticeAck>; actor: ReturnType<typeof actorMod.useDriveActor>; status: string };
    const seen = new Map<string, Seen>();
    const data = new Map<string, ReturnType<typeof useDriveData>>();
    const AckProbe = ({ name }: { name: string }) =>
      (seen.set(name, { ack: useManagementNoticeAck(), actor: actorMod.useDriveActor(), status: useDriveBackendStatus() }), null);
    const DataProbe = ({ name }: { name: string }) => (data.set(name, useDriveData()), null);
    const get = (name: string) => seen.get(name) as Seen;
    const panel = (surface: "store" | "personal", id: string, ...children: ReturnType<typeof h>[]) =>
      h(actorMod.DriveActorProvider, { member: { id, displayName: "", role: "staff", userIdHex: null, punchInCode: null }, surface }, ...children);
    const sent = (surface: string, actingMemberId: string) => ({ organizationId: ORG, notice: NOTICE, surface, actingMemberId });
    const serverAck = (memberId: string, surface: string) => (ROWS.driveNoticeAck.push(ackRow(memberId, surface)), (version += 1));

    // Both probes start over (a fresh connection): the render that enables a subscription still gets the disabled
    // snapshot, ready with no rows. Staff-account tablet, operator M3 acknowledged on the server only: no render may
    // ask again, and the actor may never be ready with a ceiling that lacks the account's grant on doc 203.
    serverAck(M3, "store");
    setAccount("staff", '{"dashboard":{"view":true}}');
    Object.assign(PERMS, { role: "staff", permissions: { dashboard: { view: true } } });
    const doc203 = mapDocument(ROWS.document[2]);
    const trace: string[] = [];
    const TraceProbe = () => {
      const [ack, actor, status] = [useManagementNoticeAck(), actorMod.useDriveActor(), useDriveBackendStatus()];
      const ceiling = actor.ready ? (actor.ceiling?.doc(doc203).role ?? "no-ceiling") : "-";
      return (trace.push(`${status} ack:${ack.ready ? (ack.needsAck ? "ask" : "done") : "-"} ceiling:${ceiling}`), null);
    };
    let app = render(panel("store", M3, h(TraceProbe)));
    await until(() => trace.at(-1) === "ready ack:done ceiling:viewer", "the fresh store panel");
    expect([trace[0], trace.filter((t) => / ack:ask| ceiling:none/.test(t))]).toEqual(["checking ack:- ceiling:-", []]);
    app.unmount();
    Object.assign(PERMS, { role: "owner", permissions: {} });

    // /manager, two consumers of one notice; the member id is hyphenated although the row's toHexString drops the
    // dashes. A fresh element each time: rerendering the same element object would skip the probes.
    setAccount("owner");
    const managerTree = () => h(Fragment, null, h(AckProbe, { name: "a" }), h(AckProbe, { name: "b" }));
    app = render(managerTree());
    await until(() => !!seen.get("a")?.ack.ready && !!seen.get("b")?.ack.ready, "the manager's acknowledgement state");
    expect([get("a").ack.needsAck, get("b").ack.needsAck]).toEqual([true, true]);
    expect(get("a").ack.scope).toBe(noticeLocalKey(ORG, M1, "manager")); // what a lite gate keeps the app mounted for
    expect(get("a").actor).toMatchObject({ memberId: M1, actingMemberId: "", acting: false, surface: "manager", ceiling: null, canViewAll: true, ready: true });
    failNext = 1;
    await get("a").ack.acknowledge(); // the write fails: it resolves anyway, the gate lifts, a loop re-sends
    expect(ackCalls).toEqual([sent("manager", "")]);
    expect(storage.get(noticeLocalKey(ORG, M1, "manager"))).toBe("1");
    await until(() => !get("a").ack.needsAck && !get("b").ack.needsAck && liveTimers().length > 0, "the local acknowledgement");
    expect(liveTimers().map((t) => t.ms)).toEqual([5_000]); // one loop for both consumers
    fire(liveTimers()[0]);
    await until(() => ackCalls.length === 2 && liveTimers().length === 1, "the first re-send");
    const waiting = liveTimers()[0];
    expect([waiting.ms, ackCalls[1]]).toEqual([15_000, sent("manager", "")]);
    serverAck(M1, "manager"); // the server row arrives
    app.rerender(managerTree());
    await until(() => liveTimers().length === 0, "the loop to stop");
    expect(waiting.cleared).toBe(true);
    await (waiting.run(), sleep(20));
    expect([ackCalls.length, get("a").ack.needsAck]).toEqual([2, false]);
    app.unmount();

    // /store on an owner-account tablet, operator M2: their /manager acknowledgement doesn't cover the tablet.
    serverAck(M2, "manager");
    Object.assign(PERMS, { role: "staff", permissions: { dashboard: { view: true }, drive: { view: true } } });
    app = render(panel("store", M2, h(AckProbe, { name: "s" })));
    await until(() => !!seen.get("s")?.ack.ready && get("s").actor.ready, "the store panel");
    expect(get("s").ack.needsAck).toBe(true);
    expect(get("s").actor).toMatchObject({ memberId: M2, actingMemberId: M2, acting: true, surface: "store", ceiling: null, canViewAll: true, canEditAll: false });
    await get("s").ack.acknowledge();
    expect(ackCalls.at(-1)).toEqual(sent("store", M2));
    await until(() => liveTimers().length === 1, "the store retry loop");
    app.unmount(); // leaving releases the loop
    expect(liveTimers()).toEqual([]);

    // /personal with a local acknowledgement but no server row: the loop starts on mount, acting for no one.
    storage.set(noticeLocalKey(ORG, M3, "personal"), "1");
    app = render(panel("personal", M3, h(AckProbe, { name: "p" })));
    await until(() => !!seen.get("p")?.ack.ready && liveTimers().length === 1, "the personal panel");
    expect([get("p").ack.needsAck, get("p").actor.acting, get("p").actor.actingMemberId]).toEqual([false, false, ""]);
    fire(liveTimers()[0]);
    await until(() => ackCalls.length === 4, "the re-send on mount");
    expect(ackCalls.at(-1)).toEqual(sent("personal", ""));
    app.unmount();

    // A staff-account tablet: the operator's rights are capped by the account's (the module's intersection).
    setAccount("staff", '{"dashboard":{"view":true}}');
    Object.assign(PERMS, { role: "staff", permissions: { dashboard: { view: true }, drive: { view: true, edit: true } } });
    app = render(panel("store", M2, h(AckProbe, { name: "t" }), h(DataProbe, { name: "d" })));
    await until(() => !!seen.get("t")?.actor.ready && !!data.get("d")?.isReady, "the staff tablet");
    const { ceiling, canViewAll, canEditAll } = get("t").actor;
    expect([canViewAll, canEditAll, ceiling !== null]).toEqual([false, false, true]);
    const drive = data.get("d")!;
    const item = (id: string) => drive.drive.itemsById.get(id)!;
    expect([ceiling!.item(item(uuid(101))).role, ceiling!.item(item(uuid(102))).role]).toEqual(["contributor", "none"]);
    const docs = new Map(drive.drive.documents.map((d) => [d.id, d]));
    expect([201, 202, 203].map((n) => ceiling!.doc(docs.get(uuid(n))!).role)).toEqual(["editor", "none", "viewer"]);
    expect(drive.tree.entries.map((e) => e.key).sort()).toEqual([`doc:${uuid(201)}`, `doc:${uuid(203)}`, `item:${uuid(101)}`]);
    expect([drive.tree.byKey.get(`doc:${uuid(203)}`)!.access.canTrash, drive.memberNames.get(M3)]).toEqual([false, "name 3"]);
    expect(drive.listingActor).toEqual({ memberId: M2, canViewAll: false, canEditAll: false });
    app.unmount();

    // A module without Drive: the local acknowledgement alone, nothing sent, no loop.
    state.conn = makeConn(false);
    const before = ackCalls.length;
    app = render(panel("personal", M2, h(AckProbe, { name: "u" })));
    // The monitor reports the previous connection's answer until the new probe settles.
    await until(() => seen.get("u")?.status === "not_published" && get("u").ack.ready, "the unpublished state");
    expect(get("u").ack.needsAck).toBe(true);
    await get("u").ack.acknowledge();
    await until(() => !get("u").ack.needsAck, "the local acknowledgement");
    await sleep(20);
    expect([ackCalls.length - before, liveTimers().filter((t) => t.ms === 5_000)]).toEqual([0, []]);
    app.unmount();
  }, 30_000);
}

// ── render: the gates, server-rendered with the hook and the primitives mocked ─────────────────
if (SCENARIO === "render") {
  const { createElement: h } = await import("react");
  type Props = Record<string, unknown> & { children?: import("react").ReactNode };
  type OpenChange = (open: boolean, details: { reason: string; cancel(): void }) => void;
  const notice = { ready: true, needsAck: true, acknowledge: async () => void (acks += 1) };
  let [acks, hookCalls] = [0, 0];
  const opened: string[] = [];
  const dialogs: Array<{ open: boolean; onOpenChange: OpenChange }> = [];
  const buttons: Array<{ label: string; onClick?: () => void }> = [];
  const box = (tag: string) => ({ children, ...rest }: Props) => h(tag, rest, children);
  const button = (label: string, onClick?: () => void) => (buttons.push({ label, onClick }), h("button", null, label));
  mock.module("@/components/drive/notice/use-notice-ack", () => ({ useManagementNoticeAck: () => ((hookCalls += 1), notice) }));
  mock.module("@/lib/i18n/context", () => ({ useT: () => (key: string) => `<${key}>` }));
  mock.module("@/components/docs/docs-open-context", () => ({ useDocsOpenUrl: () => (url: string) => void opened.push(url) }));
  mock.module("@/components/ui/alert-dialog", () => ({
    AlertDialog: ({ open, onOpenChange, children }: Props & { open: boolean; onOpenChange: OpenChange }) =>
      (dialogs.push({ open, onOpenChange }), open ? h("div", { "data-dialog": "" }, children) : null),
    AlertDialogContent: box("section"), AlertDialogHeader: box("header"), AlertDialogFooter: box("footer"),
    AlertDialogTitle: box("h2"), AlertDialogDescription: box("p"),
    AlertDialogCancel: ({ children }: Props) => button(String(children)),
  }));
  mock.module("@/components/ui/button", () => ({ Button: ({ children, onClick }: Props) => button(String(children), onClick as () => void) }));
  mock.module("@/components/device/apps/lite", () => ({
    LiteScreen: box("main"),
    LiteLoading: () => h("div", { "data-lite-loading": "" }),
    LiteButton: ({ label, onClick }: { label: string; onClick: () => void }) => button(label, onClick),
  }));
  const { renderToStaticMarkup } = await import("react-dom/server");
  const gates = await import("@/components/drive/notice/management-notice");
  const APP = h("p", null, "APP-CONTENT");
  const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(el).replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const press = (label: string) => buttons.findLast((b) => b.label === label)!.onClick!();

  test("the lite gate shows the notice instead of the app until acknowledged", async () => {
    Object.assign(notice, { ready: true, needsAck: true });
    const gate = html(h(gates.LiteNoticeGate, null, APP));
    expect(gate).toContain('data-drive-notice="lite-gate"');
    for (const key of ["drive.disclosure.ackTitle", "drive.disclosure.title", "drive.disclosure.body", "device.lite.drive.noticeLeave"]) expect(gate).toContain(`<${key}>`);
    expect(gate).not.toContain("APP-CONTENT");
    press("<drive.disclosure.ackConfirm>");
    await sleep(1);
    expect(acks).toBe(1);

    Object.assign(notice, { ready: false, needsAck: false });
    const loading = html(h(gates.LiteNoticeGate, null, APP));
    expect([loading.includes("data-lite-loading"), loading.includes("APP-CONTENT"), loading.includes("lite-gate")]).toEqual([true, false, false]);

    // Acknowledged: the app renders, and a manager gate inside it stays away (the lite host gated already).
    Object.assign(notice, { ready: true, needsAck: false });
    hookCalls = 0;
    const dialogsBefore = dialogs.length;
    const app = html(h(gates.LiteNoticeGate, null, APP, h(gates.ManagementNoticeGate)));
    expect([app, hookCalls, dialogs.length - dialogsBefore]).toEqual(["<p>APP-CONTENT</p>", 1, 0]);
  });

  test("the manager gate blocks until one of its buttons is pressed", async () => {
    Object.assign(notice, { ready: true, needsAck: true });
    const gate = html(h(gates.ManagementNoticeGate));
    expect(gate).toContain('data-drive-notice="gate"');
    for (const key of ["ackTitle", "title", "body", "ackConfirm"]) expect(gate).toContain(`<drive.disclosure.${key}>`);
    expect(gate).toContain("<drive.home.noticeDecline>");
    const { open, onOpenChange } = dialogs.at(-1)!;
    expect(open).toBe(true);
    const cancelled: string[] = [];
    for (const reason of ["escape-key", "outside-press", "focus-out"]) onOpenChange(false, { reason, cancel: () => void cancelled.push(reason) });
    expect(cancelled).toEqual(["escape-key", "outside-press", "focus-out"]);
    press("<drive.home.noticeDecline>");
    expect(opened).toEqual(["/manager/dashboard"]);
    const declined: string[] = [];
    html(h(gates.ManagementNoticeGate, { onDecline: () => void declined.push("host") }));
    press("<drive.home.noticeDecline>");
    expect([declined, opened.length]).toEqual([["host"], 1]);
    const before = acks;
    press("<drive.disclosure.ackConfirm>");
    await sleep(1);
    expect(acks).toBe(before + 1);

    Object.assign(notice, { needsAck: false });
    expect([html(h(gates.ManagementNoticeGate)), dialogs.at(-1)!.open]).toEqual(["", false]);
  });

  test("the banner links to the notice, which closes normally", () => {
    const banner = html(h(gates.ManagementNoticeBanner, { compact: true, className: "px-4" }));
    for (const part of ['data-drive-notice="banner"', "<drive.disclosure.short>", "<drive.disclosure.learnMore>"]) expect(banner).toContain(part);
    const info = dialogs.at(-1)!;
    let cancelled = false;
    info.onOpenChange(false, { reason: "escape-key", cancel: () => void (cancelled = true) });
    expect([info.open, cancelled]).toEqual([false, false]);
  });
}
