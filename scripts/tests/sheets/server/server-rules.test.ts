// Source-level rules of the Sheets server (sheets.md §15 server-rules), read from the REAL
// module source: spacetimedb/src/index.ts and spacetimedb/src/drive/*.ts. The RLS section
// is evaluated with a stub clientVisibilityFilter, so these are the lists a publish uses.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { SHEET_LOG_MAX_BYTES } from "../../../../spacetimedb/src/drive/sheet-logic";
import { FakeDb, FakeIdentity, FakeTimestamp, loadModule } from "../../drive/fake-db";
import type { SheetDeps } from "../../../../spacetimedb/src/drive/sheets";
import type { DriveCtx } from "../../../../spacetimedb/src/drive/types";

const MODULE_SRC = join(import.meta.dir, "..", "..", "..", "..", "spacetimedb", "src");
const INDEX_SRC = readFileSync(join(MODULE_SRC, "index.ts"), "utf8");
const DRIVE_DIR = join(MODULE_SRC, "drive");
const read = (file: string): string => readFileSync(join(DRIVE_DIR, file), "utf8");

type Pair = [table: string, column: string];

/** index.ts from `const RLS_ORG_SCOPED` to `export const rowLevelSecurity`, run with SQL-returning rules. */
function rlsSection(): { rules: Record<string, string>; orgScoped: Array<string | Pair>; readerScoped: Pair[] } {
  const start = INDEX_SRC.indexOf("const RLS_ORG_SCOPED");
  const end = INDEX_SRC.indexOf("export const rowLevelSecurity");
  if (start < 0 || end < start) throw new Error("RLS section not found");
  const js = ts.transpileModule(INDEX_SRC.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const run = new Function("spacetimedb", `"use strict";\n${js}\nreturn { rules: rlsRules, orgScoped: RLS_ORG_SCOPED, readerScoped: RLS_DOC_READER_SCOPED };`);
  return run({ clientVisibilityFilter: { sql: (sql: string) => sql } });
}

/** The text of a top-level `function name` or `export const name = …` statement of index.ts. */
function body(name: string): string {
  const file = ts.createSourceFile("index.ts", INDEX_SRC, ts.ScriptTarget.ES2022, true);
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement.getText(file);
    if (ts.isVariableStatement(statement)
        && statement.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)) {
      return statement.getText(file);
    }
  }
  throw new Error(`index.ts has no top-level ${name}`);
}

const SHEET_REDUCERS = [
  "acquireSheetLease", "heartbeatSheetLease", "releaseSheetLease", "declineSheetLeaseRequest", "cancelSheetLeaseRequest",
  "pushSheetOps", "compactSheet", "resetSheetContent", "saveSheetVersion",
];

describe("row-level security of the sheet tables", () => {
  const rls = rlsSection();
  const orgNames = rls.orgScoped.map((e) => (typeof e === "string" ? e : e[0]));

  test("both sheet tables are reader-scoped like document_snapshot, and never org-scoped", () => {
    for (const table of ["document_edit_lease", "document_version_state", "document_snapshot", "document_update"]) {
      expect(rls.readerScoped).toContainEqual([table, "documentId"]);
    }
    expect(orgNames).not.toContain("document_edit_lease");
    expect(orgNames).not.toContain("document_version_state");
    for (const table of ["document_edit_lease", "document_version_state"]) {
      const rules = Object.values(rls.rules).filter((sql) => new RegExp(`FROM ${table}\\b`).test(sql));
      expect(rules).toEqual([`SELECT x.* FROM ${table} x JOIN document_reader_index r ON x.documentId = r.documentId WHERE r.userId = :sender`]);
    }
  });
});

describe("index.ts hooks (sheets.md §3.8, DS §6.8, U7)", () => {
  test("G1: the three Yjs writers refuse a sheet right after requireDoc", () => {
    for (const name of ["pushDocumentUpdate", "compactDocument", "saveDocumentVersion"]) {
      expect(body(name)).toMatch(/requireDoc\(ctx, args\.documentId, 'editor'\);\s*\n\s*if \(docFileTypeOf\(ctx, doc\.id\) === 'sheet'\) throw docError\('invalid'/);
    }
  });

  test("H1–H7 are wired where the Docs reducers change content, access or members", () => {
    const hooks: Array<[string, string[]]> = [
      ["purgeDocumentRows", ["adjustSheetBytes(ctx, doc.organizationId, -sheetContentBytes(ctx, id))", "documentVersionState.delete", "documentEditLease.delete", "dropDocumentFile(ctx, id)"]],
      ["trashDocument", ["dropDocumentLease(ctx, doc.id)"]],
      ["onDisconnect", ["detachSheetLeases(ctx, connectionId)"]],
      ["pruneDocPresence", ["revalidateSheetLease(ctx, doc, members)"]],
      ["deleteDocumentVersion", ["documentVersionState.versionId.find(v.id.toString())", "adjustSheetBytes"]],
      ["duplicateDocument", ["assertSheetBytesFit(ctx, src.organizationId, sheetBytes)", "adjustSheetBytes(ctx, src.organizationId, sheetBytes)", "driveFolderFits", "setDocumentFile(ctx, copy,"]],
      ["syncMemberAccessIndexes", ["dropSheetLeasesOfMember"]],
      ["dropMemberAccessIndexes", ["dropSheetLeasesOfMember"]],
      ["restoreDocument", ["driveFolderFits", "docFolderIdOf(ctx, doc.id)", "setDocumentFile(ctx, doc, { folderId: '' })"]],
      ["setDocumentVisibility", ["setDocumentFile(ctx, next, { folderId: '' })"]],
      ["notifyDocMembers", ["docFileTypeOf(ctx, doc.id)", "docLink(doc.id, threadId, kind)", "untitledDocName(kind)"]],
      ["createDeviceLoginRequest", ["isDeviceLoginRequester(ctx, row.id)", "dropDeviceLoginRequester(ctx, row.id)", "recordDeviceLoginRequester(ctx, id, organizationId)"]],
      ["consumeDeviceLogin", ["deviceLoginRequesterOf(ctx, row.id)", "requester.isEqual(ctx.sender)", "row.status === 'approved'", "writeDeviceOperatorSession"]],
      ["pruneEphemeral", ["dropDeviceLoginRequester(ctx, r.id)", "ctx.db.deviceLoginRequester.delete(q)"]],
    ];
    for (const [name, needles] of hooks) {
      const text = body(name);
      for (const needle of needles) expect([name, needle, text.includes(needle)]).toEqual([name, needle, true]);
    }
    // device_login_request is frozen for older tablets: the requester is a device_login_requester row, never a
    // field (the fake's frozen `document` / `device_login_request` columns catch a write of any other field).
    for (const name of ["createDeviceLoginRequest", "approveDeviceLogin", "consumeDeviceLogin"]) {
      expect([name, body(name).includes("requesterIdentity")]).toEqual([name, false]);
    }
    expect(body("createDocument")).not.toContain("fileType");
  });

  test("the nine sheet reducers are exported from the entry module through defineSheetReducers", () => {
    const m = /export const \{([^}]*)\} = defineSheetReducers\(spacetimedb, sheetDeps\);/.exec(INDEX_SRC);
    expect(m).not.toBeNull();
    expect((m?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)).toEqual(SHEET_REDUCERS);
    const factory = read("sheets.ts");
    for (const name of SHEET_REDUCERS) expect(factory).toContain(`const ${name} = spacetimedb.reducer(`);
  });

  test("the retired DS §6.4 lease design is not implemented anywhere", () => {
    const sources = [INDEX_SRC, ...readdirSync(DRIVE_DIR).filter((f) => f.endsWith(".ts")).map(read)].join("\n");
    for (const gone of ["assertDocWriteLease", "acquireDocumentLease", "renewDocumentLease", "DOC_LEASE_TTL_MICROS", "[doc.locked]", "[doc.lease_required]"]) {
      expect([gone, sources.includes(gone)]).toEqual([gone, false]);
    }
  });

  test("sheets.ts loads under Bun: its runtime imports are the SDK-free drive files only", () => {
    const file = ts.createSourceFile("sheets.ts", read("sheets.ts"), ts.ScriptTarget.ES2022, true);
    const runtime = file.statements.filter(ts.isImportDeclaration)
      .filter((s) => !s.importClause?.isTypeOnly)
      .map((s) => (s.moduleSpecifier as ts.StringLiteral).text);
    expect(runtime.sort()).toEqual(["./context", "./logic", "./sheet-logic"]);
  });
});

describe("limits", () => {
  const decls = loadModule([
    "sheetDeps", "DOC_UPDATE_MAX_BYTES", "DOC_STATE_MAX_BYTES", "DOC_TEXT_MAX_CHARS", "DOC_NAMED_VERSION_MAX",
    "DOC_VERSION_NAME_MAX", "DOC_AUTO_VERSION_GAP_MICROS",
  ]);
  const deps = decls.sheetDeps as SheetDeps;

  test("sheetDeps carries the Docs limits verbatim", () => {
    expect(deps.sheetLimits).toEqual({
      updateMaxBytes: decls.DOC_UPDATE_MAX_BYTES as number, namedVersionMax: decls.DOC_NAMED_VERSION_MAX as number,
      versionNameMax: decls.DOC_VERSION_NAME_MAX as number, autoVersionGapMicros: decls.DOC_AUTO_VERSION_GAP_MICROS as bigint,
    });
    expect(deps.docLimits.stateMaxBytes).toBe(decls.DOC_STATE_MAX_BYTES as number);
    expect(deps.docLimits.textMaxChars).toBe(decls.DOC_TEXT_MAX_CHARS as number);
    for (const fn of ["requireDoc", "touchDocument", "docFileTypeOf", "findActiveMember", "docRoleFor"] as const) {
      expect(typeof deps[fn]).toBe("function");
    }
  });

  test("the values sheets.md §8 SHEET_TUNING mirrors (lib/sheets/constants.ts parity is W1.2a's lease-parity suite)", () => {
    expect(decls.DOC_UPDATE_MAX_BYTES).toBe(1_048_576);
    expect(decls.DOC_STATE_MAX_BYTES).toBe(8_388_608);
    expect(SHEET_LOG_MAX_BYTES).toBe(16_777_216);
    expect(decls.DOC_AUTO_VERSION_GAP_MICROS).toBe(600_000_000n);
  });

  test("docFileTypeOf reads document_file: no row, '' and unknown values are text documents", () => {
    const db = new FakeDb();
    const now = new FakeTimestamp(db.nowMicros);
    const stored: Array<[id: string, fileType: string | null]> = [["a", null], ["b", ""], ["c", "sheet"], ["d", "slides"], ["e", "form"], ["f", "doc"]];
    for (const [id, fileType] of stored) {
      if (fileType !== null) db.insert("documentFile", { documentId: id, organizationId: "org", fileType, folderId: "", updatedAt: now });
    }
    const ctx = db.ctx(FakeIdentity.random()) as unknown as DriveCtx;
    expect(stored.map(([id]) => deps.docFileTypeOf(ctx, id))).toEqual(["doc", "doc", "sheet", "slides", "doc", "doc"]);
  });
});
