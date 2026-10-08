// GUARD: a table that already-shipped clients decode never changes its columns.
//
// The SpacetimeDB TypeScript SDK decodes a subscription's row list SEQUENTIALLY,
// with the CLIENT's compiled row type (#parseRowList). When the server's table
// has one more trailing column than the client knows, the client reads the
// next row's first bytes as the previous row's tail: every row after the first
// is misaligned and it throws "RangeError: Out of bounds access". A removed,
// reordered or retyped column breaks the same way. Old clients are everywhere:
// every web tab opened before a publish (until it reloads), and the Capacitor
// iOS/Android apps, whose bundle is the static export, until each user updates.
//
// So a table in scripts/tests/fixtures/client-compat-tables.json keeps EXACTLY
// those columns, in that order, with those wire types. Changing a fixture entry
// to make this test pass breaks every old client on that table — web tabs and
// installed native apps — so don't. A new field goes in a SIDE TABLE keyed by
// the row's id: document_file (type and folder of a document) and
// device_login_requester (who asked for a QR log-in) exist for exactly this.
// A new table is free; once a publish has shipped it to clients, add it to the
// fixture (regenerate from the published source), and from then on it is frozen too.
//
// Two more changes break old clients the same way, so they are frozen too:
//   - a public table turning private: an old client's subscription batch that
//     names it is rejected, and every table in that batch stays empty;
//   - a reducer's parameters changing (added, removed, reordered, retyped) or the
//     reducer going away: old clients encode their arguments positionally with
//     THEIR types, so the call fails to decode. Old store tablets keep calling
//     createDeviceLoginRequest / approveDeviceLogin / consumeDeviceLogin, and old
//     Docs clients createDocument, with the shipped arguments. A new argument
//     means a NEW reducer beside the old one.
//
// The fixture was generated from git HEAD 4137e75's spacetimedb/src/index.ts,
// plus page presence (live on maincloud) from spacetimedb/src/presence/{tables,reducers}.ts,
// by reading them with ./module-tables.ts exactly as this test reads the module.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import fixture from "../fixtures/client-compat-tables.json";
import {
  moduleSourceFiles, readModuleReducers, readModuleTables, wireType,
  type ModuleColumn, type ModuleReducers, type ModuleTables, type ReducerParam,
} from "./module-tables";

const MODULE_SRC = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src");
const FROZEN = fixture.tables as unknown as Record<string, ModuleColumn[]>;
const FROZEN_PUBLIC: readonly string[] = fixture.publicTables;
const FROZEN_REDUCERS = fixture.reducers as unknown as Record<string, ReducerParam[]>;
const SOURCES = moduleSourceFiles(MODULE_SRC);
const CURRENT = readModuleTables(SOURCES);
const CURRENT_REDUCERS = readModuleReducers(SOURCES);

const show = (cols: readonly ModuleColumn[]) => cols.map(([c, t]) => `${c}: ${t}`).join(", ");

/** Every way the module's tables differ from the frozen ones: one line per table. */
function compatProblems(
  frozen: Record<string, readonly ModuleColumn[]>, module: ModuleTables, frozenPublic: readonly string[] = FROZEN_PUBLIC,
): string[] {
  const problems: string[] = [];
  for (const [name, want] of Object.entries(frozen)) {
    const table = module.tables.get(name);
    if (!table) {
      problems.push(`${name}: removed (old clients still subscribe to it)`);
      continue;
    }
    if (frozenPublic.includes(name) && !table.isPublic) {
      problems.push(`${name}: no longer public — old clients' subscription batches that name it fail (${table.file})`);
    }
    const have = table.columns;
    if (JSON.stringify(have) === JSON.stringify(want)) continue;
    const added = have.slice(want.length).map(([c]) => c);
    const prefixSame = JSON.stringify(have.slice(0, want.length)) === JSON.stringify(want);
    problems.push(prefixSame && added.length > 0
      ? `${name}: column(s) appended (${added.join(", ")}) — move them to a side table (${table.file})`
      : `${name}: columns changed (${table.file})\n    frozen: ${show(want)}\n    module: ${show(have)}`);
  }
  return problems;
}

/** Every shipped reducer that is gone or whose parameters differ: one line per reducer. */
function reducerProblems(frozen: Record<string, readonly ReducerParam[]>, module: ModuleReducers): string[] {
  const problems: string[] = [];
  for (const [name, want] of Object.entries(frozen)) {
    const reducer = module.reducers.get(name);
    if (!reducer) {
      problems.push(`${name}: reducer removed or unreadable (old clients still call it)`);
    } else if (JSON.stringify(reducer.params) !== JSON.stringify(want)) {
      problems.push(`${name}: parameters changed — add a new reducer instead (${reducer.file})\n` +
        `    frozen: ${show(want)}\n    module: ${show(reducer.params)}`);
    }
  }
  return problems;
}

/** The module as read, with `table`'s definition patched (a mutation for the self-checks). */
function withTable(table: string, patch: { columns?: ModuleColumn[]; isPublic?: boolean }): ModuleTables {
  const tables = new Map(CURRENT.tables);
  const current = tables.get(table);
  if (!current) throw new Error(`no table ${table}`);
  tables.set(table, { ...current, ...patch });
  return { tables, unreadable: [] };
}
const withColumns = (table: string, columns: ModuleColumn[]) => withTable(table, { columns });

/** The module's reducers as read, with `reducer`'s parameters replaced, or the reducer removed (null). */
function withReducer(reducer: string, params: ReducerParam[] | null): ModuleReducers {
  const reducers = new Map(CURRENT_REDUCERS.reducers);
  const current = reducers.get(reducer);
  if (!current) throw new Error(`no reducer ${reducer}`);
  if (params) reducers.set(reducer, { ...current, params });
  else reducers.delete(reducer);
  return { reducers, unreadable: [] };
}

describe("tables old clients decode", () => {
  test("every table definition of the module is readable", () => {
    expect(CURRENT.unreadable).toEqual([]);
    expect(CURRENT.tables.size).toBeGreaterThan(Object.keys(FROZEN).length);
  });

  test("keep exactly their frozen columns: none added, removed, reordered or retyped; public ones stay public", () => {
    expect(compatProblems(FROZEN, CURRENT)).toEqual([]);
  });

  test("the fixture covers git HEAD's tables and the live page_presence", () => {
    expect(Object.keys(FROZEN).length).toBe(79);
    expect(FROZEN_PUBLIC.length).toBe(66);
    for (const name of FROZEN_PUBLIC) expect(FROZEN[name]).toBeDefined();
    for (const name of ["document", "device_login_request", "page_presence"]) expect(FROZEN_PUBLIC).toContain(name);
    expect(FROZEN_PUBLIC).not.toContain("user_secret");
    for (const name of ["document", "device_login_request", "document_access", "org_member", "organization", "page_presence"]) {
      expect(FROZEN[name]?.length ?? 0).toBeGreaterThan(0);
    }
    // Tables that did not exist in the shipped module are not frozen (yet).
    for (const name of ["drive_item", "document_reader_index", "document_file", "device_login_requester"]) {
      expect(FROZEN[name]).toBeUndefined();
    }
  });

  test("document and device_login_request are the shipped columns: Drive and the QR requester live in side tables", () => {
    expect(FROZEN.document.map(([c]) => c)).toEqual([
      "id", "organizationId", "ownerMemberId", "title", "excerpt", "icon", "visibility", "templateId", "pageSetup",
      "wordCount", "createdAt", "updatedAt", "lastEditorMemberId", "trashedAt", "trashedByMemberId",
    ]);
    expect(FROZEN.device_login_request.map(([c]) => c)).toEqual([
      "id", "organizationId", "deviceId", "nonce", "status", "memberId", "intent", "createdAt", "expiresAt",
    ]);
    expect(CURRENT.tables.get("document_file")?.columns).toEqual([
      ["documentId", "t.string()"], ["organizationId", "t.string()"], ["fileType", "t.string()"], ["folderId", "t.string()"],
      ["updatedAt", "t.timestamp()"],
    ]);
    // Same type as device_login_request.id, so the RLS join is uuid = uuid.
    expect(CURRENT.tables.get("device_login_requester")?.columns).toEqual([
      ["requestId", "t.uuid()"], ["requesterIdentity", "t.identity()"], ["organizationId", "t.string()"],
      ["createdAt", "t.timestamp()"],
    ]);
    expect(FROZEN.device_login_request[0]).toEqual(["id", "t.uuid()"]);
  });
});

describe("reducers old clients call", () => {
  test("keep exactly their frozen parameters, and none is removed", () => {
    expect(reducerProblems(FROZEN_REDUCERS, CURRENT_REDUCERS)).toEqual([]);
  });

  test("the fixture covers every reducer of git HEAD and the live page presence ones", () => {
    // 201 in HEAD's index.ts (one lib/spacetimedb/generated/*_reducer.ts each) + upsertPagePresence, removePagePresence.
    expect(Object.keys(FROZEN_REDUCERS).length).toBe(203);
    expect(FROZEN_REDUCERS.createDeviceLoginRequest).toEqual([["organizationId", "t.string()"], ["deviceId", "t.string()"], ["nonce", "t.string()"]]);
    expect(FROZEN_REDUCERS.approveDeviceLogin).toEqual([["nonce", "t.string()"], ["intent", "t.string()"]]);
    expect(FROZEN_REDUCERS.consumeDeviceLogin).toEqual([["id", "t.uuid()"]]);
    expect(FROZEN_REDUCERS.createDocument.map(([p]) => p)).toEqual([
      "organizationId", "documentId", "title", "visibility", "templateId", "initialState", "html", "plainText", "wordCount",
    ]);
    expect(FROZEN_REDUCERS.upsertPagePresence?.length).toBe(11);
    // Reducers that did not exist in the shipped module are not frozen (yet).
    for (const name of ["createDriveDocument", "setDocumentFolder", "moveDriveEntries"]) expect(FROZEN_REDUCERS[name]).toBeUndefined();
  });

  test("every frozen reducer is read from the module source (none hides behind an unreadable definition)", () => {
    const unreadableFrozen = CURRENT_REDUCERS.unreadable.filter((line) =>
      Object.keys(FROZEN_REDUCERS).some((name) => line.includes(` ${name} `)));
    expect(unreadableFrozen).toEqual([]);
    expect(CURRENT_REDUCERS.reducers.size).toBeGreaterThan(Object.keys(FROZEN_REDUCERS).length);
  });
});

describe("the check itself", () => {
  const doc = CURRENT.tables.get("document")?.columns ?? [];

  test("an appended column is caught, even with a default (the regression that broke old clients)", () => {
    const problems = compatProblems(FROZEN, withColumns("document", [...doc, ["fileType", "t.string()"], ["folderId", "t.string()"]]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("document: column(s) appended (fileType, folderId)");
  });

  test("a removed, reordered or retyped column, or a removed table, is caught", () => {
    expect(compatProblems(FROZEN, withColumns("document", doc.slice(0, -1)))[0]).toContain("document: columns changed");
    expect(compatProblems(FROZEN, withColumns("document", [doc[1], doc[0], ...doc.slice(2)]))[0]).toContain("document: columns changed");
    const retyped = doc.map(([c, t]): ModuleColumn => (c === "wordCount" ? [c, "t.u64()"] : [c, t]));
    expect(compatProblems(FROZEN, withColumns("document", retyped))[0]).toContain("wordCount: t.u64()");
    const tables = new Map(CURRENT.tables);
    tables.delete("device_login_request");
    expect(compatProblems(FROZEN, { tables, unreadable: [] })).toEqual(["device_login_request: removed (old clients still subscribe to it)"]);
  });

  test("a frozen public table made private is caught", () => {
    expect(compatProblems(FROZEN, withTable("document", { isPublic: false }))).toEqual([
      expect.stringContaining("document: no longer public"),
    ]);
    // A private table of the fixture may become public (check:rls then demands a rule); that breaks no client.
    expect(compatProblems(FROZEN, withTable("user_secret", { isPublic: true }))).toEqual([]);
  });

  test("a shipped reducer gaining, losing, reordering or retyping a parameter, or going away, is caught", () => {
    const create = FROZEN_REDUCERS.createDeviceLoginRequest;
    const cases: ReducerParam[][] = [
      [...create, ["extra", "t.string()"]],
      create.slice(0, -1),
      [create[1], create[0], create[2]],
      create.map(([p, t]): ReducerParam => (p === "nonce" ? [p, "t.option(t.string())"] : [p, t])),
    ];
    for (const params of cases) {
      const problems = reducerProblems(FROZEN_REDUCERS, withReducer("createDeviceLoginRequest", params));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("createDeviceLoginRequest: parameters changed");
    }
    expect(reducerProblems(FROZEN_REDUCERS, withReducer("approveDeviceLogin", null))).toEqual([
      "approveDeviceLogin: reducer removed or unreadable (old clients still call it)",
    ]);
  });

  test("reducers are read in every form of spacetimedb.reducer, from any file", () => {
    const read = readModuleReducers([{
      path: "x.ts",
      text: "export const plain = spacetimedb.reducer(\n  { id: t.uuid(), // c\n    name: t.option(t.string()) },\n  (ctx, a) => {}\n);\n" +
        "export const bare = spacetimedb.reducer((ctx) => {});\n" +
        "export const renamed = spacetimedb.reducer({ name: 'wire_name' }, { n: t.u32() }, (ctx, a) => {});\n" +
        "function define(spacetimedb) {\n  const inner = spacetimedb.reducer({ nonce: t.string() }, (ctx, a) => {});\n  return { inner };\n}\n" +
        "const args = { x: t.string() };\nexport const indirect = spacetimedb.reducer(args, (ctx, a) => {});\n",
    }]);
    expect([...read.reducers.values()].map((r) => [r.name, r.params])).toEqual([
      ["plain", [["id", "t.uuid()"], ["name", "t.option(t.string())"]]],
      ["bare", []],
      ["wire_name", [["n", "t.u32()"]]],
      ["inner", [["nonce", "t.string()"]]],
    ]);
    expect(read.unreadable).toEqual(["x.ts:13: indirect parameters are not an object literal of `name: t.…`"]);
  });

  test("the module is read from source text, in any file under spacetimedb/src", () => {
    const read = readModuleTables([{
      path: "x.ts",
      text: "import { t, table as tbl } from 'spacetimedb/server';\n" +
        "export const a = tbl({ public: true, name: \"a_table\" }, {\n  id: t.uuid().primaryKey(), // c\n  n: t.u32().default(0),\n" +
        "  o: t.option(t.string()),\n  who: t.identity().default(Identity.zero()),\n  s: t.string().index('btree'),\n});\n",
    }]);
    expect(read.unreadable).toEqual([]);
    expect(read.tables.get("a_table")?.isPublic).toBe(true);
    expect(read.tables.get("a_table")?.columns).toEqual([
      ["id", "t.uuid()"], ["n", "t.u32()"], ["o", "t.option(t.string())"], ["who", "t.identity()"], ["s", "t.string()"],
    ]);
    expect(CURRENT.tables.get("page_presence")?.file).toContain(join("presence", "tables.ts"));
  });

  test("wireType keeps what the wire sees and drops index/migration modifiers", () => {
    expect(wireType("t.string().primaryKey()")).toBe("t.string()");
    expect(wireType("t.u64().autoInc().primaryKey()")).toBe("t.u64()");
    expect(wireType("t.u64().default(0n)")).toBe("t.u64()");
    expect(wireType("t.option( t.timestamp() )")).toBe("t.option(t.timestamp())");
    expect(wireType("t.string().name('file_type')")).toBe("t.string().name('file_type')");
  });
});
