// lib/sheets/univer/peer-highlight.ts (sheets.md §6, §8.1 highlightPeer; W1.2b#1): awareness bounds a peer's range
// only by the whole 1,048,576 × 16,384 grid, so the outline is cut to the sheet it names before FRange.highlight, and
// a range that starts past that sheet's last row or column draws nothing. Over a stand-in facade (the mark-selection
// layer needs Univer's UI plugins, which the headless instance does not load).

import { describe, expect, test } from "bun:test";
import type { FUniver } from "@univerjs/presets";
import { SHEET_UNIT_ID } from "@/lib/sheets/constants";
import type { SheetSelection } from "@/lib/sheets/types";
import { clampSelectionToSheet, createPeerHighlighter } from "@/lib/sheets/univer/peer-highlight";

const SEL: SheetSelection = { sheetId: "s1", startRow: 2, startColumn: 1, endRow: 5, endColumn: 3 };

describe("clampSelectionToSheet", () => {
  test("a range inside the sheet is unchanged; one running past it is cut to its last row and column", () => {
    expect(clampSelectionToSheet(SEL, 1000, 20)).toEqual(SEL);
    expect(clampSelectionToSheet({ ...SEL, endRow: 1_048_575, endColumn: 16_383 }, 1000, 20)).toEqual({ ...SEL, endRow: 999, endColumn: 19 });
    expect(clampSelectionToSheet({ ...SEL, startRow: 999, startColumn: 19, endRow: 999, endColumn: 19 }, 1000, 20))
      .toEqual({ ...SEL, startRow: 999, startColumn: 19, endRow: 999, endColumn: 19 });
  });

  test("a range that starts past the last row or column, or a sheet without size, draws nothing", () => {
    expect(clampSelectionToSheet({ ...SEL, startRow: 1000, endRow: 1_048_575 }, 1000, 20)).toBeNull();
    expect(clampSelectionToSheet({ ...SEL, startColumn: 20, endColumn: 25 }, 1000, 20)).toBeNull();
    for (const [rows, columns] of [[0, 20], [1000, 0], [Number.NaN, 20], [1000, Number.NaN]]) {
      expect(clampSelectionToSheet(SEL, rows, columns)).toBeNull();
    }
  });
});

describe("createPeerHighlighter", () => {
  function facade(rows: number, columns: number) {
    const ranges: number[][] = [];
    const disposed: number[] = [];
    const sheet = {
      getSheetId: () => "s1",
      getMaxRows: () => rows,
      getMaxColumns: () => columns,
      getRange: (row: number, column: number, numRows: number, numColumns: number) => {
        const index = ranges.push([row, column, numRows, numColumns]) - 1;
        return { highlight: () => ({ dispose: () => void disposed.push(index) }) };
      },
    };
    const workbook = {
      getSheetBySheetId: (id: string) => (id === "s1" ? sheet : null),
      getActiveSheet: () => sheet,
    };
    const api = { getWorkbook: (id: string) => (id === SHEET_UNIT_ID ? workbook : null) } as unknown as FUniver;
    return { api, ranges, disposed };
  }

  test("the outline covers the part of the range on the sheet; a range off the sheet clears it and draws nothing", () => {
    const f = facade(1000, 20);
    const highlighter = createPeerHighlighter(f.api);
    highlighter.show({ color: "#2563eb", selection: { ...SEL, endRow: 1_048_575, endColumn: 16_383 } });
    expect(f.ranges).toEqual([[2, 1, 998, 19]]); // rows 2–999, columns 1–19
    highlighter.show({ color: "#2563eb", selection: SEL });
    expect([f.ranges[1], f.disposed]).toEqual([[2, 1, 4, 3], [0]]);
    highlighter.show({ color: "#2563eb", selection: { ...SEL, startRow: 5000, endRow: 5001 } });
    expect([f.ranges.length, f.disposed]).toEqual([2, [0, 1]]);
    highlighter.show({ color: "#2563eb", selection: { ...SEL, sheetId: "s2" } }); // not the sheet on screen
    expect(f.ranges.length).toBe(2);
    highlighter.dispose();
  });

  test("without a facade (headless) it does nothing", () => {
    const highlighter = createPeerHighlighter(null);
    expect(() => highlighter.show({ color: "#2563eb", selection: SEL })).not.toThrow();
    highlighter.dispose();
  });
});
