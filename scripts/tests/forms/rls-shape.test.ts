// Static shape of the Forms tables and their row-level security, read from the REAL module source
// (spacetimedb/src/index.ts + spacetimedb/src/forms/tables.ts). The RLS section of index.ts is evaluated with a
// stub `clientVisibilityFilter` that returns its SQL, so these assertions see exactly what a publish would create.
// The checker itself (bun run check:rls) is exercised in scripts/tests/drive/rls-shape.test.ts.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..", "..", "..");
const MODULE_SRC = join(ROOT, "spacetimedb", "src");
const INDEX_SRC = readFileSync(join(MODULE_SRC, "index.ts"), "utf8");
const TABLES_SRC = readFileSync(join(MODULE_SRC, "forms", "tables.ts"), "utf8");

interface RlsSection {
  rules: Record<string, string>;
  orgScoped: Array<string | [string, string]>;
  selfScoped: Array<[string, string]>;
  readerScoped: Array<[string, string]>;
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

/** Columns with a btree index (or the primary key) on a table definition. */
function indexedColumnsOf(source: string, tableName: string): Set<string> {
  const at = source.indexOf(`name: '${tableName}',`);
  const body = source.slice(at, source.indexOf("\n);", at));
  const out = new Set([...body.matchAll(/columns: \['(\w+)'\]/g)].map((m) => m[1]));
  for (const [name, type] of columnsOf(source, tableName)) if (type.includes(".primaryKey()")) out.add(name);
  return out;
}

const rls = evaluateRlsSection(INDEX_SRC);
const orgScopedNames = rls.orgScoped.map((e) => (typeof e === "string" ? e : e[0]));
const FORM_TABLES = [
  "form", "form_meta", "form_response", "form_response_review", "form_assignment", "form_completion", "form_public",
];
const rulesOn = (table: string) =>
  Object.entries(rls.rules).filter(([, sql]) => baseTable(sql) === table).map(([name]) => name).sort();

const member = (t: string, col: string) =>
  `SELECT x.* FROM ${t} x JOIN org_membership_index mi ON x.${col} = mi.memberId WHERE mi.userId = :sender`;
const admin = (t: string) =>
  `SELECT x.* FROM ${t} x JOIN drive_admin_index a ON x.adminScope = a.adminScope WHERE a.userId = :sender`;

describe("Forms rules (design B.3)", () => {
  test("form: member (memberVisible) + admin, verbatim; no owner rule (building is by role)", () => {
    expect(rulesOn("form")).toEqual(["rls_form_admin", "rls_form_member"]);
    expect(rls.rules.rls_form_member).toBe(
      "SELECT x.* FROM form x JOIN org_membership_index mi ON x.organizationId = mi.organizationId " +
        "WHERE mi.userId = :sender AND x.memberVisible = true",
    );
    expect(rls.rules.rls_form_admin).toBe(admin("form"));
  });

  test("form_meta: admin only — the token and counters never reach every member, nor a demoted owner", () => {
    expect(rulesOn("form_meta")).toEqual(["rls_form_meta_admin"]);
    expect(rls.rules.rls_form_meta_admin).toBe(admin("form_meta"));
  });

  test("form_response: respondent + admin; no org, owner or submitting-identity rule", () => {
    expect(rulesOn("form_response")).toEqual(["rls_form_response_admin", "rls_form_response_respondent"]);
    expect(rls.rules.rls_form_response_respondent).toBe(member("form_response", "respondentMemberId"));
    expect(rls.rules.rls_form_response_admin).toBe(admin("form_response"));
    for (const sql of Object.values(rls.rules)) {
      if (baseTable(sql) === "form_response") expect(sql).not.toContain("submittedByIdentity");
    }
  });

  test("form_response_review: admin only — a reviewer's note never reaches the respondent", () => {
    expect(rulesOn("form_response_review")).toEqual(["rls_form_response_review_admin"]);
    expect(rls.rules.rls_form_response_review_admin).toBe(admin("form_response_review"));
    expect(TABLES_SRC).toMatch(/name: 'form_period_mark',\n\s*public: false/);
    expect(Object.values(rls.rules).some((sql) => baseTable(sql) === "form_period_mark")).toBe(false);
  });

  test("form_assignment and form_completion are org-scoped on organizationId, nothing else", () => {
    for (const table of ["form_assignment", "form_completion"]) {
      expect(rls.orgScoped).toContain(table);
      expect(rulesOn(table)).toEqual([`rls_${table}_member`]);
      expect(rls.rules[`rls_${table}_member`]).toBe(
        `SELECT x.* FROM ${table} x JOIN org_membership_index mi ON x.organizationId = mi.organizationId ` +
          "WHERE mi.userId = :sender",
      );
    }
  });

  test("form_public: the service identity only, through drive_service_reader (U14 extension)", () => {
    expect(rulesOn("form_public")).toEqual(["rls_form_public_service"]);
    expect(rls.rules.rls_form_public_service).toBe(
      "SELECT p.* FROM form_public p JOIN drive_service_reader r ON p.scope = r.scope WHERE r.userId = :sender",
    );
  });

  test("no Forms table is org-scoped except assignments and completions, nor self/reader-scoped or unfiltered", () => {
    for (const table of ["form", "form_meta", "form_response", "form_response_review", "form_public"]) expect(orgScopedNames).not.toContain(table);
    for (const table of FORM_TABLES) {
      expect(rls.selfScoped.map(([t]) => t)).not.toContain(table);
      expect(rls.readerScoped.map(([t]) => t)).not.toContain(table);
      expect(rls.unfiltered).not.toContain(table);
    }
    // No IN and no service_identity cross join in any Forms rule (option columns: see the table tests).
    for (const table of FORM_TABLES) {
      for (const name of rulesOn(table)) {
        expect(rls.rules[name]).not.toMatch(/\bIN\s*\(/i);
        expect(rls.rules[name]).not.toContain("service_identity");
      }
    }
  });
});

const S = "t.string()";
const PK = "t.string().primaryKey()";
const TS = "t.timestamp()";
const COLUMNS: Record<string, string[][]> = {
  form: [
    ["id", PK], ["organizationId", S], ["adminScope", S], ["ownerMemberId", S], ["title", S], ["kind", S],
    ["status", S], ["audience", S], ["memberVisible", "t.bool()"], ["definitionJson", S], ["definitionBytes", "t.u32()"],
    ["version", "t.u32()"], ["perMember", S], ["responseLimit", "t.u32()"], ["closesAt", "t.u64()"],
    ["publicEnabled", "t.bool()"], ["hasFileQuestions", "t.bool()"], ["trackCompletion", "t.bool()"],
    ["notifyOwner", "t.bool()"], ["createdByMemberId", S], ["updatedByMemberId", S], ["createdAt", TS], ["updatedAt", TS],
  ],
  form_meta: [
    ["formId", PK], ["organizationId", S], ["adminScope", S], ["ownerMemberId", S], ["publicToken", S],
    ["responseCount", "t.u32()"], ["answerBytes", "t.u64()"], ["fileBytes", "t.u64()"], ["fileCount", "t.u32()"],
    ["lastResponseAt", "t.u64()"], ["publicWindowStart", "t.u64()"], ["publicWindowCount", "t.u32()"], ["updatedAt", TS],
    ["publicResponseCount", "t.u32()"], ["publicAnswerBytes", "t.u64()"], ["publicPrevWindowCount", "t.u32()"],
  ],
  form_response: [
    ["id", PK], ["organizationId", S], ["formId", S], ["adminScope", S], ["formOwnerMemberId", S],
    ["respondentMemberId", S], ["respondentName", S], ["formTitle", S], ["formVersion", "t.u32()"], ["source", S],
    ["submittedByIdentity", "t.identity()"], ["answersJson", S], ["answerBytes", "t.u32()"], ["fileItemIds", S],
    ["fileBytes", "t.u64()"], ["period", S], ["date", S], ["reviewStatus", S], ["createdAt", TS], ["updatedAt", TS],
  ],
  form_response_review: [
    ["responseId", PK], ["organizationId", S], ["formId", S], ["adminScope", S], ["reviewNote", S],
    ["reviewedByName", S], ["noteBytes", "t.u32()"], ["updatedAt", TS],
  ],
  form_period_mark: [["id", PK], ["organizationId", S], ["formId", S], ["memberId", S], ["count", "t.u32()"]],
  form_assignment: [
    ["id", PK], ["organizationId", S], ["formId", S], ["memberId", S], ["dueDate", S], ["createdByMemberId", S],
    ["createdAt", TS],
  ],
  form_completion: [
    ["id", PK], ["organizationId", S], ["formId", S], ["memberId", S], ["memberName", S], ["period", S], ["date", S],
    ["completedAt", TS],
  ],
  form_public: [
    ["token", PK], ["scope", S], ["formId", S], ["organizationId", S], ["storeName", S], ["title", S],
    ["definitionJson", S], ["version", "t.u32()"], ["status", S], ["closesAt", "t.u64()"], ["updatedAt", TS],
  ],
};

describe("Forms tables (design B.2)", () => {
  test("columns are exactly the design's, in order, all plain types (no t.option anywhere)", () => {
    for (const [table, columns] of Object.entries(COLUMNS)) expect([table, columnsOf(TABLES_SRC, table)]).toEqual([table, columns]);
    expect(TABLES_SRC).not.toContain("t.option(");
  });

  test("every column a Forms rule joins or filters on is indexed", () => {
    const needs: Record<string, string[]> = {
      form: ["organizationId", "ownerMemberId", "adminScope"],
      form_meta: ["ownerMemberId", "adminScope", "organizationId"],
      form_response: ["respondentMemberId", "formOwnerMemberId", "adminScope", "organizationId", "formId"],
      form_response_review: ["adminScope", "formId"],
      form_period_mark: ["formId"],
      form_assignment: ["organizationId", "formId", "memberId"],
      form_completion: ["organizationId", "formId", "memberId"],
      form_public: ["scope", "formId"],
    };
    for (const [table, columns] of Object.entries(needs)) {
      const indexed = indexedColumnsOf(TABLES_SRC, table);
      for (const c of columns) expect(`${table}.${c}:${indexed.has(c)}`).toBe(`${table}.${c}:true`);
    }
  });

  test("every Forms table is public, defined once in forms/tables.ts and registered in the schema", () => {
    for (const table of FORM_TABLES) {
      expect(TABLES_SRC.split(`name: '${table}',`).length - 1).toBe(1);
      expect(TABLES_SRC).toMatch(new RegExp(`name: '${table}',\\n\\s*public: true`));
      expect(INDEX_SRC).not.toContain(`name: '${table}',`);
      const accessor = table.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
      expect(INDEX_SRC).toContain(`  ${accessor}: ${accessor}Table,\n`);
      expect(rulesOn(table).length).toBeGreaterThan(0);
    }
  });
});
