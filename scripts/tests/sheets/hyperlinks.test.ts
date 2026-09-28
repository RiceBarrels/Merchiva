// lib/sheets/xlsx/{hyperlinks,a1,lossy,formula-prefix}.ts — cell links between Excel and Univer (sheets.md
// §11.1, §12.1): the import allow / deny matrix (only http(s), mailto and links inside the workbook survive),
// the internal link mapping in both directions, a written file's links and defined names read back by
// ExcelJS, the A1 helpers the mapping stands on, the lossy report (several links in one cell, the dialog
// keys), and the future-function prefixes formulas carry in a file.

import { describe, expect, test } from "bun:test";
import * as ExcelJS from "exceljs";
import { strFromU8, unzipSync } from "fflate";
import { NEW_EXCEL_FUNCTIONS } from "@univerjs/engine-formula";
import type { ICellData, IWorkbookData } from "@univerjs/presets";
import { isSafeSheetLink } from "@/lib/sheets/sanitize";
import { SHEET_LOSSY_ITEMS } from "@/lib/sheets/types";
import {
  SHEET_LINK_MAX_CHARS, internalLinkToUniver, sanitizeImportedLink, univerLinkToExcel,
} from "@/lib/sheets/xlsx/hyperlinks";
import {
  colToLetters, lettersToCol, parseA1Cell, parseA1Range, parseSqref, quoteSheetName, splitSheetRef, toA1Range,
} from "@/lib/sheets/xlsx/a1";
import {
  LOSSY_MARKER_CARRY_BYTES, LOSSY_XML_MARKERS, cellLinkUrls, lossyForExport, lossyFromPrescan, lossyItemKey, orderedLossy,
} from "@/lib/sheets/xlsx/lossy";
import { EXCEL_SHEET_NAME_MAX, exportXlsxBytes, safeSheetName } from "@/lib/sheets/xlsx/export-workbook";
import { EXCEL_FUTURE_FUNCTIONS, addFormulaPrefixes, stripFormulaPrefixes } from "@/lib/sheets/xlsx/formula-prefix";
import type { ExcelJSModule } from "@/lib/sheets/xlsx/types";
import en from "@/scripts/i18n/drive/sheets/en.json";

const SHEET_IDS = new Map([["Sheet1", "s1"], ["Sheet 2", "s2"], ["It's", "s3"]]);
const SHEET_NAMES = new Map([...SHEET_IDS].map(([name, id]) => [id, name]));
const NAME_IDS = new Map([["Prices", "n1"]]);
const NAME_BY_ID = new Map([["n1", "Prices"]]);

const imported = (href: string) => sanitizeImportedLink(href, SHEET_IDS, NAME_IDS);

function linkCell(text: string, links: Array<{ url: string; start: number; end: number; tooltip?: string }>): ICellData {
  return {
    p: {
      id: "d", documentStyle: {},
      body: {
        dataStream: `${text}\r\n`,
        customRanges: links.map((link, i) => ({
          startIndex: link.start, endIndex: link.end, rangeId: `r${i}`, rangeType: 0,
          properties: { url: link.url, ...(link.tooltip ? { tooltip: link.tooltip } : {}) },
        })),
      },
    },
  } as ICellData;
}

describe("sanitizeImportedLink", () => {
  test("http, https and mailto URLs are kept (trimmed)", () => {
    expect(imported("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(imported("  http://example.com  ")).toBe("http://example.com");
    expect(imported("mailto:owner@example.com?subject=Hi")).toBe("mailto:owner@example.com?subject=Hi");
  });

  test("every other scheme, path and malformed value is dropped (the cell keeps its text)", () => {
    const denied = [
      "javascript:alert(1)", "  JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "jav&#x09;ascript:alert(1)",
      "vbscript:msgbox(1)", "data:text/html,<script>alert(1)</script>", "file:///C:/secrets.xlsx",
      "\\\\server\\share\\book.xlsx", "C:\\book.xlsx", "../other.xlsx", "other.xlsx", "//evil.example/x",
      "ftp://example.com/f", "tel:+15551234", "https://example.com/\u0000", "", "   ",
      `https://example.com/${"a".repeat(SHEET_LINK_MAX_CHARS)}`,
    ];
    for (const href of denied) expect(imported(href)).toBeNull();
  });

  test("links to a sheet, a range or a defined name of this workbook become Univer links", () => {
    expect(imported("#'Sheet 2'!A1")).toBe("#gid=s2&range=A1");
    expect(imported("#Sheet1!$B$2:$C$3")).toBe("#gid=s1&range=B2:C3");
    expect(imported("#sheet1!c3:b2")).toBe("#gid=s1&range=B2:C3");
    expect(imported("#'It''s'!D4")).toBe("#gid=s3&range=D4");
    expect(imported("#'Sheet 2'")).toBe("#gid=s2");
    expect(imported("#Sheet1!")).toBe("#gid=s1");
    expect(imported("#Prices")).toBe("#rangeid=n1");
    expect(imported("Sheet1!A1")).toBe("#gid=s1&range=A1");
  });

  test("an unknown sheet or name, or a malformed reference, is dropped", () => {
    for (const href of ["#Missing!A1", "#'Sheet 3'!A1", "#Sheet1!ZZZZ1", "#Sheet1!A0", "#Sheet1!A1:B", "#Nope", "Missing!A1"]) {
      expect(imported(href)).toBeNull();
    }
    expect(sanitizeImportedLink("#Prices", SHEET_IDS)).toBeNull();
  });

  test("whatever is kept also passes the op / load rule (isSafeSheetLink)", () => {
    const kept = ["https://a.test", "mailto:a@b.test", "#'Sheet 2'!A1", "#Prices", "#'Sheet 2'"].map(imported);
    for (const link of kept) {
      expect(link).not.toBeNull();
      expect(isSafeSheetLink(link as string)).toBe(true);
    }
  });
});

describe("univerLinkToExcel and the round trip", () => {
  test("in-workbook links become Excel locations; broken or missing ranges point at A1", () => {
    expect(univerLinkToExcel("#gid=s2&range=A1", SHEET_NAMES)).toBe("#'Sheet 2'!A1");
    expect(univerLinkToExcel("#gid=s1&range=$B$2:$C$3", SHEET_NAMES)).toBe("#Sheet1!B2:C3");
    expect(univerLinkToExcel("#gid=s1", SHEET_NAMES)).toBe("#Sheet1!A1");
    expect(univerLinkToExcel("#gid=s1&range=err", SHEET_NAMES)).toBe("#Sheet1!A1");
    expect(univerLinkToExcel("#gid=s3&range=D4", SHEET_NAMES)).toBe("#'It''s'!D4");
    expect(univerLinkToExcel("#rangeid=n1", SHEET_NAMES, NAME_BY_ID)).toBe("#Prices");
  });

  test("unknown targets and unsafe URLs cannot be written", () => {
    expect(univerLinkToExcel("#gid=gone&range=A1", SHEET_NAMES)).toBeNull();
    expect(univerLinkToExcel("#rangeid=n1", SHEET_NAMES)).toBeNull();
    expect(univerLinkToExcel("#rangeid=zz", SHEET_NAMES, NAME_BY_ID)).toBeNull();
    expect(univerLinkToExcel("javascript:alert(1)", SHEET_NAMES)).toBeNull();
    expect(univerLinkToExcel("#other=1", SHEET_NAMES)).toBeNull();
    expect(univerLinkToExcel(`https://a.test/${"a".repeat(SHEET_LINK_MAX_CHARS)}`, SHEET_NAMES)).toBeNull();
    expect(univerLinkToExcel("https://a.test/x?y=1", SHEET_NAMES)).toBe("https://a.test/x?y=1");
  });

  test("Univer → Excel → Univer returns the same link", () => {
    const links = ["#gid=s1&range=B2:C3", "#gid=s2&range=A1", "#gid=s3&range=D4", "#rangeid=n1", "https://x.test/a", "mailto:a@b.test"];
    for (const link of links) {
      const excel = univerLinkToExcel(link, SHEET_NAMES, NAME_BY_ID);
      expect(excel).not.toBeNull();
      expect(sanitizeImportedLink(excel as string, SHEET_IDS, NAME_IDS)).toBe(link);
    }
    expect(internalLinkToUniver("#'Sheet 2'!A1", SHEET_IDS)).toBe("#gid=s2&range=A1");
  });

  test("a written file's links read back through ExcelJS map to the same Univer links", async () => {
    const wb = {
      id: "u", name: "Links", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["s1", "s2", "s3"],
      sheets: {
        s1: {
          id: "s1", name: "Sheet1",
          cellData: {
            0: {
              0: linkCell("site", [{ url: "https://example.com/a?b=1", start: 0, end: 3, tooltip: "Open" }]),
              1: linkCell("go", [{ url: "#gid=s2&range=B2:C3", start: 0, end: 1 }]),
              2: linkCell("price", [{ url: "#rangeid=n1", start: 0, end: 4 }]),
              3: linkCell("quote", [{ url: "#gid=s3&range=A1", start: 0, end: 4 }]),
              4: linkCell("unsafe", [{ url: "javascript:alert(1)", start: 0, end: 5 }]),
              5: linkCell("one two", [{ url: "mailto:a@b.test", start: 0, end: 2 }, { url: "https://second.test", start: 4, end: 6 }]),
            },
          },
        },
        s2: { id: "s2", name: "Sheet 2", cellData: { 0: { 0: { v: 1, t: 2 } } } },
        s3: { id: "s3", name: "It's", cellData: {} },
      },
      resources: [{ name: "SHEET_DEFINED_NAME_PLUGIN", data: JSON.stringify({ n1: { id: "n1", name: "Prices", formulaOrRefString: "='Sheet 2'!$A$1:$A$3" } }) }],
    } as unknown as IWorkbookData;
    const { bytes, lossy } = await exportXlsxBytes(ExcelJS as unknown as ExcelJSModule, wb);
    expect(lossy.has("richLinks")).toBe(true);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const ws = back.getWorksheet("Sheet1");
    const link = (address: string) => {
      const value = ws?.getCell(address).value;
      return value && typeof value === "object" && "hyperlink" in value ? value : null;
    };
    // ExcelJS writes the tooltip but does not read it back: check the part itself.
    expect(link("A1")).toEqual({ text: "site", hyperlink: "https://example.com/a?b=1" });
    expect(strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"])).toContain('<hyperlink ref="A1" r:id="rId1" tooltip="Open"/>');
    expect(imported(link("B1")?.hyperlink ?? "")).toBe("#gid=s2&range=B2:C3");
    expect(imported(link("C1")?.hyperlink ?? "")).toBe("#rangeid=n1");
    expect(imported(link("D1")?.hyperlink ?? "")).toBe("#gid=s3&range=A1");
    expect(link("E1")).toBeNull();
    expect(ws?.getCell("E1").value).toBe("unsafe");
    expect(link("F1")).toEqual({ text: "one two", hyperlink: "mailto:a@b.test" });
    expect(back.definedNames.model).toEqual([{ name: "Prices", ranges: ["'Sheet 2'!$A$1:$A$3"] }]);
  });

  test("names in any script are written; a link to a name that cannot be written stays text", async () => {
    const name = (id: string, text: string, ref: string) => [id, { id, name: text, formulaOrRefString: ref }];
    const names = Object.fromEntries([
      name("zh", "价格", "=Sheet1!$A$1:$A$3"), name("hi", "मूल्य", "=Sheet1!$B$1"), name("rate", "Rate", "=0.07"),
      name("col", "Everything", "=Sheet1!$C:$C"), name("big1", "BigOne", "=Sheet1!$D$1:$D$150000"),
      name("big2", "BigTwo", "=Sheet1!$E$1:$E$150000"), name("sp", "Two words", "=Sheet1!$F$1"),
    ]);
    const wb = {
      id: "u", name: "Names", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["s1"],
      sheets: {
        s1: {
          id: "s1", name: "Sheet1",
          cellData: {
            0: {
              0: linkCell("zh", [{ url: "#rangeid=zh", start: 0, end: 1 }]),
              1: linkCell("rate", [{ url: "#rangeid=rate", start: 0, end: 3 }]),
              2: linkCell("big2", [{ url: "#rangeid=big2", start: 0, end: 3 }]),
            },
          },
        },
      },
      resources: [{ name: "SHEET_DEFINED_NAME_PLUGIN", data: JSON.stringify(names) }],
    } as unknown as IWorkbookData;
    const { bytes } = await exportXlsxBytes(ExcelJS as unknown as ExcelJSModule, wb);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    // Constants, over-long areas, names past the all-names budget and names Excel refuses are left out.
    expect(back.definedNames.model.map((entry) => entry.name).sort()).toEqual(["BigOne", "मूल्य", "价格"].sort());
    const ws = back.getWorksheet("Sheet1");
    expect(ws?.getCell("A1").value).toEqual({ text: "zh", hyperlink: "#价格" });
    expect(ws?.getCell("B1").value).toBe("rate");
    expect(ws?.getCell("C1").value).toBe("big2");
  });
});

describe("A1 references", () => {
  test("column letters ⇄ indexes over the whole grid", () => {
    expect(colToLetters(0)).toBe("A");
    expect(colToLetters(25)).toBe("Z");
    expect(colToLetters(26)).toBe("AA");
    expect(colToLetters(16_383)).toBe("XFD");
    for (let col = 0; col < 16_384; col += 7) expect(lettersToCol(colToLetters(col))).toBe(col);
    expect(lettersToCol("xfd")).toBe(16_383);
    expect(lettersToCol("XFE")).toBe(-1);
    expect(lettersToCol("A1")).toBe(-1);
  });

  test("cells and ranges parse to 0-based inclusive ranges; off-grid and malformed refs are null", () => {
    expect(parseA1Cell("$B$3")).toEqual({ row: 2, col: 1 });
    expect(parseA1Range("C3:A1")).toEqual({ startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 });
    expect(parseA1Range("B:D")).toEqual({ startRow: 0, endRow: 1_048_575, startColumn: 1, endColumn: 3 });
    expect(parseA1Range("2:4")).toEqual({ startRow: 1, endRow: 3, startColumn: 0, endColumn: 16_383 });
    for (const bad of ["", "A0", "A1048577", "XFE1", "A1:B2:C3", "1A", "A1:"]) expect(parseA1Range(bad)).toBeNull();
    expect(toA1Range({ startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 })).toBe("A1");
    expect(toA1Range({ startRow: 1, endRow: 3, startColumn: 1, endColumn: 2 }, true)).toBe("$B$2:$C$4");
    expect(parseSqref(" A1:B2  D4 bogus ")).toEqual([
      { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 },
      { startRow: 3, endRow: 3, startColumn: 3, endColumn: 3 },
    ]);
  });

  test("sheet names are quoted when they must be, and split back", () => {
    expect(quoteSheetName("Sheet1")).toBe("Sheet1");
    expect(quoteSheetName("Sheet 2")).toBe("'Sheet 2'");
    expect(quoteSheetName("It's")).toBe("'It''s'");
    expect(quoteSheetName("A1")).toBe("'A1'");
    expect(quoteSheetName("2024")).toBe("'2024'");
    expect(splitSheetRef("'It''s'!A1:B2")).toEqual({ sheetName: "It's", ref: "A1:B2" });
    expect(splitSheetRef("Sheet1!C3")).toEqual({ sheetName: "Sheet1", ref: "C3" });
    expect(splitSheetRef("C3")).toEqual({ sheetName: null, ref: "C3" });
  });

  test("written sheet names (the targets of links) are names Excel accepts", () => {
    const used = new Set<string>();
    expect(safeSheetName("Q1: [draft]*?/\\", used, "1")).toBe("Q1 draft");
    expect(safeSheetName("q1 DRAFT", used, "2")).toBe("q1 DRAFT (2)");
    expect(safeSheetName("Q1 draft", used, "3")).toBe("Q1 draft (3)");
    expect(safeSheetName("'quoted'", used, "4")).toBe("quoted");
    expect(safeSheetName("History", used, "5")).toBe("5");
    expect(safeSheetName("*?", used, "6")).toBe("6");
    const long = safeSheetName("x".repeat(40), used, "7");
    expect(long).toHaveLength(EXCEL_SHEET_NAME_MAX);
    expect(safeSheetName("x".repeat(40), used, "8")).toBe(`${"x".repeat(27)} (2)`);
    expect(safeSheetName(`${"a".repeat(30)}😀`, used, "9")).toBe("a".repeat(30));
  });
});

describe("future-function prefixes", () => {
  test("post-2007 functions get _xlfn. (FILTER and SORT _xlfn._xlws.); older ones, text and quoted names do not", () => {
    expect(addFormulaPrefixes("XLOOKUP(1,B1:B3,C1:C3)")).toBe("_xlfn.XLOOKUP(1,B1:B3,C1:C3)");
    expect(addFormulaPrefixes('IFS(A1>1,TEXTJOIN(",",TRUE,B1:B3),TRUE,"XLOOKUP(")')).toBe(
      '_xlfn.IFS(A1>1,_xlfn.TEXTJOIN(",",TRUE,B1:B3),TRUE,"XLOOKUP(")',
    );
    expect(addFormulaPrefixes("filter(A1:A3,B1:B3>0)+SORT(A1:A3)")).toBe("_xlfn._xlws.FILTER(A1:A3,B1:B3>0)+_xlfn._xlws.SORT(A1:A3)");
    expect(addFormulaPrefixes("STDEV.S(A1:A9)+STDEV(A1:A9)+CONCAT(A1,A2)")).toBe("_xlfn.STDEV.S(A1:A9)+STDEV(A1:A9)+_xlfn.CONCAT(A1,A2)");
    for (const plain of ["SUM(A1:A3)+'XLOOKUP(x'!A1", "NETWORKDAYS.INTL(A1,B1)", "IFERROR(#N/A,0)", "Table1[[#Headers],[IFS(]]", "A1+1"]) {
      expect(addFormulaPrefixes(plain)).toBe(plain);
    }
  });

  test("names LET and LAMBDA bind get _xlpm. inside that call only; columns and sheets named alike do not", () => {
    expect(addFormulaPrefixes("LET(x,1,y,x+1,x*y)")).toBe("_xlfn.LET(_xlpm.x,1,_xlpm.y,_xlpm.x+1,_xlpm.x*_xlpm.y)");
    expect(addFormulaPrefixes("LET(f,LAMBDA(a,b,a*b),f(2,3))")).toBe("_xlfn.LET(_xlpm.f,_xlfn.LAMBDA(_xlpm.a,_xlpm.b,_xlpm.a*_xlpm.b),_xlpm.f(2,3))");
    expect(addFormulaPrefixes("LET(x,1,x)+x")).toBe("_xlfn.LET(_xlpm.x,1,_xlpm.x)+x");
    expect(addFormulaPrefixes("LET(a,{1,2;3,4},SUM(A:A)+SUM(a)+$A$1+a!B1)")).toBe("_xlfn.LET(_xlpm.a,{1,2;3,4},SUM(A:A)+SUM(_xlpm.a)+$A$1+a!B1)");
    expect(addFormulaPrefixes("LET(days,5,DAYS(days,1))")).toBe("_xlfn.LET(_xlpm.days,5,_xlfn.DAYS(_xlpm.days,1))");
    expect(addFormulaPrefixes("LET(名前,1,名前*2)")).toBe("_xlfn.LET(_xlpm.名前,1,_xlpm.名前*2)");
  });

  test("the list is a superset of Univer's own NEW_EXCEL_FUNCTIONS (a copy: the worker has no formula engine)", () => {
    for (const name of NEW_EXCEL_FUNCTIONS) expect(EXCEL_FUTURE_FUNCTIONS.has(String(name))).toBe(true);
  });

  test("adding is idempotent and stripping undoes it", () => {
    for (const formula of ["XLOOKUP(1,A:A,B:B)", "LET(f,LAMBDA(a,a+1),f(2))", 'IFS(A1="_xlfn.x",1)', "SUM(A1)"]) {
      const prefixed = addFormulaPrefixes(formula);
      expect(addFormulaPrefixes(prefixed)).toBe(prefixed);
      expect(stripFormulaPrefixes(prefixed)).toBe(formula);
    }
    expect(stripFormulaPrefixes("_xlfn._xlws.FILTER(A1:A3,A1:A3>0)")).toBe("FILTER(A1:A3,A1:A3>0)");
  });

  test("a written cell formula carries the prefix (Excel shows #NAME? without it)", async () => {
    const wb = {
      id: "u", name: "F", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["a"],
      sheets: { a: { id: "a", name: "A", cellData: { 0: { 0: { f: "=XLOOKUP(1,B1:B3,C1:C3)", v: 5, t: 2 } } } } },
    } as unknown as IWorkbookData;
    const { bytes } = await exportXlsxBytes(ExcelJS as unknown as ExcelJSModule, wb);
    expect(strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"])).toContain('<c r="A1"><f>_xlfn.XLOOKUP(1,B1:B3,C1:C3)</f><v>5</v></c>');
  });
});

describe("lossy report", () => {
  test("a cell's distinct links, in text order; several of them are reported as richLinks", () => {
    const cell = linkCell("a b c", [
      { url: "https://b.test", start: 2, end: 2 }, { url: "https://a.test", start: 0, end: 0 }, { url: "https://b.test", start: 4, end: 4 },
    ]);
    expect(cellLinkUrls(cell).map((l) => l.url)).toEqual(["https://a.test", "https://b.test"]);
    const wb = { id: "u", name: "x", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["a"], sheets: { a: { id: "a", name: "A", cellData: { 0: { 0: cell } } } } } as unknown as IWorkbookData;
    expect([...lossyForExport(wb)]).toEqual(["richLinks"]);
  });

  test("prescan facts: part names (case-insensitive), XML markers and stripped validation", () => {
    const items = lossyFromPrescan({
      partNames: ["xl/workbook.xml", "XL/Charts/chart1.xml", "/xl/vbaProject.bin", "xl/pivotCache/pivotCacheDefinition1.xml"],
      markers: ["<sheetProtection", "x14:sparklineGroups"],
      dataValidationStripped: true,
    });
    expect(orderedLossy(items)).toEqual(["charts", "pivotTables", "macros", "sparklines", "protection", "dataValidationLimit"]);
    expect(LOSSY_MARKER_CARRY_BYTES).toBe(Math.max(...LOSSY_XML_MARKERS.map((m) => m.marker.length)) - 1);
  });

  test("every item has its line in the sheets fragment", () => {
    const leaves = (en as { sheets: { lossy: { items: Record<string, string> } } }).sheets.lossy.items;
    for (const item of SHEET_LOSSY_ITEMS) {
      expect(lossyItemKey(item)).toBe(`sheets.lossy.items.${item}`);
      expect(typeof leaves[item]).toBe("string");
    }
  });
});
