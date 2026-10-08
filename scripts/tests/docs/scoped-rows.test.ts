// The org / document scoped row hooks of lib/spacetimedb/hooks.ts (useDocumentRows … useDriveNoticeAckRows,
// all through useScopedDocTable) against a useTable that behaves like spacetimedb/react's
// (node_modules/spacetimedb/dist/react/index.mjs): its snapshot sits in a ref that only an effect clears, so the
// render that changes the query or `enabled` still returns the previous snapshot, and its `applied` flag is reset
// only by a disabled render, never by a query change while enabled. No render of the hooks may report ready
// before the current scope's subscription applied, or show another scope's rows.
//
// mock.module would leak into other test files, so the React check runs in a child `bun test` process of THIS
// file (SCOPED_ROWS_SCENARIO), as scripts/tests/drive/notice-ack.test.ts does.

import { expect, mock, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SELF = "./scripts/tests/docs/scoped-rows.test.ts";
const SCENARIO = process.env.SCOPED_ROWS_SCENARIO ?? "";

if (SCENARIO === "") {
  test("scoped row hooks never report a stale ready or another scope's rows (isolated child)", () => {
    const env = { ...process.env, SCOPED_ROWS_SCENARIO: "hooks" };
    const proc = Bun.spawnSync([process.execPath, "test", SELF], { cwd: ROOT, env, stdout: "pipe", stderr: "pipe" });
    const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
    if (proc.exitCode !== 0) console.error(output);
    expect(proc.exitCode).toBe(0);
    expect(output).toMatch(/\b4 pass\b/);
    expect(output).toContain(" 0 fail");
  }, 60_000);
}

if (SCENARIO === "hooks") {
  type Row = Record<string, unknown>;
  type Predicate = { column: string; value: string };
  type Tuple = readonly [readonly unknown[], boolean];
  const [ORG_A, ORG_B, DOC] = ["org-a", "org-b", "doc-1"];
  const ROWS: Record<string, Row[]> = {
    driveItem: [
      { id: "a1", organizationId: ORG_A }, { id: "a2", organizationId: ORG_A }, { id: "b1", organizationId: ORG_B },
    ],
    documentVersion: [{ id: "v1", documentId: DOC }, { id: "v2", documentId: "doc-2" }],
    // `id` only names the row for the harness; document_file is keyed by documentId.
    documentFile: [
      { id: "fa1", documentId: "da1", organizationId: ORG_A, fileType: "sheet" }, { id: "fb1", documentId: "db1", organizationId: ORG_B, fileType: "slides" },
    ],
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const settle = () => sleep(25);

  // Subscriptions apply only when the test says so: `held` collects them.
  let held: Array<() => void> = [];
  const applyAll = () => {
    const run = held;
    held = [];
    for (const apply of run) apply();
  };
  const calls: Array<{ accessor: string; enabled: boolean; predicate?: Predicate }> = [];

  const fakeTable = (accessor: string) => ({
    __accessor: accessor,
    where(build: (row: Record<string, { eq(value: string): Predicate }>) => Predicate) {
      const row = new Proxy({}, { get: (_t, column) => ({ eq: (value: string) => ({ column: String(column), value }) }) });
      return { __accessor: accessor, predicate: build(row) };
    },
  });
  const React = await import("react");
  const noSubscribe = () => () => {};
  mock.module("spacetimedb/react", () => ({
    useSpacetimeDB: () => ({ isActive: true, getConnection: () => null, connectionId: null }),
    useReducer: () => async () => {},
    // useTable as dist/react/index.mjs has it (a fresh result array per computed snapshot).
    useTable: (query: { __accessor: string; predicate?: Predicate }, opts?: { enabled?: boolean }) => {
      const enabled = opts?.enabled ?? true;
      calls.push({ accessor: query.__accessor, enabled, predicate: query.predicate });
      const { column = "", value = "" } = query.predicate ?? {};
      const sql = `${query.__accessor}:${column}:${value}`;
      const [applied, setApplied] = React.useState(false);
      const last = React.useRef<Tuple | null>(null);
      const compute = React.useCallback((): Tuple => {
        if (!enabled) return [[], true];
        return [(ROWS[query.__accessor] ?? []).filter((r) => !column || r[column] === value), applied];
      }, [enabled, sql, applied]); // eslint-disable-line react-hooks/exhaustive-deps
      React.useEffect(() => void (last.current = null), [compute]);
      React.useEffect(() => {
        if (!enabled) return setApplied(false);
        let live = true;
        held.push(() => live && setApplied(true));
        return () => void (live = false);
      }, [enabled, sql]);
      const getSnapshot = React.useCallback(() => (last.current ??= compute()), [compute]);
      return React.useSyncExternalStore(noSubscribe, getSnapshot, getSnapshot);
    },
  }));
  const ACCESSORS = ["document", "documentStar", "documentAccess", "documentComment", "documentVersion", "documentFile", "driveItem",
    "driveUsage", "driveStar", "driveNoticeAck"];
  mock.module("@/lib/spacetimedb/generated", () => ({ tables: Object.fromEntries(ACCESSORS.map((a) => [a, fakeTable(a)])), reducers: {} }));

  const [{ createElement: h }, { render }, hooks] = await Promise.all([
    import("react"), import("ink-testing-library"), import("@/lib/spacetimedb/hooks"),
  ]);

  type Seen = { scope: string | null; result: Tuple };
  const ids = (rows: readonly unknown[]) => rows.map((r) => String((r as Row).id));
  const expected = (accessor: string, column: string, scope: string | null) =>
    scope === null ? [] : ids(ROWS[accessor].filter((r) => r[column] === scope));

  /**
   * Renders one hook with `props`; `seen` gets every render's result. check(): no render since `from` was ready
   * while its subscription was still held, or showed rows outside its scope.
   */
  function harness(accessor: string, column: string, use: (p: { value: string | null; enabled: boolean }) => Tuple) {
    const seen: Seen[] = [];
    const Probe = (p: { value: string | null; enabled: boolean }) => {
      seen.push({ scope: p.enabled ? p.value : null, result: use(p) });
      return null;
    };
    let app: ReturnType<typeof render> | null = null;
    return {
      seen,
      show(p: { value: string | null; enabled: boolean }) {
        if (app) app.rerender(h(Probe, p));
        else app = render(h(Probe, p));
      },
      unmount: () => app?.unmount(),
      /** Every render since `from`: rows only of its own scope; ready only once `appliedFrom` (a seen index) passed. */
      check(from: number, readyFrom: number) {
        for (const [i, { scope, result }] of seen.entries()) {
          if (i < from) continue;
          const own = expected(accessor, column, scope);
          for (const id of ids(result[0])) expect([i, scope, id, own.includes(id)]).toEqual([i, scope, id, true]);
          if (scope !== null && i < readyFrom) expect([i, scope, "ready", result[1]]).toEqual([i, scope, "ready", false]);
        }
        expect(seen.length - from).toBeLessThan(40); // no render loop
      },
      last: () => seen[seen.length - 1],
    };
  }

  test("org scope: disabled, enabled, org to org while enabled, disabled again", async () => {
    const run = harness("driveItem", "organizationId", ({ value, enabled }) => hooks.useDriveItemRows(value, enabled));
    // Disabled (no org yet): empty and ready, the same tuple on every render.
    run.show({ value: null, enabled: true });
    await settle();
    run.show({ value: null, enabled: true });
    await settle();
    expect(run.seen.every((s) => s.result[0].length === 0 && s.result[1])).toBe(true);
    expect(new Set(run.seen.map((s) => s.result)).size).toBe(1);
    expect(calls.filter((c) => c.accessor === "driveItem").every((c) => !c.enabled)).toBe(true);

    for (const org of [ORG_A, ORG_B]) {
      // Enable (null → A), then re-scope while enabled (A → B): not ready until this org's subscription applies.
      const from = run.seen.length;
      run.show({ value: org, enabled: true });
      await settle();
      const heldAt = run.seen.length;
      expect(run.last().result[1]).toBe(false);
      applyAll();
      await settle();
      run.check(from, heldAt);
      expect([run.last().scope, ids(run.last().result[0]), run.last().result[1]]).toEqual([org, expected("driveItem", "organizationId", org), true]);
      expect(calls.filter((c) => c.accessor === "driveItem").at(-1)).toEqual({ accessor: "driveItem", enabled: true, predicate: { column: "organizationId", value: org } });
    }

    // Disabled again (same org): empty from the very first render, ready.
    const from = run.seen.length;
    run.show({ value: ORG_B, enabled: false });
    await settle();
    run.check(from, from);
    expect(run.seen.slice(from).every((s) => s.result[0].length === 0 && s.result[1])).toBe(true);

    // And back on for the same org: the old `applied` never counts.
    const again = run.seen.length;
    run.show({ value: ORG_B, enabled: true });
    await settle();
    const heldAt = run.seen.length;
    applyAll();
    await settle();
    run.check(again, heldAt);
    expect([ids(run.last().result[0]), run.last().result[1]]).toEqual([["b1"], true]);
    run.unmount();
  });

  test("org to org to org before anything applies, then a live update keeps ready", async () => {
    held = [];
    const run = harness("driveItem", "organizationId", ({ value, enabled }) => hooks.useDriveItemRows(value, enabled));
    run.show({ value: ORG_A, enabled: true });
    await settle();
    applyAll();
    await settle();
    expect(run.last().result[1]).toBe(true);
    const from = run.seen.length;
    run.show({ value: ORG_B, enabled: true });
    run.show({ value: ORG_A, enabled: true });
    run.show({ value: ORG_B, enabled: true });
    await settle();
    const heldAt = run.seen.length;
    applyAll();
    await settle();
    run.check(from, heldAt);
    expect([run.last().scope, ids(run.last().result[0]), run.last().result[1]]).toEqual([ORG_B, ["b1"], true]);
    // A re-render with the same scope passes the live tuple through untouched.
    const tuple = run.last().result;
    run.show({ value: ORG_B, enabled: true });
    await settle();
    expect(run.last().result).toBe(tuple);
    run.unmount();
  });

  test("document_file rows (a document's type): org to org never reports ready before that org's rows applied", async () => {
    held = [];
    const run = harness("documentFile", "organizationId", ({ value }) => hooks.useDocumentFileRows(value));
    for (const org of [ORG_A, ORG_B]) {
      const from = run.seen.length;
      run.show({ value: org, enabled: true });
      await settle();
      const heldAt = run.seen.length;
      expect(run.last().result[1]).toBe(false);
      applyAll();
      await settle();
      run.check(from, heldAt);
      expect([run.last().scope, ids(run.last().result[0]), run.last().result[1]]).toEqual([org, expected("documentFile", "organizationId", org), true]);
      expect(calls.filter((c) => c.accessor === "documentFile").at(-1)).toEqual({ accessor: "documentFile", enabled: true, predicate: { column: "organizationId", value: org } });
    }
    run.unmount();
  });

  test("document scope toggled by `enabled` (the versions panel)", async () => {
    held = [];
    const run = harness("documentVersion", "documentId", ({ value, enabled }) => hooks.useDocumentVersionRows(value, enabled));
    run.show({ value: DOC, enabled: false });
    await settle();
    expect([run.last().result[0].length, run.last().result[1]]).toEqual([0, true]);
    for (let round = 0; round < 2; round++) {
      const from = run.seen.length;
      run.show({ value: DOC, enabled: true });
      await settle();
      const heldAt = run.seen.length;
      applyAll();
      await settle();
      run.check(from, heldAt);
      expect([ids(run.last().result[0]), run.last().result[1]]).toEqual([["v1"], true]);
      const off = run.seen.length;
      run.show({ value: DOC, enabled: false });
      await settle();
      run.check(off, off);
      expect(run.seen.slice(off).every((s) => s.result[0].length === 0 && s.result[1])).toBe(true);
    }
    run.unmount();
  });
}
