// lib/drive/queries.ts (the "is Drive published?" probe) and lib/docs/queries.ts
// sheetLiveQueries. docScopedSql already equals the SDK query builder
// (scripts/tests/docs/queries.test.ts), so what is left to prove is that every
// table and column named here exists in the module source: SQL names are the
// snake_case of the table's `name` and of its column accessors.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { docLiveQueries, sheetLiveQueries } from "@/lib/docs/queries";
import { driveProbeQueries } from "@/lib/drive/queries";

const MODULE_DIR = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src");
const DOC_ID = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const SQL_RE = /^SELECT \* FROM "([a-z_]+)" WHERE "\1"\."([a-z_]+)" = '(.*)'$/;

const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** SQL table name → its SQL column names, for every `table({ name: '…' }, { …columns })` in `file`. */
function moduleTables(file: string): Map<string, Set<string>> {
  const path = join(MODULE_DIR, file);
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2022, true);
  const out = new Map<string, Set<string>>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "table" && node.arguments.length >= 2) {
      const [options, columns] = node.arguments;
      if (ts.isObjectLiteralExpression(options) && ts.isObjectLiteralExpression(columns)) {
        const nameProp = options.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source) === "name");
        if (nameProp && ts.isPropertyAssignment(nameProp) && ts.isStringLiteral(nameProp.initializer)) {
          const cols = columns.properties.filter(ts.isPropertyAssignment).map((p) => snake(p.name.getText(source)));
          out.set(nameProp.initializer.text, new Set(cols));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const schema = new Map([...moduleTables("index.ts"), ...moduleTables(join("drive", "tables.ts"))]);

function parsed(query: string): { table: string; column: string; value: string } {
  const match = SQL_RE.exec(query);
  if (!match) throw new Error(`unexpected query shape: ${query}`);
  return { table: match[1], column: match[2], value: match[3] };
}

describe("module schema scan", () => {
  test("finds the Docs and Drive tables", () => {
    expect(schema.get("document")?.has("organization_id")).toBe(true);
    expect(schema.get("drive_item")?.has("uploader_identity")).toBe(true);
  });
});

describe("driveProbeQueries", () => {
  test("zero-row queries over the four client Drive tables and document_file", () => {
    expect(driveProbeQueries()).toEqual([
      `SELECT * FROM "drive_item" WHERE "drive_item"."id" = ''`,
      `SELECT * FROM "drive_usage" WHERE "drive_usage"."organization_id" = ''`,
      `SELECT * FROM "drive_star" WHERE "drive_star"."id" = ''`,
      `SELECT * FROM "drive_notice_ack" WHERE "drive_notice_ack"."id" = ''`,
      `SELECT * FROM "document_file" WHERE "document_file"."document_id" = ''`,
    ]);
  });

  test("never queries `document`: its columns are frozen for older clients, type and folder are document_file's", () => {
    for (const query of driveProbeQueries()) expect(parsed(query).table).not.toBe("document");
  });

  test("every table and column exists in the module", () => {
    for (const query of driveProbeQueries()) {
      const { table, column } = parsed(query);
      expect({ table, column, exists: schema.get(table)?.has(column) ?? false }).toEqual({ table, column, exists: true });
    }
  });

  test("never touches the rule-free join targets or private state", () => {
    const tables = driveProbeQueries().map((q) => parsed(q).table);
    for (const hidden of ["document_reader_index", "drive_admin_index", "drive_org_state", "drive_service_reader", "drive_blob_gc"]) {
      expect(tables).not.toContain(hidden);
    }
  });
});

describe("sheetLiveQueries", () => {
  test("the document's live set plus its edit lease", () => {
    expect(sheetLiveQueries(DOC_ID)).toEqual([
      ...docLiveQueries(DOC_ID),
      `SELECT * FROM "document_edit_lease" WHERE "document_edit_lease"."document_id" = '${DOC_ID}'`,
    ]);
    expect(sheetLiveQueries(DOC_ID.toUpperCase())).toEqual(sheetLiveQueries(DOC_ID));
    for (const query of sheetLiveQueries(DOC_ID)) {
      const { table, column, value } = parsed(query);
      expect(value).toBe(DOC_ID);
      expect({ table, column, exists: schema.get(table)?.has(column) ?? false }).toEqual({ table, column, exists: true });
    }
  });

  test("rejects anything that isn't a v4 UUID", () => {
    for (const bad of ["", "abc", `${DOC_ID}' OR '1'='1`]) expect(() => sheetLiveQueries(bad)).toThrow("Invalid document id");
  });
});
