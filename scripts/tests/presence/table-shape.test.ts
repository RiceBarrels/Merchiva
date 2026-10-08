// Static shape of the page_presence table, read from the REAL module source.
// The column order is published: a reorder forces a destructive migration, so
// this pins it; new columns may only be appended.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODULE_SRC = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src");
const TABLES_SRC = readFileSync(join(MODULE_SRC, "presence", "tables.ts"), "utf8");
const INDEX_SRC = readFileSync(join(MODULE_SRC, "index.ts"), "utf8");

function columnsOf(source: string, tableName: string): Array<[string, string]> {
  const at = source.indexOf(`name: '${tableName}',`);
  if (at < 0) throw new Error(`table ${tableName} not found`);
  const body = source.slice(at, source.indexOf("\n);", at));
  return [...body.matchAll(/^ {4}(\w+):\s*(t\.[^,\n]+)/gm)].map((m): [string, string] => [m[1], m[2].trim()]);
}

const PUBLISHED_COLUMNS: Array<[string, string]> = [
  ["id", "t.string().primaryKey()"],
  ["organizationId", "t.string()"],
  ["connectionId", "t.string()"],
  ["identity", "t.identity()"],
  ["memberId", "t.string()"],
  ["kind", "t.string()"],
  ["slot", "t.string()"],
  ["name", "t.string()"],
  ["avatarUrl", "t.string()"],
  ["pagePath", "t.string()"],
  ["anchor", "t.string()"],
  ["anchorX", "t.f64()"],
  ["anchorY", "t.f64()"],
  ["pointX", "t.f64()"],
  ["pointY", "t.f64()"],
  ["clickSeq", "t.u32()"],
  ["activity", "t.string()"],
  ["updatedAt", "t.timestamp()"],
];

describe("page_presence table", () => {
  test("published columns keep their order and types (append only)", () => {
    const cols = columnsOf(TABLES_SRC, "page_presence");
    expect(cols.slice(0, PUBLISHED_COLUMNS.length)).toEqual(PUBLISHED_COLUMNS);
  });

  test("is public, indexed on its RLS and disconnect columns, and has no option columns", () => {
    expect(TABLES_SRC).toMatch(/name: 'page_presence',\n\s+public: true,/);
    expect(TABLES_SRC).toContain("columns: ['organizationId']");
    expect(TABLES_SRC).toContain("columns: ['connectionId']");
    for (const [, type] of columnsOf(TABLES_SRC, "page_presence")) expect(type).not.toContain("option");
  });

  test("is registered, org-scoped by RLS and cleaned up on disconnect", () => {
    expect(INDEX_SRC).toContain("pagePresence: pagePresenceTable,");
    const rls = INDEX_SRC.slice(INDEX_SRC.indexOf("const RLS_ORG_SCOPED"), INDEX_SRC.indexOf("const RLS_SELF_SCOPED"));
    expect(rls).toContain("'page_presence'");
    const onDisconnect = INDEX_SRC.slice(INDEX_SRC.indexOf("export const onDisconnect"));
    expect(onDisconnect.slice(0, onDisconnect.indexOf("\n});"))).toContain("ctx.db.pagePresence.byConnectionId.filter(connectionId)");
  });
});
