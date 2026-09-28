// Static shape of the Drive and Docs-family row-level security, read from the
// REAL module source (spacetimedb/src/index.ts + spacetimedb/src/drive/tables.ts
// + spacetimedb/src/device/tables.ts).
//
// The RLS section of index.ts is evaluated with a stub `clientVisibilityFilter`
// that returns the SQL it is given, so these assertions see exactly the rules a
// publish would create — including the ones generated from the lists. The RLS
// checker (scripts/check-rls-coverage.ts) is then run against the real source
// and against mutated copies, so its failure classes are proven to fire.

import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..", "..", "..");
const MODULE_SRC = join(ROOT, "spacetimedb", "src");
const INDEX_SRC = readFileSync(join(MODULE_SRC, "index.ts"), "utf8");
const TABLES_SRC = readFileSync(join(MODULE_SRC, "drive", "tables.ts"), "utf8");
const DEVICE_TABLES_SRC = readFileSync(join(MODULE_SRC, "device", "tables.ts"), "utf8");

type Pair = [table: string, column: string];
interface RlsSection {
  rules: Record<string, string>;
  orgScoped: Array<string | Pair>;
  selfScoped: Pair[];
  readerScoped: Pair[];
  unfiltered: string[];
}

/** Runs index.ts from `const RLS_ORG_SCOPED` up to `export const rowLevelSecurity`. */
function evaluateRlsSection(source: string): RlsSection {
  const start = source.indexOf("const RLS_ORG_SCOPED");
  const end = source.indexOf("export const rowLevelSecurity");
  if (start < 0 || end < start) throw new Error("RLS section not found in spacetimedb/src/index.ts");
  const js = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const factory = new Function(
    "spacetimedb",
    `"use strict";\n${js}\nreturn { rules: rlsRules, orgScoped: RLS_ORG_SCOPED, selfScoped: RLS_SELF_SCOPED, ` +
      `readerScoped: RLS_DOC_READER_SCOPED, unfiltered: RLS_UNFILTERED };`,
  );
  return factory({ clientVisibilityFilter: { sql: (sql: string) => sql } }) as RlsSection;
}

/** The table a rule returns rows of: the first `FROM <table>`. */
function baseTable(sql: string): string {
  const m = /\bFROM\s+([a-z_0-9]+)/i.exec(sql);
  if (!m) throw new Error(`rule without FROM: ${sql}`);
  return m[1];
}

/** `[column, type]` of a table definition, in declaration order. */
function columnsOf(source: string, tableName: string): Array<[string, string]> {
  const at = source.indexOf(`name: '${tableName}',`);
  if (at < 0) throw new Error(`table ${tableName} not found`);
  const body = source.slice(at, source.indexOf("\n);", at));
  return [...body.matchAll(/^ {4}(\w+):\s*(t\.[^,\n]+)/gm)].map((m): [string, string] => [m[1], m[2].trim()]);
}

const rls = evaluateRlsSection(INDEX_SRC);
const orgScopedNames = rls.orgScoped.map((e) => (typeof e === "string" ? e : e[0]));

const READER_TABLES: Pair[] = [
  ["document", "id"],
  ["document_access", "documentId"],
  ["document_comment", "documentId"],
  ["document_edit_lease", "documentId"],
  ["document_presence", "documentId"],
  ["document_snapshot", "documentId"],
  ["document_star", "documentId"],
  ["document_update", "documentId"],
  ["document_version", "documentId"],
  ["document_version_state", "documentId"],
  ["document_file", "documentId"],
];
const RULE_FREE_JOIN_TARGETS = [
  "org_membership_index",
  "chat_membership_index",
  "drive_admin_index",
  "document_reader_index",
  "drive_service_reader",
  "device_login_requester",
];
const NEW_TABLES = [
  "drive_item",
  "drive_org_state",
  "drive_admin_index",
  "document_reader_index",
  "drive_usage",
  "drive_star",
  "drive_notice_ack",
  "drive_service_reader",
  "drive_blob_gc",
  "document_edit_lease",
  "document_version_state",
  "document_file",
];

describe("Drive rules", () => {
  test("every hand-written Drive rule exists verbatim", () => {
    expect(rls.rules.rls_drive_item_owner).toBe(
      "SELECT x.* FROM drive_item x JOIN org_membership_index mi ON x.ownerMemberId = mi.memberId WHERE mi.userId = :sender",
    );
    expect(rls.rules.rls_drive_item_store).toBe(
      "SELECT x.* FROM drive_item x JOIN org_membership_index mi ON x.organizationId = mi.organizationId " +
        "WHERE mi.userId = :sender AND x.space = 'store' AND x.trashed = false AND x.status = 'ready'",
    );
    expect(rls.rules.rls_drive_item_admin).toBe(
      "SELECT x.* FROM drive_item x JOIN drive_admin_index a ON x.adminScope = a.adminScope WHERE a.userId = :sender",
    );
    expect(rls.rules.rls_drive_item_self).toBe(
      "SELECT * FROM drive_item WHERE uploaderIdentity = :sender AND status = 'pending'",
    );
    expect(rls.rules.rls_drive_notice_ack_mine).toBe(
      "SELECT x.* FROM drive_notice_ack x JOIN org_membership_index mi ON x.memberId = mi.memberId WHERE mi.userId = :sender",
    );
    expect(rls.rules.rls_drive_notice_ack_self).toBe("SELECT * FROM drive_notice_ack WHERE userId = :sender");
    expect(rls.rules.rls_drive_blob_gc_service).toBe(
      "SELECT g.* FROM drive_blob_gc g JOIN drive_service_reader r ON g.scope = r.scope WHERE r.userId = :sender",
    );
    expect(rls.rules.rls_drive_usage_service).toBe(
      "SELECT u.* FROM drive_usage u JOIN drive_service_reader r ON u.scope = r.scope WHERE r.userId = :sender",
    );
  });

  test("drive_star and drive_usage are org-scoped on organizationId", () => {
    for (const table of ["drive_star", "drive_usage"]) {
      expect(rls.orgScoped).toContain(table);
      expect(rls.rules[`rls_${table}_member`]).toBe(
        `SELECT x.* FROM ${table} x JOIN org_membership_index mi ON x.organizationId = mi.organizationId ` +
          "WHERE mi.userId = :sender",
      );
    }
  });

  test("each Drive table gets exactly the planned rules", () => {
    const rulesOn = (table: string) =>
      Object.entries(rls.rules)
        .filter(([, sql]) => baseTable(sql) === table)
        .map(([name]) => name)
        .sort();
    expect(rulesOn("drive_item")).toEqual([
      "rls_drive_item_admin",
      "rls_drive_item_owner",
      "rls_drive_item_self",
      "rls_drive_item_store",
    ]);
    expect(rulesOn("drive_notice_ack")).toEqual(["rls_drive_notice_ack_mine", "rls_drive_notice_ack_self"]);
    expect(rulesOn("drive_blob_gc")).toEqual(["rls_drive_blob_gc_service"]);
    expect(rulesOn("drive_usage")).toEqual(["rls_drive_usage_member", "rls_drive_usage_service"]);
    expect(rulesOn("drive_star")).toEqual(["rls_drive_star_member"]);
    expect(rulesOn("drive_org_state")).toEqual([]);
  });

  test("the service identity reads only drive_blob_gc and drive_usage, through drive_service_reader", () => {
    const viaServiceReader = Object.values(rls.rules)
      .filter((sql) => /\bJOIN drive_service_reader\b/.test(sql))
      .map(baseTable)
      .sort();
    expect(viaServiceReader).toEqual(["drive_blob_gc", "drive_usage"]);
    for (const sql of Object.values(rls.rules)) expect(sql).not.toContain("service_identity");
  });
});

describe("Docs-family reader rules", () => {
  test("RLS_DOC_READER_SCOPED lists the 11 Docs-family tables", () => {
    expect(rls.readerScoped).toEqual(READER_TABLES);
  });

  test("each reader-scoped table joins document_reader_index on its document id", () => {
    for (const [table, column] of READER_TABLES) {
      expect(rls.rules[`rls_${table}_reader`]).toBe(
        `SELECT x.* FROM ${table} x JOIN document_reader_index r ON x.${column} = r.documentId WHERE r.userId = :sender`,
      );
    }
  });

  test("the lease and version-state tables are reader-scoped only, never org-scoped", () => {
    for (const table of ["document_edit_lease", "document_version_state"]) {
      expect(orgScopedNames).not.toContain(table);
      expect(rls.rules[`rls_${table}_member`]).toBeUndefined();
    }
  });

  // Review (compat r1): document_file was reader-scoped only while phase A still showed `document` to the whole
  // org, so a store tablet got its operator's private sheet as a document row without its file row, and the
  // client opened it as a text document. The two tables must reach exactly the same subscribers.
  test("document_file has exactly document's rules, in phase A and in phase B", () => {
    const rulesOn = (rules: Record<string, string>, table: string) =>
      Object.entries(rules)
        .filter(([, sql]) => baseTable(sql) === table)
        .map(([name, sql]) => [name.replace(table, "<t>"), sql.replace(` ${table} `, " <t> ").replace(".id = ", ".<key> = ")
          .replace(".documentId = ", ".<key> = ")])
        .sort();
    expect(rulesOn(rls.rules, "document").length).toBeGreaterThan(0);
    expect(rulesOn(rls.rules, "document_file")).toEqual(rulesOn(rls.rules, "document"));
    expect(orgScopedNames.includes("document_file")).toBe(orgScopedNames.includes("document"));
    // Phase B drops both org rules together.
    const block = /const RLS_ORG_SCOPED[^=]*= \[[\s\S]*?\];/.exec(INDEX_SRC)![0];
    const phaseB = evaluateRlsSection(INDEX_SRC.replace(block, block.replace(/'document',\s*/, "")));
    expect(phaseB.rules.rls_document_member).toBeUndefined();
    expect(phaseB.rules.rls_document_file_member).toBeDefined();
    expect(rulesOn(phaseB.rules, "document_file")).not.toEqual(rulesOn(phaseB.rules, "document"));
    const both = evaluateRlsSection(INDEX_SRC.replace(block, block.replace(/'document',\s*/, "").replace(/'document_file',\s*/, "")));
    expect(rulesOn(both.rules, "document_file")).toEqual(rulesOn(both.rules, "document"));
  });
});

describe("join targets and private state", () => {
  test("join targets are listed in RLS_UNFILTERED and carry no rule", () => {
    const ruled = new Set(Object.values(rls.rules).map(baseTable));
    for (const target of RULE_FREE_JOIN_TARGETS) {
      expect(rls.unfiltered).toContain(target);
      expect(ruled.has(target)).toBe(false);
      expect(orgScopedNames).not.toContain(target);
      expect(rls.selfScoped.map(([t]) => t)).not.toContain(target);
    }
  });

  test("drive_org_state is private and has no rule", () => {
    expect(TABLES_SRC).toMatch(/name: 'drive_org_state',\n\s*public: false/);
    expect(Object.keys(rls.rules).some((name) => name.includes("drive_org_state"))).toBe(false);
  });

  test("every new table is defined once, in drive/tables.ts, and registered in the schema", () => {
    for (const table of NEW_TABLES) {
      expect(TABLES_SRC.split(`name: '${table}',`).length - 1).toBe(1);
      expect(INDEX_SRC).not.toContain(`name: '${table}',`);
      const accessor = table.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
      expect(INDEX_SRC).toContain(`  ${accessor}: ${accessor}Table,\n`);
    }
  });

  test("every public new table is readable only through a rule or a documented join target", () => {
    const ruled = new Set(Object.values(rls.rules).map(baseTable));
    for (const m of TABLES_SRC.matchAll(/name: '([a-z_0-9]+)',\n\s*public: true/g)) {
      expect(ruled.has(m[1]) || rls.unfiltered.includes(m[1])).toBe(true);
    }
  });
});

describe("side tables of frozen tables (scripts/tests/drive/client-compat-schema.test.ts)", () => {
  test("document keeps its shipped columns; type and folder are document_file's, plain strings keyed by the document id", () => {
    expect(columnsOf(INDEX_SRC, "document").at(-1)).toEqual(["trashedByMemberId", "t.option(t.string())"]);
    expect(columnsOf(TABLES_SRC, "document_file")).toEqual([
      ["documentId", "t.string().primaryKey()"], ["organizationId", "t.string()"], ["fileType", "t.string()"],
      ["folderId", "t.string()"], ["updatedAt", "t.timestamp()"],
    ]);
  });

  test("device_login_request keeps its shipped columns and only its requester reads it, joined through device_login_requester", () => {
    expect(columnsOf(INDEX_SRC, "device_login_request").at(-1)).toEqual(["expiresAt", "t.timestamp()"]);
    // Review r2 (qr-remote-approve-binds-tablet): the pending nonce is the QR's whole secret, so no
    // colleague may read it. Only the requester's rule; no org rule, no self rule on a column.
    expect(orgScopedNames).not.toContain("device_login_request");
    expect(rls.selfScoped.map(([t]) => t)).not.toContain("device_login_request");
    const rules = Object.entries(rls.rules).filter(([, sql]) => baseTable(sql) === "device_login_request");
    expect(rules).toEqual([[
      "rls_device_login_request_requester",
      "SELECT d.* FROM device_login_request d JOIN device_login_requester q ON d.id = q.requestId WHERE q.requesterIdentity = :sender",
    ]]);
    // uuid = uuid: the dialect cannot join a uuid to a string.
    expect(columnsOf(INDEX_SRC, "device_login_request")[0]).toEqual(["id", "t.uuid().primaryKey()"]);
    expect(columnsOf(DEVICE_TABLES_SRC, "device_login_requester")).toEqual([
      ["requestId", "t.uuid().primaryKey()"], ["requesterIdentity", "t.identity()"], ["organizationId", "t.string()"],
      ["createdAt", "t.timestamp()"],
    ]);
    expect(DEVICE_TABLES_SRC).toContain("{ accessor: 'byRequesterIdentity', algorithm: 'btree', columns: ['requesterIdentity'] }");
  });

  test("device_login_requester is defined once, in device/tables.ts, registered, and a rule-free public join target", () => {
    expect(DEVICE_TABLES_SRC.split("name: 'device_login_requester',").length - 1).toBe(1);
    expect(DEVICE_TABLES_SRC).toMatch(/name: 'device_login_requester',\n\s*public: true/);
    expect(INDEX_SRC).not.toContain("name: 'device_login_requester',");
    expect(INDEX_SRC).toContain("  deviceLoginRequester: deviceLoginRequesterTable,\n");
    expect(rls.unfiltered).toContain("device_login_requester");
  });

  test("drive_item ends with trashRootAt; document_edit_lease ends with the log totals", () => {
    expect(columnsOf(TABLES_SRC, "drive_item").at(-1)).toEqual(["trashRootAt", "t.u64().default(0n)"]);
    expect(columnsOf(TABLES_SRC, "document_edit_lease").slice(-3)).toEqual([
      ["logBytes", "t.u64().default(0n)"], ["logRows", "t.u32().default(0)"], ["logOtherMaxId", "t.u64().default(0n)"],
    ]);
  });

  test("drive_usage has sheetBytes and no planQuotaBytes (flat quota)", () => {
    const columns = columnsOf(TABLES_SRC, "drive_usage").map(([c]) => c);
    expect(columns).toContain("sheetBytes");
    expect(columns).not.toContain("planQuotaBytes");
  });
});

// ── scripts/check-rls-coverage.ts ────────────────────────────────────────────

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function runChecker(srcDir?: string): { code: number; out: string } {
  const args = [process.execPath, "scripts/check-rls-coverage.ts", ...(srcDir ? [srcDir] : [])];
  const proc = Bun.spawnSync(args, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode ?? -1, out: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

type ModuleFile = "index.ts" | "drive/tables.ts" | "device/tables.ts";
type Edits = Partial<Record<ModuleFile, (source: string) => string>>;

/** Copies the module source, applies `edits`, and runs the checker on the copy. */
function checkMutated(edits: Edits) {
  const dir = mkdtempSync(join(tmpdir(), "rls-shape-"));
  tempDirs.push(dir);
  cpSync(MODULE_SRC, dir, { recursive: true });
  for (const [file, edit] of Object.entries(edits) as Array<[ModuleFile, (source: string) => string]>) {
    const path = join(dir, file);
    const before = readFileSync(path, "utf8");
    const after = edit(before);
    if (after === before) throw new Error(`mutation of ${file} changed nothing`);
    writeFileSync(path, after);
  }
  return runChecker(dir);
}

function replaceOnce(source: string, find: string, replacement: string): string {
  if (!source.includes(find)) throw new Error(`anchor not found: ${find}`);
  return source.replace(find, replacement);
}

const BEFORE_EXPORT = "export const rowLevelSecurity";
/** Inserts `code` into index.ts right before the rules are exported. */
const beforeExport = (code: string) => (s: string) => replaceOnce(s, BEFORE_EXPORT, `${code}\n${BEFORE_EXPORT}`);
/** Appends a `secret_stuff` table with the given options object to drive/tables.ts. */
const secretTable = (options = "{\n    name: 'secret_stuff',\n    public: true,\n  }") => (s: string) =>
  `${s}\nexport const secretStuffTable = table(\n  ${options},\n  {\n    id: t.string().primaryKey(),\n` +
  `    ownerId: t.identity(),\n  }\n);\n`;
const SECRET_RULE = "spacetimedb.clientVisibilityFilter.sql(`SELECT * FROM secret_stuff WHERE ownerId = :sender`)";
const WORLD_READABLE_SECRET = ["WORLD-READABLE", "- secret_stuff"];

/** Mutations the checker must reject, with text its output must contain. */
const REJECTED: Array<{ when: string; out: string[]; edits: Edits }> = [
  { when: "a join target gets a rule (named like a hand-written rule)",
    out: ["join targets carry a rule of their own", "- document_reader_index"],
    edits: { "index.ts": beforeExport("rlsRules.rls_document_reader_index_self = spacetimedb.clientVisibilityFilter.sql(" +
      "`SELECT * FROM document_reader_index WHERE userId = :sender`);") } },
  { when: "a join target gets a rule under any other name",
    out: ["join targets carry a rule of their own", "- drive_admin_index"],
    edits: { "index.ts": beforeExport("rlsRules.rls_scope_filter = spacetimedb.clientVisibilityFilter.sql(" +
      "`SELECT a.* FROM drive_admin_index a WHERE a.userId = :sender`);") } },
  { when: "a reader-scoped table loses its document index", out: ["UNSUBSCRIBABLE", "document_version_state.documentId"],
    edits: { "drive/tables.ts": (s) => replaceOnce(s, "    name: 'document_version_state',\n    public: true,\n" +
      "    indexes: [\n      { accessor: 'byDocumentId', algorithm: 'btree', columns: ['documentId'] },\n",
      "    name: 'document_version_state',\n    public: true,\n    indexes: [\n") } },
  { when: "a hand-written rule's join column loses its index", out: ["UNSUBSCRIBABLE", "drive_notice_ack.memberId"],
    edits: { "drive/tables.ts": (s) =>
      replaceOnce(s, "      { accessor: 'byMemberId', algorithm: 'btree', columns: ['memberId'] },\n", "") } },
  { when: "a rule predicate column becomes an option", out: ["UNPUBLISHABLE", "drive_item.status"],
    edits: { "drive/tables.ts": (s) => replaceOnce(s,
      "    status: t.string(),                 // 'pending'", "    status: t.option(t.string()),       // 'pending'") } },
  { when: "a self-scoped table scopes on a string column", out: ["UNMATCHABLE", "device_operator_session.identity"],
    edits: { "index.ts": (s) => replaceOnce(s, "    name: 'device_operator_session',\n    public: true,\n    indexes: [\n" +
      "      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },\n    ],\n  },\n  {\n" +
      "    identity: t.identity().primaryKey(),", "    name: 'device_operator_session',\n    public: true,\n    indexes: [\n" +
      "      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },\n    ],\n  },\n  {\n" +
      "    identity: t.string().primaryKey(),") } },
  { when: "the QR requester join target gets a rule", out: ["join targets carry a rule of their own", "- device_login_requester"],
    edits: { "index.ts": beforeExport("rlsRules.rls_device_login_requester_self = spacetimedb.clientVisibilityFilter.sql(" +
      "`SELECT * FROM device_login_requester WHERE requesterIdentity = :sender`);") } },
  { when: "the QR requester loses its identity index", out: ["UNSUBSCRIBABLE", "device_login_requester.requesterIdentity"],
    edits: { "device/tables.ts": (s) =>
      replaceOnce(s, "      { accessor: 'byRequesterIdentity', algorithm: 'btree', columns: ['requesterIdentity'] },\n", "") } },
  { when: "a Docs-family table drops out of the reader list", out: ["WORLD-READABLE", "- document_edit_lease"],
    edits: { "index.ts": (s) => replaceOnce(s, "  ['document_edit_lease', 'documentId'], ", "  ") } },
  // Only a rule registered in rlsRules is coverage.
  { when: "a public table's only 'rules' are in comments", out: WORLD_READABLE_SECRET,
    edits: { "drive/tables.ts": secretTable(), "index.ts": beforeExport(`//   ${SECRET_RULE};\n` +
      `// rlsRules.rls_secret_stuff_self = ${SECRET_RULE};\n/*\nrlsRules.rls_secret_stuff_mine = ${SECRET_RULE};\n*/`) } },
  { when: "a public table's only rules are never assigned to rlsRules", out: WORLD_READABLE_SECRET,
    edits: { "drive/tables.ts": (s) => `${secretTable()(s)}export const secretRule = ${SECRET_RULE};\n`,
      "index.ts": beforeExport(`const secretRule = ${SECRET_RULE};\nvoid secretRule;`) } },
  { when: "a rule is named for a table but selects from another", out: WORLD_READABLE_SECRET,
    edits: { "drive/tables.ts": secretTable(), "index.ts": beforeExport("rlsRules.rls_secret_stuff_self = " +
      "spacetimedb.clientVisibilityFilter.sql(`SELECT * FROM todo WHERE userId = :sender`);") } },
  { when: "a rule is assigned inside a function", out: ["UNCHECKED", "not a top-level `rlsRules", ...WORLD_READABLE_SECRET],
    edits: { "drive/tables.ts": secretTable(),
      "index.ts": beforeExport(`function later() {\n  rlsRules.rls_secret_stuff_self = ${SECRET_RULE};\n}\nvoid later;`) } },
  { when: "rlsRules is never exported", out: ["UNREGISTERED"],
    edits: { "index.ts": (s) => replaceOnce(s, "spacetimedb.exportGroup(rlsRules)", "spacetimedb.exportGroup({})") } },
  // Every table definition is seen, whatever its layout.
  { when: "a public table puts `public` before `name`", out: WORLD_READABLE_SECRET,
    edits: { "drive/tables.ts": secretTable("{\n    public: true,\n    name: 'secret_stuff',\n  }") } },
  { when: "a public table is defined on one line", out: WORLD_READABLE_SECRET,
    edits: { "drive/tables.ts": secretTable("{ name: 'secret_stuff', public: true }") } },
  { when: "a public table's name is in double quotes", out: WORLD_READABLE_SECRET,
    edits: { "drive/tables.ts": secretTable('{ name: "secret_stuff", public: true }') } },
  { when: "a table's public flag is not a literal", out: ["UNCHECKED", "`public` is not literally", ...WORLD_READABLE_SECRET],
    edits: { "drive/tables.ts": secretTable("{ name: 'secret_stuff', public: SECRET_IS_PUBLIC }") } },
  { when: "a table's name is not a literal", out: ["UNCHECKED", "no literal `name`"],
    edits: { "drive/tables.ts": secretTable("{ name: SECRET_NAME, public: true }") } },
];

describe("check:rls", () => {
  test("passes on the real module source", () => {
    const { code, out } = runChecker();
    expect(out).toContain("11 reader-scoped");
    expect(out).toContain("Every public table is covered by a row-level-security rule.");
    expect(code).toBe(0);
  });

  for (const { when, edits, out: expected } of REJECTED) {
    test(`fails when ${when}`, () => {
      const { code, out } = checkMutated(edits);
      for (const text of expected) expect(out).toContain(text);
      expect(code).toBe(1);
    });
  }

  test("a registered rule of any name covers the table it selects from", () => {
    const publicCount = (out: string) => Number(/^(\d+) public/m.exec(out)?.[1]);
    const real = runChecker();
    const { code, out } = checkMutated({
      "drive/tables.ts": secretTable(),
      "index.ts": beforeExport(`rlsRules.rls_secret_scope = ${SECRET_RULE};`),
    });
    expect(publicCount(out)).toBe(publicCount(real.out) + 1);
    expect(out).toContain("Every public table is covered by a row-level-security rule.");
    expect(code).toBe(0);
  });

  test("phase B (Docs tables removed from RLS_ORG_SCOPED) still passes, reader rules only", () => {
    const docsTables = READER_TABLES.map(([t]) => t);
    const removeFromOrgList = (s: string) => {
      const block = /const RLS_ORG_SCOPED[^=]*= \[[\s\S]*?\];/.exec(s);
      if (!block) throw new Error("RLS_ORG_SCOPED not found");
      let list = block[0];
      for (const t of docsTables) list = list.replace(new RegExp(`'${t}',\\s*`, "g"), "");
      return s.replace(block[0], list);
    };
    const phaseB = evaluateRlsSection(removeFromOrgList(INDEX_SRC));
    for (const t of docsTables) {
      expect(phaseB.rules[`rls_${t}_member`]).toBeUndefined();
      expect(phaseB.rules[`rls_${t}_reader`]).toBeDefined();
    }
    const alreadyPhaseB = docsTables.every((t) => !orgScopedNames.includes(t));
    const { code, out } = alreadyPhaseB ? runChecker() : checkMutated({ "index.ts": removeFromOrgList });
    expect(out).toContain("Every public table is covered by a row-level-security rule.");
    expect(code).toBe(0);
  });
});
