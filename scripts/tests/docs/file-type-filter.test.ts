// Docs / Drive read hooks by file type (useDocs.ts, useDrive.ts, hooks.ts) and the Drive write wrappers
// (actions/drive.ts). mock.module would leak into other test files sharing this process, so each scenario runs
// in a child `bun test` of THIS file with FILE_TYPE_FILTER_SCENARIO set (hooks.test.ts's isolated-fixture
// pattern, in one file). Children render with ink-testing-library, a real client renderer: effects run and the
// Docs / Drive backend probes apply against a fake connection.
//   pre-codegen  no document* / drive* bindings: everything empty, ready, not_published
//   live         bindings + a connection whose probes apply: filters, hrefs, the actor, stars, usage
//   no-drive     bindings, but the module has Docs only (before Publish A): Drive not_published, documents listed
//   actions      the write wrappers against a fake connection (argument shapes, local checks, errors)

import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SELF = "./scripts/tests/docs/file-type-filter.test.ts";
const SCENARIO = process.env.FILE_TYPE_FILTER_SCENARIO ?? "";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = uuid(900); // a uuid: Drive blob keys embed it
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400 && !check(); i++) await sleep(5);
  if (!check()) throw new Error(`timed out waiting for ${what}`);
}

if (SCENARIO === "") {
  describe("docs + drive hooks and drive wrappers (isolated children)", () => {
    for (const scenario of ["pre-codegen", "live", "no-drive", "actions"]) {
      test(scenario, () => {
        const proc = Bun.spawnSync([process.execPath, "test", SELF], {
          cwd: ROOT,
          env: { ...process.env, FILE_TYPE_FILTER_SCENARIO: scenario }, stdout: "pipe", stderr: "pipe",
        });
        const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
        if (proc.exitCode !== 0) console.error(output);
        expect(proc.exitCode).toBe(0);
        expect(output).toMatch(/[1-9]\d* pass/);
        expect(output).toContain(" 0 fail");
      }, 60_000);
    }
  });

  test("@/lib/spacetimedb/actions still resolves to actions.ts; the Drive wrappers to actions/drive.ts", () => {
    expect(Bun.resolveSync("@/lib/spacetimedb/actions", ROOT)).toBe(join(ROOT, "lib/spacetimedb/actions.ts"));
    expect(Bun.resolveSync("@/lib/spacetimedb/actions/drive", ROOT)).toBe(join(ROOT, "lib/spacetimedb/actions/drive.ts"));
  });
}

// ── Hook scenarios ─────────────────────────────────────────────────────────────

if (SCENARIO === "pre-codegen" || SCENARIO === "live" || SCENARIO === "no-drive") {
  const LIVE = SCENARIO === "live";
  const NO_DRIVE = SCENARIO === "no-drive";
  const BINDINGS = LIVE || NO_DRIVE;
  type Row = Record<string, unknown>;
  type Predicate = { column: string; value: string };
  const state = { connected: true, membersLoaded: true, filesApplied: true };
  const tableCalls: Array<{ accessor: string; enabled: boolean | undefined; predicate: Predicate | undefined }> = [];
  const probeQueries: string[][] = [];
  const reducerCalls: Array<[string, Row]> = [];
  const identity = { toHexString: () => "identity-1", toString: () => "identity-1" };
  const T = (day: number) => new Date(Date.UTC(2026, 8, day));

  // [n, the type on its document_file row ('' = no row: a document from before Drive), document row patch]
  const DOCS: Array<[number, string, Row?]> = [
    [3, ""], [2, "doc"], [5, "sheet"], [4, "slides", { visibility: "org_view" }], [6, "form"],
    [7, "sheet", { ownerMemberId: "member-1", trashedAt: T(8) }], [8, "form", { ownerMemberId: "member-1", trashedAt: T(9) }],
    [9, "doc", { organizationId: "org-2" }], [10, "doc", { visibility: "private", ownerMemberId: "member-2" }],
  ];
  const doc = (n: number, patch: Row = {}): Row => ({
    id: uuid(n), organizationId: ORG, ownerMemberId: "member-3", title: `doc ${n}`, visibility: "org_edit",
    createdAt: T(1), updatedAt: T(n), ...patch,
  });
  const file = (n: number, fileType: string, patch: Row = {}): Row => ({
    documentId: uuid(n), organizationId: patch.organizationId ?? ORG, fileType, folderId: "", updatedAt: T(n),
  });
  const item = (n: number, patch: Row): Row => ({ id: uuid(100 + n), organizationId: ORG, kind: "file", status: "ready", ...patch });
  const ROWS: Record<string, Row[]> = {
    document: DOCS.map(([n, , patch]) => doc(n, patch)),
    documentFile: DOCS.filter(([, fileType]) => fileType !== "").map(([n, fileType, patch]) => file(n, fileType, patch)),
    documentStar: [{ id: "s1", documentId: uuid(5), organizationId: ORG, memberId: "member-1" }],
    documentAccess: [{ id: "g1", documentId: uuid(2), organizationId: ORG, memberId: "member-4", role: "editor" }],
    driveItem: [
      item(1, { kind: "folder", space: "store", ownerMemberId: "member-3" }),
      item(2, { space: "my", ownerMemberId: "member-1" }),
      item(3, { space: "my", ownerMemberId: "member-2" }),
      item(4, { space: "store", ownerMemberId: "member-3", organizationId: "org-2" }),
    ],
    driveUsage: [{ organizationId: ORG, bytesUsed: 100n, bytesReserved: 5n, fileCount: 2, itemCount: 3, quotaBytesOverride: 0n, sheetBytes: 7n }],
    driveStar: [{ id: "ds1", itemId: uuid(101), organizationId: ORG, memberId: "member-1" }, { id: "ds2", itemId: uuid(102), organizationId: ORG, memberId: "member-2" }],
    driveNoticeAck: [],
  };

  const ORG_MEMBER_TABLE = { __accessor: "orgMember" };
  let members: Row[] = [];
  const setAccountRole = (role: string) => (members = [
    { id: "member-1", organizationId: ORG, status: "active", role, userId: identity }, // the signed-in account
    { id: "member-9", organizationId: "org-2", status: "active", role: "owner", userId: identity },
  ]);
  setAccountRole("staff");

  const fakeTable = (accessor: string) => ({
    __accessor: accessor,
    where(build: (row: Record<string, { eq(value: string): Predicate }>) => Predicate) {
      const row = new Proxy({}, { get: (_t, column) => ({ eq: (value: string) => ({ column: String(column), value }) }) });
      return { __accessor: accessor, predicate: build(row) };
    },
  });
  const ACCESSORS = ["document", "documentUpdate", "documentSnapshot", "documentPresence", "documentComment", "documentVersion",
    "documentStar", "documentAccess", "documentFile", "driveItem", "driveUsage", "driveStar", "driveNoticeAck"];
  const generatedTables = BINDINGS ? Object.fromEntries(ACCESSORS.map((a) => [a, fakeTable(a)])) : {};

  const fakeConn = {
    isActive: true,
    subscriptionBuilder() {
      let applied: ((ctx: unknown) => void) | null = null;
      let failed: ((ctx: unknown, error: unknown) => void) | null = null;
      const builder = {
        onApplied(cb: (ctx: unknown) => void) { applied = cb; return builder; },
        onError(cb: (ctx: unknown, error: unknown) => void) { failed = cb; return builder; },
        subscribe(queries: string[]) { // applies at once: the module "has" every table (no-drive: Docs only)
          probeQueries.push(queries);
          const missing = NO_DRIVE && queries.some((sql) => sql.includes("drive_"));
          const error = new Error("no such table: `drive_item`. If the table exists, it may be marked private.");
          queueMicrotask(() => (missing ? failed?.({}, error) : applied?.({})));
          return { unsubscribe() {}, isActive: () => false };
        },
      };
      return builder;
    },
    reducers: { refreshMyDriveAccess: async (args: Row) => { reducerCalls.push(["refreshMyDriveAccess", args]); } },
  };

  const filtered = new Map<string, Row[]>();
  mock.module("spacetimedb/react", () => ({
    useSpacetimeDB: () => ({ isActive: true, getConnection: () => (BINDINGS && state.connected ? fakeConn : null), identity }),
    useTable: (query: { __accessor: string; predicate?: Predicate }, opts?: { enabled?: boolean }) => {
      tableCalls.push({ accessor: query.__accessor, enabled: opts?.enabled, predicate: query.predicate });
      if (query === ORG_MEMBER_TABLE) return state.membersLoaded ? [members, true] : [[], false];
      if (opts?.enabled === false) return [[], true];
      if (query.__accessor === "documentFile" && !state.filesApplied) return [[], false];
      const { column = "", value = "" } = query.predicate ?? {};
      const key = `${query.__accessor}:${column}:${value}`;
      if (!filtered.has(key)) filtered.set(key, (ROWS[query.__accessor] ?? []).filter((r) => r[column] === value));
      return [filtered.get(key), true];
    },
    useReducer: () => async () => {},
    useProcedure: () => async () => {},
    SpacetimeDBProvider: ({ children }: { children: unknown }) => children,
  }));
  mock.module("@/lib/spacetimedb/generated", () => ({ tables: { orgMember: ORG_MEMBER_TABLE, ...generatedTables }, reducers: {} }));
  const PERMS = { role: "staff", permissions: { dashboard: { view: true } }, organizationId: ORG };
  mock.module("@/lib/context/permissions", () => ({ usePermissions: () => PERMS }));
  const OPENED = new Map<string, number>();
  mock.module("@/lib/docs/recent", () => ({ useLastOpenedMap: () => OPENED }));
  mock.module("@/lib/auth/context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

  test(`docs + drive hooks by file type (${SCENARIO})`, async () => {
    const [{ createElement }, { render }, { setConnection }, docsHooks, driveHooks, rawHooks, actorContext, queries, rules] =
      await Promise.all([
        import("react"), import("ink-testing-library"), import("@/lib/spacetimedb/client"), import("@/lib/spacetimedb/hooks/useDocs"),
        import("@/lib/spacetimedb/hooks/useDrive"), import("@/lib/spacetimedb/hooks"), import("@/lib/drive/actor-context"),
        import("@/lib/drive/queries"), import("@/lib/drive/rules"),
      ]);
    if (BINDINGS) setConnection(fakeConn as never);

    const capture = () => ({
      memberId: docsHooks.useCurrentMemberId(),
      text: docsHooks.useDocuments(),
      all: docsHooks.useDocuments({ fileTypes: "all" }),
      sheets: docsHooks.useDocuments({ fileTypes: ["sheet"] }),
      recent: docsHooks.useRecentDocuments(10),
      recentText: docsHooks.useRecentDocuments(10, { fileTypes: "text" }),
      sheet: docsHooks.useDocument(uuid(5)),
      legacy: docsHooks.useDocument(uuid(3)),
      drive: driveHooks.useDrive(),
      driveAs2: driveHooks.useDrive({ actorMemberId: "member-2" }),
      driveStatus: driveHooks.useDriveBackendStatus(),
      // Live: only the ack hook, so every other drive* subscription below is useDrive's own. No-drive: none at all.
      raw: LIVE
        ? [rawHooks.useDriveNoticeAckRows(ORG)]
        : NO_DRIVE
          ? []
          : [rawHooks.useDriveItemRows(ORG), rawHooks.useDriveUsageRows(ORG), rawHooks.useDriveStarRows(ORG), rawHooks.useDriveNoticeAckRows(ORG)],
    });
    let seen: ReturnType<typeof capture> | null = null;
    const renders: Array<[isReady: boolean, storeOnly: boolean]> = []; // useDrive() on every render
    const Probe = () => {
      const c = capture();
      seen = c;
      renders.push([c.drive.isReady, c.drive.storeOnly]);
      return null;
    };
    const get = () => seen as unknown as ReturnType<typeof capture>;
    const ids = (docs: Array<{ id: string }>) => docs.map((d) => d.id);
    const mount = async (override: { memberId: string; actingMemberId: string } | null, ready: () => boolean) => {
      seen = null;
      const tree = override ? createElement(actorContext.DriveActorOverrideContext.Provider, { value: override }, createElement(Probe)) : createElement(Probe);
      const app = render(tree);
      await until(() => seen !== null && ready(), "the hooks to settle");
      return app;
    };

    if (!BINDINGS) {
      const app = await mount(null, () => get().drive.isReady);
      const c = get();
      expect(driveHooks.DRIVE_BINDINGS_GENERATED).toBe(false);
      expect([c.driveStatus, c.drive.status, c.text.backendStatus]).toEqual(["not_published", "not_published", "not_published"]);
      expect([c.text.isReady, c.all.isReady, c.recent.ready, c.drive.isReady, c.driveAs2.isReady]).toEqual([true, true, true, true, true]);
      expect([c.text.docs, c.all.docs, c.recent.items, c.drive.items, c.drive.documents, c.drive.trashedDocuments]).toEqual([[], [], [], [], [], []]);
      expect(c.drive.usage).toBeNull();
      expect(c.drive.starredItemIds.size + c.drive.starredDocumentIds.size).toBe(0);
      expect(c.raw).toEqual([[[], false], [[], false], [[], false], [[], false]]);
      expect(tableCalls.filter((call) => call.accessor !== "orgMember")).toEqual([]);
      expect(c.drive.accessForItem({ organizationId: ORG, ownerMemberId: "member-1", space: "my", trashed: false, status: "ready", kind: "file" } as never).role).toBe("manager");
      await sleep(20);
      expect(reducerCalls).toEqual([]);
      app.unmount();
      return;
    }

    if (NO_DRIVE) {
      // Codegen ran, the module has Docs only: Drive is not_published and ready, opens no drive_* subscription and
      // skips the self-heal, while documents keep coming from the Docs hooks.
      const app = await mount(null, () => get().drive.status === "not_published" && get().drive.isReady && get().text.isReady);
      const c = get();
      expect(driveHooks.DRIVE_BINDINGS_GENERATED).toBe(true);
      expect([c.driveStatus, c.text.backendStatus]).toEqual(["not_published", "ready"]);
      expect(probeQueries).toContainEqual(queries.driveProbeQueries());
      expect(ids(c.drive.documents)).toEqual([uuid(5), uuid(4), uuid(3), uuid(2)]);
      expect(ids(c.text.docs)).toEqual([uuid(3), uuid(2)]);
      expect([c.drive.items, c.drive.usage, c.drive.starredItemIds.size]).toEqual([[], null, 0]);
      const driveCalls = tableCalls.filter((call) => call.accessor.startsWith("drive"));
      expect(driveCalls.length).toBeGreaterThan(0);
      expect(driveCalls.filter((call) => call.enabled !== false)).toEqual([]);
      await sleep(20);
      expect(reducerCalls).toEqual([]);
      app.unmount();
      return;
    }

    // Bindings but no live connection yet: checking, not ready, every Drive query disabled.
    state.connected = false;
    let app = await mount(null, () => get().driveStatus === "checking");
    expect([driveHooks.DRIVE_BINDINGS_GENERATED, get().drive.isReady]).toEqual([true, false]);
    const driveCalls = tableCalls.filter((call) => call.accessor.startsWith("drive") && call.accessor !== "driveNoticeAck");
    expect(driveCalls.length).toBeGreaterThan(0);
    expect(driveCalls.every((call) => call.enabled === false)).toBe(true);
    app.unmount();

    // Connected: both probes apply, rows flow.
    state.connected = true;
    tableCalls.length = 0;
    app = await mount(null, () => get().drive.isReady && get().drive.status === "ready" && get().text.isReady);
    let c = get();
    expect(probeQueries).toContainEqual(queries.driveProbeQueries());
    expect(c.memberId).toBe("member-1");
    // Docs lists: text only by default ('' = legacy doc); other orgs, other types and colleagues' private docs never.
    expect(ids(c.text.docs)).toEqual([uuid(3), uuid(2)]);
    expect(c.text.trashed).toEqual([]);
    expect(ids(c.all.docs)).toEqual([uuid(6), uuid(5), uuid(4), uuid(3), uuid(2)]);
    expect(ids(c.all.trashed)).toEqual([uuid(8), uuid(7)]);
    expect([ids(c.sheets.docs), ids(c.sheets.trashed)]).toEqual([[uuid(5)], [uuid(7)]]);
    // Recents: every type an editor opens, typed hrefs.
    expect(c.recent.items.map((i) => [i.id, i.fileType, i.href])).toEqual([
      [uuid(5), "sheet", `/manager/drive/sheet?id=${uuid(5)}`],
      [uuid(4), "slides", `/manager/drive/slides?id=${uuid(4)}`],
      [uuid(3), "doc", `/manager/docs/edit?id=${uuid(3)}`],
      [uuid(2), "doc", `/manager/docs/edit?id=${uuid(2)}`],
    ]);
    expect(c.recentText.items.map((i) => i.id)).toEqual([uuid(3), uuid(2)]);
    // useDrive: org-scoped subscriptions, the actor's view.
    for (const accessor of ["driveItem", "driveUsage", "driveStar"]) {
      expect(tableCalls.filter((call) => call.accessor === accessor).at(-1)).toEqual({ accessor, enabled: true, predicate: { column: "organizationId", value: ORG } });
    }
    expect(tableCalls.find((call) => call.accessor === "driveNoticeAck")?.predicate).toEqual({ column: "organizationId", value: ORG });
    expect(c.drive.actor).toEqual({ organizationId: ORG, memberId: "member-1", role: "staff", gate: true, canViewAll: false, canEditAll: false });
    expect([c.drive.admin, c.drive.storeOnly]).toEqual([{ view: false, edit: false }, false]);
    expect(ids(c.drive.items)).toEqual([uuid(101), uuid(102), uuid(103)]);
    expect(c.drive.itemsById.get(uuid(102))?.ownerMemberId).toBe("member-1");
    expect(ids(c.drive.items).map((id) => c.drive.accessForItem(c.drive.itemsById.get(id)!).role)).toEqual(["contributor", "manager", "none"]);
    expect(ids(c.drive.documents)).toEqual([uuid(5), uuid(4), uuid(3), uuid(2)]);
    expect(ids(c.drive.trashedDocuments)).toEqual([uuid(8), uuid(7)]);
    expect(c.drive.grants.map((g) => g.memberId)).toEqual(["member-4"]);
    expect([...c.drive.starredItemIds]).toEqual([uuid(101)]);
    expect([...c.drive.starredDocumentIds]).toEqual([uuid(5)]);
    expect(c.drive.usage).toEqual({
      usedBytes: 100, reservedBytes: 5, quotaBytes: rules.DRIVE_DEFAULT_QUOTA_BYTES, fileCount: 2, sheetBytes: 7,
      // No storage-accounting tables in this fixture: documents and app files are unknown, not 0.
      breakdown: { files: 105, documents: null, sheets: 7, apps: null, total: 112, quota: rules.DRIVE_DEFAULT_QUOTA_BYTES },
    });
    expect(c.drive.storageMeasured).toBe(false);
    expect(c.drive.accessForDocument(c.drive.documents[0]).role).toBe("editor");
    // actorMemberId re-evaluates documents and stars for that member.
    expect(ids(c.driveAs2.documents)).toContain(uuid(10));
    expect([...c.driveAs2.starredItemIds]).toEqual([uuid(102)]);
    await until(() => reducerCalls.length > 0, "refreshMyDriveAccess");
    expect([c.sheet.doc?.fileType, c.legacy.doc?.fileType, c.legacy.doc?.folderId]).toEqual(["sheet", "doc", ""]);
    app.unmount();

    // The document rows applied, document_file not yet: no type is known, so nothing is listed or returned (a sheet
    // must never pass for a text document, or a route open it in the wrong editor) and nothing is ready or not found.
    state.filesApplied = false;
    app = await mount(null, () => get().text.backendStatus === "ready" && get().driveStatus === "ready");
    await sleep(20);
    c = get();
    expect([c.text.isReady, c.all.isReady, c.recent.ready, c.drive.isReady, c.sheet.isReady]).toEqual([false, false, false, false, false]);
    expect([c.text.docs, c.all.docs, c.all.trashed, c.recent.items, c.drive.documents]).toEqual([[], [], [], [], []]);
    expect([c.sheet.doc, c.sheet.notFound, c.legacy.doc, c.legacy.notFound]).toEqual([null, false, null, false]);
    state.filesApplied = true;
    app.rerender(createElement(Probe));
    await until(() => get().text.isReady && get().drive.isReady, "document_file to apply");
    c = get();
    expect([c.sheet.doc?.fileType, c.legacy.doc?.fileType, ids(c.text.docs)]).toEqual(["sheet", "doc", [uuid(3), uuid(2)]]);
    app.unmount();

    // A store panel (operator member-2) on a staff-account tablet: Store space only, operator's docs and stars.
    app = await mount({ memberId: "member-2", actingMemberId: "member-2" }, () => get().drive.isReady);
    c = get();
    expect(c.memberId).toBe("member-2");
    expect(ids(c.text.docs)).toEqual([uuid(10), uuid(3), uuid(2)]);
    expect([c.drive.storeOnly, c.drive.actor.memberId]).toEqual([true, "member-2"]);
    expect([...c.drive.starredItemIds]).toEqual([uuid(102)]);
    expect(c.drive.accessForItem(c.drive.itemsById.get(uuid(103))!).role).toBe("manager");
    app.unmount();

    // An owner-account tablet whose own org_member row hasn't loaded: not ready until it has, so storeOnly: true is
    // never reported as ready and then flipped to false.
    setAccountRole("owner");
    state.membersLoaded = false;
    renders.length = 0;
    const panel = { memberId: "member-2", actingMemberId: "member-2" };
    app = await mount(panel, () => get().drive.status === "ready" && get().text.isReady);
    await sleep(20);
    expect(get().drive.isReady).toBe(false);
    state.membersLoaded = true;
    app.rerender(createElement(actorContext.DriveActorOverrideContext.Provider, { value: panel }, createElement(Probe)));
    await until(() => get().drive.isReady, "the tablet account's row");
    expect(get().drive.storeOnly).toBe(false);
    expect(renders.filter(([ready, storeOnly]) => ready && storeOnly)).toEqual([]);
    app.unmount();

    // The same panel on an owner-account tablet shows My files too; a /personal panel ('' acting) never is store-only.
    for (const [role, acting] of [["owner", "member-2"], ["staff", ""]]) {
      setAccountRole(role);
      app = await mount({ memberId: "member-2", actingMemberId: acting }, () => get().drive.isReady);
      expect(get().drive.storeOnly).toBe(false);
      app.unmount();
    }

    // The self-heal ran once for this identity and store, across every mount.
    expect(reducerCalls).toEqual([["refreshMyDriveAccess", { organizationId: ORG }]]);
  }, 30_000);
}

// ── Write wrappers ─────────────────────────────────────────────────────────────

if (SCENARIO === "actions") {
  type Row = Record<string, unknown>;
  const [client, drive, rules, { driveErrorCode }, { DRIVE_NOTICE_ID }] = await Promise.all([
    import("@/lib/spacetimedb/client"), import("@/lib/spacetimedb/actions/drive"), import("@/lib/drive/rules"),
    import("@/lib/drive/errors"), import("@/lib/drive/types"),
  ]);
  const calls: Array<[string, Row]> = [];
  const trash = { driveItem: [] as Row[], document: [] as Row[], perCall: 0 };
  const reducers = new Proxy({} as Record<string, (args: Row) => Promise<void>>, {
    get: (_target, name) => async (args: Row) => {
      calls.push([String(name), args]);
      if (name !== "emptyDriveTrash") return;
      // Purges `perCall` trashed rows, like the module's bounded batch.
      for (let i = 0; i < trash.perCall; i++) {
        const row = trash.driveItem.find((r) => r.trashed) ?? trash.document.find((r) => r.trashedAt);
        if (row) Object.assign(row, { trashed: false, trashedAt: undefined });
      }
    },
  });
  const conn = { reducers, db: { driveItem: { iter: () => trash.driveItem }, document: { iter: () => trash.document } } };
  const last = () => calls.at(-1) ?? ["", {}];
  const codeOf = (p: Promise<unknown>) => p.then(() => "resolved", (err: unknown) => driveErrorCode(err));
  const connect = () => (client.setConnection(conn as never), client.setActiveOrgId(ORG));

  describe("drive write wrappers", () => {
    test("connection, publish and active-store errors", async () => {
      client.clearConnection();
      expect(await codeOf(drive.createDriveFolder({ space: "store", parentId: "", name: "A" }))).toBe("not_connected");
      client.setConnection({ reducers: {} } as never);
      expect(await codeOf(drive.toggleDriveStar(uuid(1)))).toBe("not_published");
      client.setConnection(conn as never);
      expect(await codeOf(drive.refreshMyDriveAccess())).toBe("not_connected"); // no active store yet
      expect(calls).toEqual([]);
    });

    test("argument shapes", async () => {
      connect();
      const folderId = await drive.createDriveFolder({ space: "my", parentId: "", name: "  Q3\u200f  ", itemId: uuid(1).toUpperCase() });
      expect(folderId).toBe(uuid(1));
      expect(last()).toEqual(["createDriveFolder", { organizationId: ORG, itemId: uuid(1), space: "my", parentId: "", ownerMemberId: "", name: "Q3", actingMemberId: "" }]);
      expect(await drive.createDriveFolder({ space: "store", parentId: uuid(1), name: "B" })).toMatch(/^[0-9a-f-]{36}$/);
      await drive.renameDriveItem(uuid(2), "New name", { actingMemberId: "op-1" });
      expect(last()).toEqual(["renameDriveItem", { itemId: uuid(2), name: "New name", actingMemberId: "op-1" }]);
      await drive.moveDriveEntries({ itemIds: [uuid(2).toUpperCase(), uuid(2)], documentIds: [uuid(3)], space: "store", parentId: "", organizationId: "org-9" });
      expect(last()).toEqual(["moveDriveEntries", {
        organizationId: "org-9", itemIds: JSON.stringify([uuid(2)]), documentIds: JSON.stringify([uuid(3)]),
        targetSpace: "store", targetParentId: "", targetOwnerMemberId: "", actingMemberId: "",
      }]);
      await drive.setDocumentFolder(uuid(3), { space: "my", parentId: uuid(1), ownerMemberId: "member-2" });
      expect(last()).toEqual(["setDocumentFolder", { documentId: uuid(3), space: "my", folderId: uuid(1), ownerMemberId: "member-2", actingMemberId: "" }]);
      for (const name of ["trashDriveEntries", "restoreDriveEntries", "deleteDriveEntriesForever"] as const) {
        await drive[name]({ documentIds: [uuid(4)], actingMemberId: "op-1" });
        expect(last()).toEqual([name, { organizationId: ORG, itemIds: "[]", documentIds: JSON.stringify([uuid(4)]), actingMemberId: "op-1" }]);
      }
      await drive.toggleDriveStar(uuid(2));
      expect(last()).toEqual(["toggleDriveStar", { itemId: uuid(2), actingMemberId: "" }]);
      await drive.acknowledgeDriveNotice({ surface: "store", actingMemberId: "op-1" });
      expect(last()).toEqual(["acknowledgeDriveNotice", { organizationId: ORG, notice: DRIVE_NOTICE_ID, surface: "store", actingMemberId: "op-1" }]);
      await drive.refreshMyDriveAccess();
      expect(last()).toEqual(["refreshMyDriveAccess", { organizationId: ORG }]);
      await drive.backfillDriveAccessV1();
      expect(last()).toEqual(["backfillDriveAccessV1", { organizationId: "" }]);
      await drive.abortDriveUpload(uuid(5).toUpperCase());
      expect(last()).toEqual(["abortDriveUpload", { itemId: uuid(5) }]);
      expect(await drive.createDriveDocument({ fileType: "sheet", space: "store", folderId: "", documentId: uuid(6), initialState: new Uint8Array(0), wordCount: 3.7 })).toBe(uuid(6));
      expect(last()).toEqual(["createDriveDocument", {
        organizationId: ORG, documentId: uuid(6), fileType: "sheet", space: "store", folderId: "", ownerMemberId: "",
        visibility: "", title: "", templateId: "", initialState: undefined, html: undefined, plainText: undefined, wordCount: 3, actingMemberId: "",
      }]);
    });

    test("checks made before the round trip", async () => {
      connect();
      const before = calls.length;
      const upload = (name: string, size: number) => drive.beginDriveUpload({ space: "store", parentId: "", name, file: { size } });
      expect(await codeOf(drive.createDriveFolder({ space: "store", parentId: "", name: "a/b" }))).toBe("invalid_name");
      expect(await codeOf(drive.renameDriveItem(uuid(1), " .. "))).toBe("invalid_name");
      const many = Array.from({ length: 201 }, (_, i) => uuid(1000 + i));
      expect(await codeOf(drive.trashDriveEntries({ itemIds: many }))).toBe("batch_too_large");
      expect(await codeOf(upload("empty.txt", 0))).toBe("invalid");
      expect(await codeOf(upload("huge.mp4", 1024 ** 3 + 1))).toBe("too_large");
      expect(await codeOf(upload("setup.exe", 10))).toBe("blocked_type");
      await drive.moveDriveEntries({ space: "store", parentId: "" }); // nothing to move: no call
      expect(calls.length).toBe(before);
    });

    test("beginDriveUpload computes the key the module recomputes", async () => {
      connect();
      const began = await drive.beginDriveUpload({
        space: "my", parentId: "", name: "Q3 report.xlsx", file: { type: "", size: 1234 }, itemId: uuid(7), blobId: uuid(8), actingMemberId: "op-1",
      });
      const blobKey = rules.driveBlobKey(ORG, uuid(7), uuid(8), "Q3 report.xlsx");
      expect(began).toEqual({
        itemId: uuid(7), blobId: uuid(8), blobKey, thumbKey: rules.driveThumbKeyFor(blobKey),
        mimeType: rules.mimeFromExtension("x.xlsx"), sizeBytes: 1234, multipart: false,
      });
      expect(last()).toEqual(["beginDriveUpload", {
        organizationId: ORG, itemId: uuid(7), space: "my", parentId: "", ownerMemberId: "", name: "Q3 report.xlsx",
        mimeType: began.mimeType, sizeBytes: 1234n, blobKey, actingMemberId: "op-1",
      }]);
      const big = await drive.beginDriveUpload({ space: "store", parentId: "", name: "clip.mp4", file: { type: "video/mp4", size: rules.DRIVE_MULTIPART_THRESHOLD_BYTES } });
      expect([big.multipart, big.mimeType, rules.parseDriveBlobKey(big.blobKey)?.itemId]).toEqual([true, "video/mp4", big.itemId]);
    });

    test("emptyDriveTrash repeats while the visible trash shrinks", async () => {
      connect();
      const rounds = async (items: number, docs: number, perCall: number, maxRounds?: number) => {
        trash.driveItem = Array.from({ length: items }, () => ({ organizationId: ORG, trashed: true }));
        trash.document = Array.from({ length: docs }, () => ({ organizationId: ORG, trashedAt: new Date() }));
        trash.perCall = perCall;
        const before = calls.length;
        await drive.emptyDriveTrash({ actingMemberId: "op-1", maxRounds });
        return calls.slice(before).length;
      };
      expect(await rounds(3, 2, 2)).toBe(3);
      expect(last()).toEqual(["emptyDriveTrash", { organizationId: ORG, actingMemberId: "op-1" }]);
      expect(await rounds(4, 0, 0)).toBe(1); // what's left is someone else's
      expect(await rounds(9, 0, 1, 2)).toBe(2);
      expect(await rounds(0, 0, 0)).toBe(1);
    });
  });
}
