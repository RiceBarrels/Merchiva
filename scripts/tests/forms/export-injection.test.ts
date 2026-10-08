// lib/forms/export.ts: respondent-typed cells can never run as spreadsheet formulas in the CSV, numbers stay
// numeric, option ids never leak, and the export uses the safe sheets CSV helpers (not lib/export.ts).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORM_EXPORT_KEYS, buildResponseTable, responseTableToCsv, responsesToCsv, type ExportResponse } from "@/lib/forms/export";
import { parseCsv } from "@/lib/sheets/xlsx/csv";
import type { Answers, FormDefinitionV1 } from "@/lib/forms/types";
import type { ResponseTable } from "@/lib/forms/export";
import { responseTableWorkbook } from "@/components/forms/responses/response-workbook";
import { CELL_TYPE } from "@/lib/sheets/univer-constants";

const Q = {
  name: "q_000000000001",
  color: "q_000000000002",
  ok: "q_000000000003",
  temp: "q_000000000004",
  photo: "q_000000000005",
  tags: "q_000000000006",
  sec: "q_000000000007",
} as const;

const DEF: FormDefinitionV1 = {
  v: 1,
  title: "Check",
  description: "",
  settings: { confirmation: "" },
  questions: [
    { id: Q.sec, type: "section", title: "S", required: false },
    { id: Q.name, type: "short_text", title: "=HYPERLINK(\"http://evil\")", required: false },
    { id: Q.color, type: "single_choice", title: "Color", required: false, options: [{ id: "o_0000000r", label: "@SUM(A1)" }] },
    { id: Q.ok, type: "yes_no", title: "OK", required: false },
    { id: Q.temp, type: "number", title: "Temp", required: false },
    { id: Q.photo, type: "photo", title: "Photo", required: false, maxFiles: 3 },
    { id: Q.tags, type: "multi_choice", title: "Tags", required: false, options: [{ id: "o_0000000a", label: "A, big" }, { id: "o_0000000b", label: "B" }] },
  ],
};

const t = (key: string) => `[${key}]`;

function resp(minute: number, name: string, answers: Answers): ExportResponse {
  return { answers, respondentName: name, source: "store", reviewStatus: "new", createdAt: new Date(Date.UTC(2026, 9, 6, 8, minute)) };
}

const PAYLOADS = ["=1+1", "+1", "-cmd|' /C calc'!A0", "@SUM(A1)", "\t=1", "\r=1", "  =1", "＝1", "＋1", "－1", "＠1"];

describe("forms CSV export", () => {
  test("every formula-like text cell is prefixed with an apostrophe", () => {
    const responses = PAYLOADS.map((p, i) => resp(i, p, { [Q.name]: p }));
    const csv = responsesToCsv(DEF, responses, { t });
    const rows = parseCsv(csv.replace(/^﻿/, ""));
    const nameCol = rows[0].findIndex((h) => h.includes("HYPERLINK"));
    expect(rows[0][nameCol].startsWith("'=")).toBe(true); // header (question title) is sanitized too
    for (let i = 0; i < PAYLOADS.length; i++) {
      expect(rows[i + 1][1]).toBe(`'${PAYLOADS[i]}`); // respondent name
      expect(rows[i + 1][nameCol]).toBe(`'${PAYLOADS[i]}`);
    }
  });

  test("option labels are sanitized; real numbers stay numeric, including negatives", () => {
    const csv = responsesToCsv(DEF, [resp(0, "Ana", { [Q.color]: "o_0000000r", [Q.temp]: -18.5 })], { t });
    const [header, row] = parseCsv(csv.replace(/^﻿/, ""));
    expect(row[header.indexOf("Color")]).toBe("'@SUM(A1)");
    expect(row[header.indexOf("Temp")]).toBe("-18.5");
  });

  test("CSV has a UTF-8 BOM, CRLF records and RFC 4180 quoting", () => {
    const csv = responsesToCsv(DEF, [resp(0, "Ana", { [Q.name]: "line1\nline \"2\"", [Q.tags]: ["o_0000000a", "o_0000000b"] })], { t });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(2); // header + row (its embedded LF is quoted), no trailing CRLF
    const [header, row] = parseCsv(csv.slice(1));
    expect(row[header.indexOf("'=HYPERLINK(\"http://evil\")")]).toBe("line1\nline \"2\"");
    expect(row[header.indexOf("Tags")]).toBe("A, big; B");
  });
});

describe("response table", () => {
  test("meta columns, question columns in order, sections skipped, oldest first", () => {
    const table = buildResponseTable(DEF, [
      resp(5, "", { [Q.ok]: true, [Q.photo]: { driveItemIds: ["0a1b2c3d-0000-4000-8000-000000000001", "0a1b2c3d-0000-4000-8000-000000000002"] } }),
      resp(1, "Ana", { [Q.ok]: false, [Q.color]: "o_gone0000" }),
    ], { t, formatTimestamp: (d) => `T${d.getUTCMinutes()}` });
    expect(table.columns.map((c) => c.id)).toEqual(["submittedAt", "respondent", "source", "reviewStatus", Q.name, Q.color, Q.ok, Q.temp, Q.photo, Q.tags]);
    expect(table.rows[0].slice(0, 4)).toEqual(["T1", "Ana", "[forms.export.source.store]", "[forms.export.review.new]"]);
    expect(table.rows[0][5]).toBe("[forms.export.removedOption]"); // never the raw option id
    expect(table.rows[0][6]).toBe("[forms.export.no]");
    expect(table.rows[1][1]).toBe("[forms.export.anonymous]");
    expect(table.rows[1][6]).toBe("[forms.export.yes]");
    expect(table.rows[1][8]).toBe(2); // file count, numeric
    expect(table.rows[1][7]).toBe(""); // unanswered
    expect(JSON.stringify(table)).not.toContain("o_gone0000");
  });

  test("an empty table still has its header row", () => {
    const csv = responseTableToCsv(buildResponseTable(DEF, [], { t }));
    expect(parseCsv(csv.slice(1))).toHaveLength(1);
  });

  test("every key the export uses is listed in FORM_EXPORT_KEYS", () => {
    const used = new Set<string>();
    const spy = (key: string) => {
      used.add(key);
      return key;
    };
    buildResponseTable(DEF, [
      resp(0, "", { [Q.ok]: true, [Q.color]: "o_gone0000" }),
      { ...resp(1, "B", { [Q.ok]: false }), source: "public", reviewStatus: "reviewed" },
    ], { t: spy });
    for (const key of used) expect(FORM_EXPORT_KEYS).toContain(key);
  });

  test("uses the safe sheets CSV helpers, never lib/export.ts", () => {
    const src = readFileSync(join(import.meta.dir, "../../../lib/forms/export.ts"), "utf8");
    expect(src).toContain("@/lib/sheets/xlsx/csv");
    expect(src).not.toMatch(/from\s+["']@\/lib\/export["']/);
    expect(src).not.toContain("downloadCSV(");
  });
});

describe("spreadsheet export", () => {
  test("text answers stay text; only real numbers are number cells", () => {
    const table = {
      columns: [{ header: "Employee ID" }, { header: "Price" }, { header: "Count" }],
      rows: [["1.50", "1e3", 7], ["=1+1", "00721", 2.5]],
    } as unknown as ResponseTable;
    const wb = responseTableWorkbook(table, { name: "R", sheetName: "Responses", locale: "enUS" as never });
    const cells = wb.sheets[wb.sheetOrder[0]].cellData ?? {};
    expect(cells[1][0]).toEqual({ v: "1.50", t: CELL_TYPE.STRING });
    expect(cells[1][1]).toEqual({ v: "1e3", t: CELL_TYPE.STRING });
    expect(cells[1][2]).toEqual({ v: 7, t: CELL_TYPE.NUMBER });
    expect(cells[2][0]).toEqual({ v: "=1+1", t: CELL_TYPE.STRING });
    expect(cells[2][1]).toEqual({ v: "00721", t: CELL_TYPE.STRING });
    expect(cells[2][2]).toEqual({ v: 2.5, t: CELL_TYPE.NUMBER });
  });
});
