// lib/spacetimedb/actions/sheets.ts, lib/sheets/sync/transport.ts and lib/spacetimedb/hooks/useSheets.ts (sheets.md
// §6, §7.1–§7.3). mock.module and the app-wide connection would leak into other files sharing this process, so each
// scenario runs in a child `bun test` of THIS file with SHEETS_DATA_LAYER_SCENARIO set (file-type-filter.test.ts's
// pattern):
//   server       the write wrappers + spacetimeSheetTransport against the REAL sheet and presence reducers
//                (helpers/sheet-server-harness.ts); argument names vs the generated bindings; offline / not published
//   hooks        useSheetsBackendStatus + useSheetVersionState over an SDK-faithful useTable: one row, per version id
//   pre-codegen  no sheet bindings: not_published, nothing subscribed
// The awareness framing, presence → peers, SheetPresence and the connection adapter run in-process in awareness.test.ts.

import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import type { DocPresenceRow } from "@/lib/docs/types";
import type { SheetSelection } from "@/lib/sheets/types";
import { decodeSheetAwareness } from "@/lib/sheets/sync/awareness";
import { SheetPresence } from "@/lib/sheets/sync/presence";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SELF = "./scripts/tests/sheets/sync-data-layer.test.ts";
const SCENARIO = process.env.SHEETS_DATA_LAYER_SCENARIO ?? "";
const DOC = "5b0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const SEL_A: SheetSelection = { sheetId: "sheet-1", startRow: 2, startColumn: 1, endRow: 5, endColumn: 3 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400 && !check(); i++) await sleep(5);
  if (!check()) throw new Error(`timed out waiting for ${what}`);
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected a rejection");
}

if (SCENARIO === "") {
  describe("isolated children", () => {
    for (const scenario of ["server", "hooks", "pre-codegen"]) {
      test(scenario, () => {
        const proc = Bun.spawnSync([process.execPath, "test", SELF], {
          cwd: ROOT, env: { ...process.env, SHEETS_DATA_LAYER_SCENARIO: scenario }, stdout: "pipe", stderr: "pipe",
        });
        const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
        if (proc.exitCode !== 0) console.error(output);
        expect(proc.exitCode).toBe(0);
        expect(output).toMatch(/[1-9]\d* pass/);
        expect(output).toContain(" 0 fail");
      }, 60_000);
    }
  });
}

// ── Child: write wrappers + transport against the real reducers ─────────────
if (SCENARIO === "server") {
  test("wrappers and transport against the real sheet and presence reducers", async () => {
    const [H, F, client, actions, { spacetimeSheetTransport: transport }, codec, { blankWorkbookData }, { UNIVER_LOCALE }, { SHEET_APP_VERSION }, { sheetErrorCode }, { docErrorCode }, { mapPresenceRow }] =
      await Promise.all([
        import("./helpers/sheet-server-harness"), import("../drive/fake-db"), import("@/lib/spacetimedb/client"),
        import("@/lib/spacetimedb/actions/sheets"), import("@/lib/sheets/sync/transport"), import("@/lib/sheets/codec"),
        import("@/lib/sheets/blank"), import("@/lib/sheets/univer-constants"), import("@/lib/sheets/constants"),
        import("@/lib/sheets/errors"), import("@/lib/docs/errors"), import("@/lib/docs/mappers"),
      ]);
    const P = F.loadModule(["upsertDocumentPresence", "removeDocumentPresence"], { Timestamp: F.FakeTimestamp });
    const { db, orgA } = H.createSheetWorld();
    const docId = H.newSheet(db, orgA.owner);
    type Client = { member: typeof orgA.staff; connection: InstanceType<typeof F.FakeIdentity> };
    const rawFor = (c: Client) => {
      const run = (fn: unknown) => async (args: Record<string, unknown>) => db.run(fn, c.member, args, { connectionId: c.connection });
      return { isActive: true, reducers: Object.fromEntries(Object.entries({ ...H.R, ...P }).map(([name, fn]) => [name, run(fn)])) };
    };
    const A: Client = { member: orgA.staff, connection: F.FakeIdentity.random() };
    const B: Client = { member: orgA.colleague, connection: F.FakeIdentity.random() };
    const [rawA, rawB] = [rawFor(A), rawFor(B)];
    const use = (raw: unknown) => client.setConnection(raw as never);
    const sessA = { documentId: docId.toUpperCase(), sessionId: "SESSION-A-0001" };
    const sessB = { documentId: docId, sessionId: "session-b-0001" };
    const lease = () => H.lease(db, docId);
    const updates = () => db.rows("documentUpdate").filter((r) => r.documentId === docId);

    // Lease, op log, compaction, versions and reset through the transport, as the session makes them.
    use(rawA);
    await actions.acquireSheetLease(sessA);
    expect([lease().holderMemberId, lease().holderSessionId, lease().holderConnectionId]).toEqual([A.member.memberId, "session-a-0001", A.connection.toHexString()]);
    const leaseEpoch = lease().epoch as bigint;
    await transport.heartbeatLease({ ...sessA, leaseEpoch });
    const payload = codec.encodeSheetOps({ v: 1, app: SHEET_APP_VERSION, seq: 1, ops: [] });
    const push = { ...sessA, leaseEpoch, seq: 1n, baseUpdateId: (db.find("documentSnapshot", docId)?.throughUpdateId as bigint) ?? 0n, payload };
    await transport.pushOps(push);
    await transport.pushOps(push); // the reply was lost: the retry stores nothing new
    expect(updates().map((u) => [u.sessionId, u.memberId, codec.decodeSheetOps(u.payload as Uint8Array).seq])).toEqual([["session-a-0001", A.member.memberId, 1]]);
    expect(sheetErrorCode(await rejection(transport.pushOps({ ...push, seq: 3n })))).toBe("sequence");
    const state = codec.encodeSheetSnapshot(blankWorkbookData({ name: "Budget", locale: UNIVER_LOCALE.EN_US, sheetName: "Sheet1" }));
    const through = updates()[0].id as bigint;
    await transport.compact({ ...sessA, leaseEpoch, throughUpdateId: through, state, plainText: "Sheet1", cellCount: 0 });
    expect([db.find("documentSnapshot", docId)?.throughUpdateId, updates().length]).toEqual([through, 0]);
    await transport.saveVersion({ ...sessA, leaseEpoch, kind: "named", name: "First", state, throughUpdateId: through, cellCount: 0 });
    const version = db.rows("documentVersion").find((v) => v.documentId === docId && v.name === "First");
    expect(db.find("documentVersionState", String(version?.id))?.state).toEqual(state);
    await transport.resetContent({ ...sessA, leaseEpoch, seq: 2n, state, plainText: "Reset", cellCount: 3 });
    expect([db.find("documentSnapshot", docId)?.plainText, lease().lastSeq]).toEqual(["Reset", 2n]);

    // A request, cancelled, made again, refused to write, declined.
    use(rawB);
    await actions.acquireSheetLease(sessB);
    expect(lease().requestedByMemberId).toBe(B.member.memberId);
    await actions.cancelSheetLeaseRequest(sessB);
    expect(lease().requestedByMemberId).toBe("");
    await actions.acquireSheetLease(sessB);
    expect(sheetErrorCode(await rejection(actions.pushSheetOps({ ...push, ...sessB })))).toBe("lease");
    use(rawA);
    await actions.declineSheetLeaseRequest({ ...sessA, leaseEpoch });
    expect(lease().requestedByMemberId).toBe("");

    // Presence: two sessions, server-pinned users, calibrated clocks, the holder's selection, withdrawal.
    const rows = () => db.rows("documentPresence").map(mapPresenceRow);
    const pa = new SheetPresence({ documentId: docId, user: { name: " Alice ", color: "#AA0000", memberId: "spoofed" }, transport, clientId: 101, throttleMs: 0, heartbeatMs: 600_000 });
    pa.setSelection(SEL_A);
    pa.start(A.connection.toHexString());
    await until(() => rows().length === 1, "A's presence row");
    use(rawB);
    const pb = new SheetPresence({ documentId: docId, user: { name: "Bo", color: "#00aa00", memberId: B.member.memberId }, transport, clientId: 202, throttleMs: 0, heartbeatMs: 600_000 });
    pb.start(B.connection.toHexString());
    await until(() => rows().length === 2, "B's presence row");
    for (const r of rows()) [pa, pb].forEach((p) => p.observe(r)); // the fake server clock is far from Date.now()
    expect(pa.peers(rows())).toEqual([
      { yClientId: 101, memberId: A.member.memberId, name: "Alice", color: "#aa0000", canEdit: true, isSelf: true },
      { yClientId: 202, memberId: B.member.memberId, name: "Bo", color: "#00aa00", canEdit: true, isSelf: false },
    ]);
    const mine = rows().find((r) => r.yClientId === 101) as DocPresenceRow;
    expect(decodeSheetAwareness(mine.awareness)?.state?.user).toEqual({ name: "Alice", color: "#aa0000", memberId: A.member.memberId });
    expect(pb.holderSelection(rows(), lease().holderConnectionId as string)?.selection).toEqual(SEL_A);
    use(rawA);
    await pa.stop();
    use(rawB);
    await pb.stop();
    expect(rows()).toEqual([]);
    use(rawA);
    await actions.releaseSheetLease(sessA);
    expect(lease().holderMemberId).toBe("");

    // Argument shapes: exactly the generated reducer parameters; ids lowercased, u32 clamped, empty name = none.
    const recorded: Array<[string, Record<string, unknown>]> = [];
    use({ isActive: true, reducers: new Proxy({}, { get: (_t, name) => async (args: Record<string, unknown>) => void recorded.push([String(name), args]) }) });
    const ids = { documentId: ` ${DOC.toUpperCase()} `, sessionId: "SESSION-X-0001" };
    const x = { leaseEpoch: 4n, state, plainText: "t" };
    await actions.acquireSheetLease({ ...ids, actingMemberId: "  op-1 " });
    await actions.heartbeatSheetLease({ ...ids, leaseEpoch: 4n, actingMemberId: null });
    await actions.releaseSheetLease(ids);
    await actions.declineSheetLeaseRequest({ ...ids, leaseEpoch: 4n });
    await actions.cancelSheetLeaseRequest(ids);
    await actions.pushSheetOps({ ...ids, leaseEpoch: 4n, seq: 9n, baseUpdateId: 0n, payload, actingMemberId: "op-1" });
    await actions.compactSheet({ ...ids, ...x, throughUpdateId: 8n, cellCount: -3 });
    await actions.resetSheetContent({ ...ids, ...x, seq: 10n, cellCount: 2 ** 40 });
    await actions.saveSheetVersion({ ...ids, ...x, kind: "named", name: "", throughUpdateId: 8n, cellCount: 7.9 });
    await transport.upsertPresence({ documentId: ids.documentId, yClientId: 5, name: "n", color: "#000000", awareness: new Uint8Array([1]) });
    await transport.removePresence(ids.documentId, 5);
    const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    for (const [name, args] of recorded) {
      const generated = (await import(join(ROOT, "lib/spacetimedb/generated", `${snake(name)}_reducer.ts`))).default as object;
      expect([name, Object.keys(args).sort()]).toEqual([name, Object.keys(generated).sort()]);
      expect([name, args.documentId, args.sessionId ?? "session-x-0001"]).toEqual([name, DOC, "session-x-0001"]);
    }
    expect(recorded.map(([name, a]) => [name, a.actingMemberId, a.cellCount, a.name])).toEqual([
      ["acquireSheetLease", "op-1", undefined, undefined], ["heartbeatSheetLease", "", undefined, undefined],
      ["releaseSheetLease", undefined, undefined, undefined], ["declineSheetLeaseRequest", "", undefined, undefined],
      ["cancelSheetLeaseRequest", undefined, undefined, undefined], ["pushSheetOps", "op-1", undefined, undefined],
      ["compactSheet", "", 0, undefined], ["resetSheetContent", "", 0xffff_ffff, undefined], ["saveSheetVersion", "", 7, undefined],
      ["upsertDocumentPresence", undefined, undefined, "n"], ["removeDocumentPresence", undefined, undefined, undefined],
    ]);
    expect([recorded[5][1].seq, recorded[5][1].leaseEpoch, recorded[5][1].payload]).toEqual([9n, 4n, payload]);
    for (const leaseEpochBad of [-1n, 2n ** 64n]) {
      expect(sheetErrorCode(await rejection(actions.heartbeatSheetLease({ ...ids, leaseEpoch: leaseEpochBad })))).toBe("invalid");
    }
    expect(recorded.length).toBe(11);

    // Offline: no connection, a connection that closes mid-call (never reused), a module without the reducers.
    client.clearConnection();
    const presenceArgs = { documentId: DOC, yClientId: 5, name: "n", color: "#000000", awareness: new Uint8Array([1]) };
    for (const call of [actions.acquireSheetLease(sessA), transport.upsertPresence(presenceArgs), transport.removePresence(DOC, 5)]) {
      expect(sheetErrorCode(await rejection(call))).toBe("offline");
    }
    const downs: Array<() => void> = [];
    const hang = () => new Promise<void>(() => {});
    use({ isActive: true, onDisconnect: (cb: () => void) => void downs.push(cb), reducers: { pushSheetOps: hang, upsertDocumentPresence: hang } });
    const inFlight = [actions.pushSheetOps(push), transport.upsertPresence(presenceArgs)];
    await settle();
    downs.forEach((cb) => cb());
    for (const call of inFlight) expect(sheetErrorCode(await rejection(call))).toBe("offline");
    expect(sheetErrorCode(await rejection(actions.pushSheetOps(push)))).toBe("offline");
    use({ isActive: true, reducers: {} });
    const unpublished = await rejection(actions.acquireSheetLease(sessA));
    expect([docErrorCode(unpublished), unpublished.message.includes('"acquireSheetLease"')]).toEqual(["not_published", true]);
    client.clearConnection();
  });
}

// ── Child: read hooks over an SDK-faithful useTable ─────────────────────────
if (SCENARIO === "hooks" || SCENARIO === "pre-codegen") {
  const BINDINGS = SCENARIO === "hooks";
  const React = await import("react");
  type Row = Record<string, unknown>;
  type Predicate = { column: string; value: string };
  const [V1, V2, V3] = [1, 2, 3].map((n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`);
  const ROWS: Record<string, Row[]> = {
    documentVersionState: [V1, V2].map((versionId, i) => ({ versionId, documentId: DOC, organizationId: "org", state: new Uint8Array(i + 2).fill(i + 1), byteLength: i + 2 })),
  };
  const events: string[] = [];
  const calls: Array<{ accessor: string; enabled: boolean; predicate?: Predicate }> = [];
  const probes: string[][] = [];
  const makeConn = (sheets: boolean) => ({
    isActive: true,
    subscriptionBuilder() { // the probe: applies at once, or fails on the sheet tables for a module without them
      const cb: { applied?: () => void; failed?: (ctx: unknown, error: unknown) => void } = {};
      const builder = {
        onApplied: (f: () => void) => ((cb.applied = f), builder),
        onError: (f: (ctx: unknown, error: unknown) => void) => ((cb.failed = f), builder),
        subscribe(queries: string[]) {
          probes.push(queries);
          const missing = !sheets && queries.some((sql) => sql.includes("document_version_state"));
          queueMicrotask(() => (missing ? cb.failed?.({}, new Error("no such table: `document_version_state`")) : cb.applied?.()));
          return { unsubscribe() {}, isActive: () => false };
        },
      };
      return builder;
    },
  });
  const state: { conn: ReturnType<typeof makeConn> | null } = { conn: null };
  const noSubscribe = () => () => {};
  mock.module("spacetimedb/react", () => ({
    useSpacetimeDB: () => ({ isActive: state.conn !== null, getConnection: () => state.conn, identity: { toHexString: () => "identity-1" } }),
    // useTable as dist/react/index.mjs has it (scripts/tests/drive/notice-ack.test.ts): the snapshot sits in a ref only
    // an effect clears, and `applied` is reset only by a disabled render, never by a query change while enabled.
    useTable: (query: { __accessor: string; predicate?: Predicate }, opts?: { enabled?: boolean }) => {
      const enabled = opts?.enabled ?? true;
      const { column = "", value = "" } = query.predicate ?? {};
      const key = `${query.__accessor}:${column}:${value}`;
      calls.push({ accessor: query.__accessor, enabled, predicate: query.predicate });
      const [applied, setApplied] = React.useState(false);
      const last = React.useRef<readonly [Row[], boolean] | null>(null);
      const compute = React.useCallback(
        (): readonly [Row[], boolean] => (enabled ? [(ROWS[query.__accessor] ?? []).filter((r) => r[column] === value), applied] : [[], true]),
        [enabled, key, applied], // eslint-disable-line react-hooks/exhaustive-deps
      );
      React.useEffect(() => void (last.current = null), [compute]);
      React.useEffect(() => {
        if (!enabled) return setApplied(false);
        let live = true;
        queueMicrotask(() => {
          if (!live) return;
          events.push(`applied ${value.slice(0, 2)}`);
          setApplied(true);
        });
        return () => void (live = false);
      }, [enabled, key, value]);
      const getSnapshot = React.useCallback(() => (last.current ??= compute()), [compute]);
      return React.useSyncExternalStore(noSubscribe, getSnapshot, getSnapshot);
    },
    useReducer: () => async () => {},
    useProcedure: () => async () => {},
    SpacetimeDBProvider: ({ children }: { children: unknown }) => children,
  }));
  const fakeTable = (accessor: string) => ({
    __accessor: accessor,
    where(build: (row: Record<string, { eq(value: string): Predicate }>) => Predicate) {
      const row = new Proxy({}, { get: (_t, column) => ({ eq: (value: string) => ({ column: String(column), value }) }) });
      return { __accessor: accessor, predicate: build(row) };
    },
  });
  const DOCS = ["document", "documentUpdate", "documentSnapshot", "documentPresence", "documentComment", "documentVersion", "documentStar", "documentAccess", "documentFile"];
  const accessors = ["orgMember", ...DOCS, ...(BINDINGS ? ["documentEditLease", "documentVersionState"] : [])];
  mock.module("@/lib/spacetimedb/generated", () => ({ tables: Object.fromEntries(accessors.map((a) => [a, fakeTable(a)])), reducers: {} }));
  mock.module("@/lib/context/permissions", () => ({ usePermissions: () => ({ role: "staff", permissions: {}, organizationId: "org" }) }));
  mock.module("@/lib/docs/recent", () => ({ useLastOpenedMap: () => new Map() }));
  mock.module("@/lib/auth/context", () => ({ useAuth: () => ({ user: null }) }));

  test(`sheet read hooks (${SCENARIO})`, async () => {
    const [{ createElement: h }, { render }, sheets, { sheetsProbeQueries }] = await Promise.all([
      import("react"), import("ink-testing-library"), import("@/lib/spacetimedb/hooks/useSheets"), import("@/lib/sheets/queries"),
    ]);
    let seen: { status: string; state: Uint8Array | null; isReady: boolean } | null = null;
    const Probe = ({ id }: { id: string | null }) => {
      const status = sheets.useSheetsBackendStatus();
      const version = sheets.useSheetVersionState(id);
      seen = { status, ...version };
      events.push(`render ${id?.slice(0, 2) ?? "--"} ${version.isReady} ${version.state ? version.state.join("") : "-"}`);
      return null;
    };
    const get = () => seen as unknown as { status: string; state: Uint8Array | null; isReady: boolean };
    const versionCalls = () => calls.filter((c) => c.accessor === "documentVersionState");
    state.conn = makeConn(true);

    if (!BINDINGS) {
      const app = render(h(Probe, { id: V1 }));
      await until(() => seen !== null, "a render");
      expect([sheets.SHEETS_BINDINGS_GENERATED, get().status, get().isReady, get().state]).toEqual([false, "not_published", true, null]);
      await sleep(20);
      expect([versionCalls(), probes]).toEqual([[], []]);
      app.unmount();
      return;
    }

    // No live connection yet: checking, not ready, nothing subscribed.
    state.conn = null;
    const app = render(h(Probe, { id: V1 }));
    await until(() => seen !== null, "a render");
    expect([get().status, get().isReady, get().state, versionCalls().filter((c) => c.enabled)]).toEqual(["checking", false, null, []]);

    // Connected: one row by primary key — never the other version held in the same table.
    state.conn = makeConn(true);
    app.rerender(h(Probe, { id: V1.toUpperCase() }));
    await until(() => get().isReady && get().state !== null, "version 1's bytes");
    expect([sheets.SHEETS_BINDINGS_GENERATED, get().status, get().state?.join("")]).toEqual([true, "ready", "11"]);
    expect(probes).toContainEqual(sheetsProbeQueries());
    const enabled = () => versionCalls().filter((c) => c.enabled);
    expect(enabled().length).toBeGreaterThan(0);
    expect(enabled().every((c) => c.predicate?.column === "versionId" && c.predicate.value === V1)).toBe(true);

    // Another id while subscribed: never ready before ITS subscription applied, never the previous version's bytes.
    events.length = 0;
    app.rerender(h(Probe, { id: V3 }));
    await until(() => get().isReady, "version 3 to settle");
    expect(get().state).toBeNull();
    const applied = events.indexOf("applied 33");
    expect(applied).toBeGreaterThan(-1);
    expect(events.findIndex((e) => e.startsWith("render 33 true"))).toBeGreaterThan(applied);
    expect(events.filter((e) => e.startsWith("render 33") && !e.endsWith(" -"))).toEqual([]);
    expect(enabled().every((c) => c.predicate?.value === V1 || c.predicate?.value === V3)).toBe(true);

    // Not a version id, or none: ready, nothing, no subscription.
    for (const id of ["not-a-version", null]) {
      const before = versionCalls().length;
      app.rerender(h(Probe, { id }));
      await until(() => get().isReady && get().state === null, `id ${id}`);
      await sleep(20);
      expect(versionCalls().slice(before).filter((c) => c.enabled)).toEqual([]);
    }

    // A module without the sheet tables (before the publish): not_published, ready, nothing.
    state.conn = makeConn(false);
    app.rerender(h(Probe, { id: V2 }));
    await until(() => get().status === "not_published", "not_published");
    expect([get().isReady, get().state]).toEqual([true, null]);
    app.unmount();
  });
}
