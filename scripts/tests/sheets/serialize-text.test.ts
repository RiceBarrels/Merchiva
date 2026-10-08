// lib/sheets/serialize-text.ts — the search text and cell count stored with every spreadsheet snapshot
// (sheets.md §4.8): tab order of sheets, numeric row/column order, hidden sheets, every cell kind, the
// character clamp and the non-empty cell count.

import { describe, expect, test } from "bun:test";
import type { ICellData, IWorkbookData, IWorksheetData } from "@univerjs/presets";
import { SHEET_TEXT_MAX_CHARS } from "@/lib/sheets/constants";
import { serializeSheetText, sheetCellText } from "@/lib/sheets/serialize-text";

type Cells = Record<number, Record<number, ICellData | null>>;

function wb(sheets: Array<{ id: string; name: string; hidden?: number; cells: Cells }>, order = sheets.map((s) => s.id)): IWorkbookData {
  return {
    id: "u", name: "wb", appVersion: "1.0.2", locale: "enUS" as IWorkbookData["locale"], styles: {}, sheetOrder: order,
    sheets: Object.fromEntries(sheets.map((s) => [s.id, {
      id: s.id, name: s.name, hidden: s.hidden as 0 | 1 | undefined,
      // null cells are deliberate: stored data may hold them even though the type does not.
      cellData: s.cells as unknown as IWorksheetData["cellData"],
    }])),
  };
}

const rich = (text: string): ICellData => ({ p: { id: "d", documentStyle: {}, body: { dataStream: `${text}\r\n` } } });

describe("serializeSheetText", () => {
  test("sheets follow the tab order; rows and columns sort numerically; blank line between sheets", () => {
    const book = wb([
      { id: "b", name: "Second", cells: { 0: { 0: { v: "x" } } } },
      { id: "a", name: "First", cells: { 10: { 0: { v: "row10" } }, 2: { 11: { v: "c11" }, 3: { v: "c3" } } } },
    ], ["a", "b"]);
    expect(serializeSheetText(book).plainText).toBe("First\nc3\tc11\nrow10\n\nSecond\nx");
  });

  test("hidden and very hidden sheets are left out of the text but their cells are counted", () => {
    const book = wb([
      { id: "a", name: "Shown", cells: { 0: { 0: { v: 1 } } } },
      { id: "h", name: "Payroll", hidden: 1, cells: { 0: { 0: { v: "secret" }, 1: { v: 2 } } } },
      { id: "v", name: "Very", hidden: 2, cells: { 0: { 0: { v: "also hidden" } } } },
    ]);
    const { plainText, cellCount } = serializeSheetText(book);
    expect(plainText).toBe("Shown\n1");
    expect(cellCount).toBe(4);
  });

  test("cell kinds: rich text, cached formula value, formula text, booleans, numbers", () => {
    const book = wb([{
      id: "a", name: "S",
      cells: {
        0: {
          0: rich("Hello"), 1: { f: "=SUM(A1:A2)", v: 42, t: 2 }, 2: { f: "=NOW()" }, 3: { v: 1, t: 3 }, 4: { v: 0, t: 3 },
          5: { v: 3.25, t: 2 }, 6: { v: true } as unknown as ICellData, 7: { v: -5, t: 2 },
        },
      },
    }]);
    expect(serializeSheetText(book).plainText).toBe("S\nHello\t42\t=NOW()\tTRUE\tFALSE\t3.25\tTRUE\t-5");
  });

  test("tabs, newlines and other control characters inside a cell become spaces", () => {
    expect(sheetCellText({ v: "a\tb\nc\rd\u0007e" })).toBe("a b c d e");
    expect(sheetCellText(rich("two\nlines"))).toBe("two lines");
    const book = wb([{ id: "a", name: "Tab\tName", cells: { 0: { 0: { v: "x\ty" } } } }]);
    expect(serializeSheetText(book).plainText).toBe("Tab Name\nx y");
  });

  test("rich text wins over a value; an empty rich text falls back to the value", () => {
    expect(sheetCellText({ ...rich("shown"), v: "hidden" })).toBe("shown");
    expect(sheetCellText({ p: { id: "d", documentStyle: {}, body: { dataStream: "\r\n" } }, v: 7 })).toBe("7");
    expect(sheetCellText(null)).toBe("");
  });

  test("the count: cells with a value, a formula, a shared formula or rich text", () => {
    const book = wb([{
      id: "a", name: "S",
      cells: {
        0: { 0: { v: 1 }, 1: { v: "" }, 2: { s: "style-only" }, 3: null, 4: { f: "=A1" }, 5: { si: "shared-1" }, 6: rich("r") },
        1: {},
      },
    }]);
    const { plainText, cellCount } = serializeSheetText(book);
    expect(cellCount).toBe(4);
    // A shared-formula follower without a cached value has no text; the empty row is not a line.
    expect(plainText).toBe("S\n1\t=A1\tr");
  });

  test("clamps to maxChars without splitting a surrogate pair, and keeps counting past the clamp", () => {
    const book = wb([{ id: "a", name: "S", cells: { 0: { 0: { v: "ab😀cd" } }, 1: { 0: { v: "more" } } } }]);
    expect(serializeSheetText(book, 5).plainText).toBe("S\nab");
    expect(serializeSheetText(book, 6).plainText).toBe("S\nab😀");
    expect(serializeSheetText(book, 5).cellCount).toBe(2);
  });

  test("the default clamp is DOC_TEXT_MAX_CHARS", () => {
    const cells: Cells = {};
    for (let r = 0; r < 3000; r++) cells[r] = { 0: { v: "x".repeat(100) } };
    const book = wb([
      { id: "a", name: "Big", cells },
      { id: "b", name: "After", cells: { 0: { 0: { v: 1 } } } },
    ]);
    const { plainText, cellCount } = serializeSheetText(book);
    expect(plainText.length).toBe(SHEET_TEXT_MAX_CHARS);
    expect(SHEET_TEXT_MAX_CHARS).toBe(200_000);
    expect(cellCount).toBe(3001);
  });

  test("a malformed workbook yields empty text instead of throwing", () => {
    const broken = { ...wb([]), sheetOrder: ["missing"], sheets: {} } as IWorkbookData;
    expect(serializeSheetText(broken)).toEqual({ plainText: "", cellCount: 0 });
  });
});
