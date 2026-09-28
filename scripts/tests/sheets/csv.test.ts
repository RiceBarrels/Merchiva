// lib/sheets/xlsx/csv.ts (sheets.md §11.5, §11.7): RFC 4180 parsing (quotes, doubled quotes, line breaks in
// quotes, CRLF / LF / CR, BOM, delimiter detection, Excel's "sep=" line), cell typing that never makes a
// formula and never loses digits, the cell caps, decoding (UTF-16 and legacy encodings), the CSV read path
// as the worker runs it, and the injection-safe export.

import { describe, expect, test } from "bun:test";
import { CELL_TYPE } from "@/lib/sheets/univer-constants";
import {
  csvCell, csvSafeCell, decodeCsvBytes, detectDelimiter, isCsvNumber, parseCsv, sheetToSafeCsv, toCsv,
} from "@/lib/sheets/xlsx/csv";
import { SpreadsheetReadError } from "@/lib/sheets/xlsx/types";
import { firstSheet, readFixture } from "./helpers/xlsx-fixtures";

function tooMany(run: () => unknown): string {
  try {
    run();
    return "ok";
  } catch (err) {
    return err instanceof SpreadsheetReadError ? err.code : String(err);
  }
}

describe("parseCsv (RFC 4180)", () => {
  test("quoted fields, doubled quotes, delimiters and line breaks inside quotes", () => {
    expect(parseCsv('a,"b,c","say ""hi""","two\nlines"\r\n1,2,3,4')).toEqual([
      ["a", "b,c", 'say "hi"', "two\nlines"],
      ["1", "2", "3", "4"],
    ]);
  });

  test("CRLF, LF and CR line ends; a final line break adds no record; empty lines and fields are kept", () => {
    expect(parseCsv("a,b\r\nc,d\ne,f\rg,h\n")).toEqual([["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]]);
    expect(parseCsv("a,,c,\n\nx")).toEqual([["a", "", "c", ""], [""], ["x"]]);
    expect(parseCsv("")).toEqual([]);
  });

  test("a leading BOM is dropped; text after a closing quote is kept (lenient); an unclosed quote runs to the end", () => {
    expect(parseCsv("﻿name,age\nAnn,3")).toEqual([["name", "age"], ["Ann", "3"]]);
    expect(parseCsv('"ab"cd,e')).toEqual([["abcd", "e"]]);
    expect(parseCsv('x,"open\nstill')).toEqual([["x", "open\nstill"]]);
  });

  test("delimiter detection: semicolon, tab and pipe files; commas inside quotes do not count", () => {
    expect(detectDelimiter("a;b;c\n1;2;3\n4;5;6")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter("a|b|c\n1|2|3")).toBe("|");
    expect(detectDelimiter('"x,y";z\n"1,2";3')).toBe(";");
    expect(detectDelimiter("single\ncolumn")).toBe(",");
    expect(parseCsv("sep=;\na;b\n1,5;2")).toEqual([["a", "b"], ["1,5", "2"]]);
  });

  test("the cell cap counts every field and stops parsing at once; wider than the grid is refused", () => {
    expect(tooMany(() => parseCsv(",".repeat(99), { maxCells: 100 }))).toBe("ok");
    expect(tooMany(() => parseCsv(",".repeat(100), { maxCells: 100 }))).toBe("too_many_cells");
    expect(tooMany(() => parseCsv("a\n".repeat(301), { maxCells: 300 }))).toBe("too_many_cells");
    expect(tooMany(() => parseCsv(",".repeat(16_384)))).toBe("too_many_cells");
  });
});

describe("cell typing", () => {
  test("plain decimals are numbers; codes with leading zeros, long digit strings and everything else are text", () => {
    for (const n of ["0", "42", "-7", "0.5", "-0.25", ".5", "3.", "1e5", "-2.5E-3", "123456789012345"]) expect(isCsvNumber(n)).toBe(true);
    for (const s of ["007", "-007", "00.5", "1234567890123456", "4111111111111111", "1,000", " 12", "12 ", "1e999", "+5", "0x1F", "", "-"]) {
      expect(isCsvNumber(s)).toBe(false);
    }
    expect(csvCell("12.5")).toEqual({ v: 12.5, t: CELL_TYPE.NUMBER });
    expect(csvCell("")).toBeNull();
  });

  test("a field of 100 k digits ending in text is typed in linear time", () => {
    const field = `${"1".repeat(100_000)}x`;
    const started = performance.now();
    expect([isCsvNumber(field), isCsvNumber(`-${"2".repeat(100_000)}.`), csvCell(field)?.t]).toEqual([false, false, CELL_TYPE.STRING]);
    expect(performance.now() - started).toBeLessThan(500); // was quadratic: about 10 s
  });

  test("formula-looking text, booleans and dates stay text: import never evaluates anything", () => {
    for (const s of ["=1+1", "=HYPERLINK(\"http://x\")", "+5", "-5a", "@SUM(A1)", "TRUE", "2024-01-15"]) {
      expect(csvCell(s)).toEqual({ v: s, t: CELL_TYPE.STRING });
    }
    expect(csvCell("x".repeat(40_000))?.v).toHaveLength(32_767);
  });
});

describe("decoding and the read path", () => {
  test("UTF-8 with or without BOM, UTF-16LE with BOM, and a legacy windows-1252 file", () => {
    expect(decodeCsvBytes(new TextEncoder().encode("﻿café,1"))).toBe("café,1");
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from("a\tb", (ch) => [ch.charCodeAt(0), 0]).flat()]);
    expect(decodeCsvBytes(utf16)).toBe("a\tb");
    expect(decodeCsvBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), ["en-US"])).toBe("café");
  });

  test("a CSV becomes one sheet named from the file, with numbers typed and formulas as text", async () => {
    const bytes = new TextEncoder().encode('name;amount;note\nAnn;12,5;"=cmd|\' /C calc\'!A0"\nBob;7;+1\n');
    const { decoded, summary, lossy } = await readFixture(bytes, { kind: "csv", fileName: "Q3 [draft].csv" });
    const { sheet } = firstSheet(decoded);
    expect(sheet.name).toBe("Q3 draft");
    expect(decoded.name).toBe("Q3 [draft]");
    expect(sheet.cellData[1]?.[1]).toEqual({ v: "12,5", t: 1 });
    expect(sheet.cellData[2]?.[1]).toEqual({ v: 7, t: 2 });
    expect(sheet.cellData[1]?.[2]).toEqual({ v: "=cmd|' /C calc'!A0", t: 1 });
    expect(sheet.cellData[1]?.[2]?.f).toBeUndefined();
    expect([summary.cellCount, lossy]).toEqual([9, []]);
  });

  test("the cell cap and the size cap apply to CSV reads", async () => {
    const code = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof SpreadsheetReadError ? e.code : String(e)));
    expect(await code(readFixture(new TextEncoder().encode("1,2,3\n4,5,6\n"), { kind: "csv", maxCells: 5 }))).toBe("too_many_cells");
    expect(await code(readFixture(new Uint8Array(10 * 1024 * 1024 + 1).fill(0x31), { kind: "csv" }))).toBe("too_large");
  });
});

describe("export (injection safe)", () => {
  test("csvSafeCell prefixes formula starts on text and leaves real numbers alone", () => {
    expect(csvSafeCell('=HYPERLINK("http://evil","x")', { v: '=HYPERLINK("http://evil","x")', t: 1 })).toBe("'=HYPERLINK(\"http://evil\",\"x\")");
    expect(csvSafeCell("+1", { v: "+1", t: 1 })).toBe("'+1");
    expect(csvSafeCell("@x", { v: "@x", t: 1 })).toBe("'@x");
    expect(csvSafeCell("\tx", { v: "\tx", t: 1 })).toBe("'\tx");
    expect(csvSafeCell("\rx", null)).toBe("'\rx");
    expect(csvSafeCell("-5", { v: -5, t: 2 })).toBe("-5");
    expect(csvSafeCell("-5", { v: "-5", t: 1 })).toBe("'-5");
    expect(csvSafeCell("-$1,234.50", { v: -1234.5, t: 2 })).toBe("-$1,234.50");
    expect(csvSafeCell("-1.5E+10", { v: -1.5e10 })).toBe("-1.5E+10");
    expect(csvSafeCell("plain", { v: "plain", t: 1 })).toBe("plain");
    expect(csvSafeCell("", null)).toBe("");
  });

  test("a number whose format displays a formula, leading spaces and full-width signs are prefixed too", () => {
    expect(csvSafeCell("-2+3+cmd|' /C calc'!A0", { v: 5, t: 2 })).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(csvSafeCell("  =1+1", { v: "  =1+1", t: 1 })).toBe("'  =1+1");
    expect(csvSafeCell("＝SUM(A1)", { v: "＝SUM(A1)", t: 1 })).toBe("'＝SUM(A1)");
  });

  test("toCsv quotes quotes, commas, CR and LF and ends records with CRLF; the download has a BOM", () => {
    expect(toCsv([["a", 'b"c', "d,e"], ["line\nbreak", "cr\r", ""]])).toBe('a,"b""c","d,e"\r\n"line\nbreak","cr\r",');
    const raw = [[{ v: "=1+1", t: 1 }, { v: -5, t: 2 }], [{ v: "ok", t: 1 }, null]];
    const csv = sheetToSafeCsv([["=1+1", "-5"], ["ok", ""]], (r, c) => raw[r][c]);
    expect(csv).toBe("﻿'=1+1,-5\r\nok,");
    expect(parseCsv(csv)).toEqual([["'=1+1", "-5"], ["ok", ""]]);
  });
});
