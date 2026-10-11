// Static shape of the notification side tables and their row-level security,
// read from the REAL module source (spacetimedb/src/index.ts + spacetimedb/src/notify/tables.ts).
// The RLS section of index.ts is evaluated with a stub `clientVisibilityFilter`
// that returns its SQL, so these assertions see exactly what a publish would create.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { moduleSourceFiles, readModuleTables } from "../drive/module-tables";

const MODULE_SRC = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src");
const INDEX_SRC = readFileSync(join(MODULE_SRC, "index.ts"), "utf8");
const TABLES_SRC = readFileSync(join(MODULE_SRC, "notify", "tables.ts"), "utf8");
const TABLES = readModuleTables(moduleSourceFiles(MODULE_SRC)).tables;

function evaluateRlsSection(source: string): { rules: Record<string, string>; selfScoped: Array<[string, string]> } {
  const start = source.indexOf("const RLS_ORG_SCOPED");
  const end = source.indexOf("export const rowLevelSecurity");
  const js = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function("spacetimedb", `"use strict";\n${js}\nreturn { rules: rlsRules, selfScoped: RLS_SELF_SCOPED };`)(
    { clientVisibilityFilter: { sql: (sql: string) => sql } },
  );
}

const rls = evaluateRlsSection(INDEX_SRC);
const PRIVATE = [
  "chat_pin_notice", "chat_notice_unread", "notification_email_state", "store_sos_state", "notification_quota", "notification_urgent",
];
const rulesOn = (table: string) =>
  Object.entries(rls.rules).filter(([, sql]) => new RegExp(`\\bFROM ${table}\\b`).test(sql)).map(([name]) => name).sort();

/** Columns with a btree index on a table definition of notify/tables.ts. */
function indexedColumns(table: string): Set<string> {
  const at = TABLES_SRC.indexOf(`name: '${table}'`);
  const body = TABLES_SRC.slice(at, TABLES_SRC.indexOf("\n);", at));
  return new Set([...body.matchAll(/columns: \['(\w+)'\]/g)].map((m) => m[1]));
}

describe("notification side tables", () => {
  test("notification_delivery keeps the spec's columns in order (it freezes at first publish)", () => {
    expect(TABLES.get("notification_delivery")?.columns.map(([c]) => c)).toEqual([
      "notificationId", "organizationId", "targetId", "scope", "runId", "claimed", "dueAtMicros", "template", "params",
      "sourceKind", "sourceId", "contextId", "title", "body", "link", "email", "push", "pushTargets", "subject",
      "issuer", "locale", "attempts", "createdAt",
    ]);
    expect(TABLES.get("notification_pref")?.columns.map(([c]) => c)).toEqual([
      "userId", "subject", "issuer", "emailEnabled", "locale", "updatedAt",
    ]);
    expect(TABLES.get("chat_follow")?.columns.map(([c]) => c)).toEqual(["id", "organizationId", "userId", "targetHex", "createdAt"]);
  });

  test("no option column anywhere (every one may be filtered, indexed or used by a rule)", () => {
    for (const name of ["notification_delivery", "notification_pref", "chat_follow", ...PRIVATE]) {
      for (const [, type] of TABLES.get(name)?.columns ?? []) expect(type).not.toContain("t.option");
    }
  });

  test("the three public tables are public; pin notice, unread index, email pacing, SOS state, quotas and the SOS lane are private", () => {
    for (const name of ["notification_delivery", "notification_pref", "chat_follow"]) expect(TABLES.get(name)?.isPublic).toBe(true);
    for (const name of PRIVATE) expect(TABLES.get(name)?.isPublic).toBe(false);
  });

  test("the RLS and scan columns are indexed", () => {
    const d = indexedColumns("notification_delivery");
    for (const c of ["targetId", "scope", "runId", "dueAtMicros"]) expect(d.has(c)).toBe(true);
    const f = indexedColumns("chat_follow");
    for (const c of ["organizationId", "userId", "targetHex"]) expect(f.has(c)).toBe(true);
  });
});

describe("notification rules", () => {
  test("delivery, preference and follows are self-scoped", () => {
    for (const pair of [["notification_delivery", "targetId"], ["notification_pref", "userId"], ["chat_follow", "userId"]]) {
      expect(rls.selfScoped).toContainEqual(pair as [string, string]);
    }
    expect(rls.rules.rls_notification_pref_self).toBe("SELECT * FROM notification_pref WHERE userId = :sender");
  });

  test("the service identity reads notification_delivery through drive_service_reader; preference and follows have no service rule", () => {
    expect(rulesOn("notification_delivery")).toEqual(["rls_notification_delivery_self", "rls_notification_delivery_service"]);
    expect(rls.rules.rls_notification_delivery_service).toBe(
      "SELECT d.* FROM notification_delivery d JOIN drive_service_reader r ON d.scope = r.scope WHERE r.userId = :sender",
    );
    expect(rulesOn("notification_pref")).toEqual(["rls_notification_pref_self"]);
    expect(rulesOn("chat_follow")).toEqual(["rls_chat_follow_self"]);
    for (const name of PRIVATE) expect(rulesOn(name)).toEqual([]);
  });
});
