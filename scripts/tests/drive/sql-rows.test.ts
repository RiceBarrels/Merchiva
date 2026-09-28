// Decoding HTTP /sql answers (lib/drive/server/sql-rows.ts). The schema below is
// the one the local 2.10.1 staging server returned for the /api/drive/url query
// (column names as written in the query); rows are positional arrays.

import { describe, expect, test } from "bun:test";
import { dedupeRowsBy, sqlNumber, sqlRows, sqlString } from "@/lib/drive/server/sql-rows";

const STRING = { String: [] };
const DRIVE_ITEM_RESULT = [{
  schema: {
    elements: [
      { name: { some: "id" }, algebraic_type: STRING },
      { name: { some: "kind" }, algebraic_type: STRING },
      { name: { some: "status" }, algebraic_type: STRING },
      { name: { some: "blob_key" }, algebraic_type: STRING },
      { name: { some: "size_bytes" }, algebraic_type: { U64: [] } },
      { name: { some: "trashed" }, algebraic_type: { Bool: [] } },
      { name: {}, algebraic_type: STRING },
    ],
  },
  rows: [
    ["i1", "file", "ready", "org/o/i1/b/a.pdf", 1048576, false, "unnamed"],
    ["i2", "folder", "ready", "", 0, true, "unnamed"],
    ["i1", "file", "ready", "org/o/i1/b/a.pdf", 1048576, false, "unnamed"],
  ],
  total_duration_micros: 120,
  stats: { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 },
}];

describe("sqlRows", () => {
  test("keys each row by column name and skips unnamed columns", () => {
    const rows = sqlRows(DRIVE_ITEM_RESULT);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ id: "i1", kind: "file", status: "ready", blob_key: "org/o/i1/b/a.pdf", size_bytes: 1048576, trashed: false });
    expect(rows[1].trashed).toBe(true);
  });

  test("reads only the first result set; none → []", () => {
    expect(sqlRows([])).toEqual([]);
    const second = { schema: { elements: [{ name: { some: "x" } }] }, rows: [["ignored"]] };
    expect(sqlRows([{ schema: { elements: [{ name: { some: "x" } }] }, rows: [] }, second])).toEqual([]);
  });
});

describe("dedupeRowsBy", () => {
  test("keeps the first row per id (HTTP /sql repeats a row once per matching RLS rule)", () => {
    const rows = sqlRows(DRIVE_ITEM_RESULT);
    const unique = dedupeRowsBy(rows, "id");
    expect(unique.map((r) => r.id)).toEqual(["i1", "i2"]);
    expect(unique[0]).toBe(rows[0]);
  });

  test("compares object values (uuid / identity columns) structurally", () => {
    const rows = [{ id: { __uuid__: 7 }, n: 1 }, { id: { __uuid__: 7 }, n: 2 }, { id: { __uuid__: 8 }, n: 3 }];
    expect(dedupeRowsBy(rows, "id").map((r) => r.n)).toEqual([1, 3]);
  });

  test("rows without the column collapse into one", () => {
    expect(dedupeRowsBy([{ a: 1 }, { a: 2 }], "id")).toEqual([{ a: 1 }]);
  });
});

describe("sqlString / sqlNumber", () => {
  const row = { s: "text", n: 42, big: 9007199254740991n, str: "123", empty: "", bad: "x1", obj: { some: "v" } };
  test("strings", () => {
    expect(sqlString(row, "s")).toBe("text");
    expect(sqlString(row, "n")).toBe("");
    expect(sqlString(row, "missing")).toBe("");
    expect(sqlString(row, "obj")).toBe("");
  });
  test("numbers (u64 as number, numeric string or bigint)", () => {
    expect(sqlNumber(row, "n")).toBe(42);
    expect(sqlNumber(row, "big")).toBe(9007199254740991);
    expect(sqlNumber(row, "str")).toBe(123);
    expect(sqlNumber(row, "empty")).toBe(0);
    expect(sqlNumber(row, "bad")).toBe(0);
    expect(sqlNumber(row, "missing")).toBe(0);
    expect(sqlNumber(row, "obj")).toBe(0);
  });
});
