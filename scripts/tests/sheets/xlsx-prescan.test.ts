// lib/sheets/xlsx/prescan.ts and the hostile-file handling of the read path (sheets.md §11.2, §12.1): caps
// on bytes actually inflated (whatever the zip claims) and on counted cells, the rebuilt zip ExcelJS reads
// (nothing a crafted central directory adds reaches it), containers that are not a zip, lossy markers,
// legacy notes on empty cells, and the blocks the importer reads itself because ExcelJS would expand them
// cell by cell (merges, defined names, column ranges, validation, hyperlinks). Also work a tiny file could
// make huge: sparse row and cell numbers, sheet names and ids ExcelJS refuses or indexes by, merge and link floods.

import { describe, expect, test } from "bun:test";
import { strToU8, unzipSync } from "fflate";
import JSZip from "jszip";
import { readHyperlinks, readValidations } from "@/lib/sheets/xlsx/import-features";
import { newMergeBudget, readMerges } from "@/lib/sheets/xlsx/import-workbook";
import { prescanXlsx } from "@/lib/sheets/xlsx/prescan";
import { SpreadsheetReadError } from "@/lib/sheets/xlsx/types";
import { RESOURCE } from "@/lib/sheets/univer-constants";
import {
  encryptedPackage, firstSheet, handXlsx, inlineCell, rawZip, readFixture, resourceOf, sheetNamed, smuggledZip,
} from "./helpers/xlsx-fixtures";

const MIB = 1024 * 1024;
const LIMITS = { maxInflatedBytes: 200 * MIB, maxCells: 2_000_000 };
const SHEET_XML_HEAD = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (err) {
    return err instanceof SpreadsheetReadError ? err.code : `other: ${String(err)}`;
  }
}

/** A worksheet part holding `cells` empty cells in one row, with a lying <dimension>. */
function cellsXml(cells: number): Uint8Array {
  return strToU8(`${SHEET_XML_HEAD}<dimension ref="A1"/><sheetData><row r="1">${"<c/>".repeat(cells)}</row></sheetData></worksheet>`);
}

describe("inflated-byte cap", () => {
  test("an entry whose headers claim 100 bytes but inflate to 3 MiB trips a 1 MiB cap (content, so not too_large)", async () => {
    const bomb = rawZip([{ name: "xl/worksheets/sheet1.xml", data: new Uint8Array(3 * MIB).fill(0x20), claimedSize: 100 }]);
    expect(await codeOf(prescanXlsx(bomb, { maxInflatedBytes: MIB, maxCells: 10 }))).toBe("too_many_cells");
  });

  test("the cap counts real bytes: an entry that claims 1 GiB but inflates to 10 KiB passes", async () => {
    const zip = rawZip([
      { name: "xl/workbook.xml", data: strToU8("<workbook><sheets/></workbook>"), claimedSize: 1024 * MIB },
      { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(10 * 1024).fill(0x20), claimedSize: 1024 * MIB },
    ]);
    const result = await prescanXlsx(zip, { maxInflatedBytes: MIB, maxCells: 10 });
    expect(Object.keys(unzipSync(result.bytes)).sort()).toEqual(["xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
  });

  test("parts nobody reads are never inflated, so a bomb in xl/media counts nothing and never reaches ExcelJS", async () => {
    const zip = rawZip([
      { name: "xl/workbook.xml", data: strToU8("<workbook><sheets/></workbook>") },
      { name: "xl/media/image1.png", data: new Uint8Array(40 * MIB), claimedSize: 10 },
    ]);
    const result = await prescanXlsx(zip, { maxInflatedBytes: MIB, maxCells: 10 });
    expect(Object.keys(unzipSync(result.bytes))).toEqual(["xl/workbook.xml"]);
    expect([...result.lossy]).toContain("images");
  });

  test("an entry only the central directory lists (JSZip, and so ExcelJS, would read it) never reaches ExcelJS", async () => {
    const hidden = { name: "xl/worksheets/sheet2.xml", data: new Uint8Array(3 * MIB).fill(0x20) };
    const zip = smuggledZip([{ name: "xl/workbook.xml", data: strToU8("<workbook><sheets/></workbook>") }], hidden);
    const jszip = await JSZip.loadAsync(zip);
    expect(Object.keys(jszip.files)).toContain("xl/worksheets/sheet2.xml");
    // Uncounted by the caps (a 1 MiB cap passes) and absent from what ExcelJS reads.
    const result = await prescanXlsx(zip, { maxInflatedBytes: MIB, maxCells: 10 });
    expect(Object.keys(unzipSync(result.bytes))).toEqual(["xl/workbook.xml"]);
  });
});

describe("cell cap", () => {
  test("<dimension ref=\"A1\"> with 2.1 M real cells trips the 2 M cap", async () => {
    const zip = rawZip([{ name: "xl/worksheets/sheet1.xml", data: cellsXml(2_100_000) }]);
    expect(await codeOf(prescanXlsx(zip, LIMITS))).toBe("too_many_cells");
  });

  test("the coarse-pointer cap (300 k) trips one cell past it and counts exactly across chunk boundaries", async () => {
    const coarse = { maxInflatedBytes: 200 * MIB, maxCells: 300_000 };
    const over = rawZip([{ name: "xl/worksheets/sheet1.xml", data: cellsXml(300_001) }]);
    expect(await codeOf(prescanXlsx(over, coarse))).toBe("too_many_cells");
    const at = rawZip([
      { name: "xl/workbook.xml", data: strToU8("<workbook><sheets/></workbook>") },
      { name: "xl/worksheets/sheet1.xml", data: cellsXml(300_000) },
    ]);
    expect((await prescanXlsx(at, coarse)).cellCount).toBe(300_000);
  });

  test("<cols>, <cfRule> and other <c…> tags are not cells; <c r=…>, <c>, <c/> are", async () => {
    const xml = `${SHEET_XML_HEAD}<cols><col min="1" max="1"/></cols><sheetData><row r="1"><c r="A1"><v>1</v></c><c>x</c><c/><color/></row></sheetData><conditionalFormatting><cfRule/></conditionalFormatting></worksheet>`;
    const zip = rawZip([{ name: "xl/workbook.xml", data: strToU8("<workbook/>") }, { name: "xl/worksheets/sheet1.xml", data: strToU8(xml) }]);
    expect((await prescanXlsx(zip, LIMITS)).cellCount).toBe(3);
  });
});

describe("containers", () => {
  test("an encrypted (password-protected) package → encrypted; a legacy .xls → unsupported; not a zip → unsupported", async () => {
    expect(await codeOf(prescanXlsx(encryptedPackage(), LIMITS))).toBe("encrypted");
    const xls = encryptedPackage().slice(0, 512);
    expect(await codeOf(prescanXlsx(xls, LIMITS))).toBe("unsupported");
    expect(await codeOf(prescanXlsx(strToU8("a,b\n1,2\n"), LIMITS))).toBe("unsupported");
  });

  test("a truncated zip or one without a workbook → corrupt", async () => {
    const whole = handXlsx([{ name: "S", body: "<sheetData/>" }]);
    expect(await codeOf(prescanXlsx(whole.slice(0, Math.floor(whole.length / 2)), LIMITS))).toBe("corrupt");
    const noWorkbook = rawZip([{ name: "xl/worksheets/sheet1.xml", data: cellsXml(1) }]);
    expect(await codeOf(prescanXlsx(noWorkbook, LIMITS))).toBe("corrupt");
  });
});

describe("lossy markers", () => {
  test("parts and XML markers become lossy items", async () => {
    const drawing = '<xdr:wsDr xmlns:xdr="x"><xdr:twoCellAnchor><xdr:pic><xdr:spPr/></xdr:pic></xdr:twoCellAnchor><xdr:oneCellAnchor><xdr:sp macro=""/></xdr:oneCellAnchor></xdr:wsDr>';
    const bytes = handXlsx([{
      name: "S",
      body: '<sheetData/><sheetProtection sheet="1"/><autoFilter ref="A1:B3"><filterColumn colId="0"><filters><filter val="a"/></filters></filterColumn></autoFilter><extLst><ext><x14:sparklineGroups xmlns:x14="x"/></ext><ext><x14:dataValidations xmlns:x14="x"/></ext></extLst>',
    }], {
      workbookExtra: '<workbookProtection lockStructure="1"/>',
      parts: {
        "xl/charts/chart1.xml": "<c/>", "xl/pivotTables/pivotTable1.xml": "<p/>", "xl/vbaProject.bin": "x",
        "xl/drawings/drawing1.xml": drawing, "xl/threadedComments/threadedComment1.xml": "<t/>",
        "xl/externalLinks/externalLink1.xml": "<e/>", "xl/slicers/slicer1.xml": "<s/>", "xl/tables/table1.xml": "<t/>",
      },
    });
    const { lossy } = await readFixture(bytes);
    for (const item of ["charts", "pivotTables", "macros", "images", "shapes", "threadedComments", "externalLinks", "slicers", "tables", "protection", "sparklines", "filterCriteria", "unsupportedValidation"]) {
      expect(lossy).toContain(item as (typeof lossy)[number]);
    }
  });
});

describe("blocks read outside ExcelJS", () => {
  test("legacy notes, including one on a cell that does not exist, become notes", async () => {
    const comments = '<comments xmlns="x"><authors><author>Ann</author></authors><commentList><comment ref="B5" authorId="0"><text><r><t>Ann:</t></r><r><t xml:space="preserve">&#10;check &amp; fix</t></r><rPh><t>ignored</t></rPh></text></comment><comment ref="A1" authorId="0"><text><t>on A1_x000D_</t></text></comment></commentList></comments>';
    const bytes = handXlsx([{
      name: "S", body: `<sheetData><row r="1">${inlineCell("A1", "a")}</row></sheetData><legacyDrawing r:id="rId2"/>`,
      rels: [["rId1", "comments", "../comments1.xml"], ["rId2", "vmlDrawing", "../drawings/vmlDrawing1.vml"]],
    }], { parts: { "xl/comments1.xml": comments } });
    const { decoded } = await readFixture(bytes);
    const { id } = firstSheet(decoded);
    const notes = resourceOf(decoded, RESOURCE.NOTE)?.[id] as Record<string, Record<string, { note: string }>>;
    expect(notes["4"]["1"].note).toBe("Ann:\ncheck & fix");
    expect(notes["0"]["0"].note).toBe("on A1\r");
  });

  test("merges: a whole-grid merge is skipped at once, overlaps are dropped (the first wins)", async () => {
    const started = performance.now();
    const bytes = handXlsx([{
      name: "S",
      body: '<sheetData/><mergeCells count="4"><mergeCell ref="A1:XFD1048576"/><mergeCell ref="A1:B2"/><mergeCell ref="B2:C3"/><mergeCell ref="D4:D6"/></mergeCells>',
    }]);
    const { decoded } = await readFixture(bytes);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(firstSheet(decoded).sheet.mergeData).toEqual([
      { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 },
      { startRow: 3, endRow: 5, startColumn: 3, endColumn: 3 },
    ]);
  });

  test("defined names are read as text: a whole-grid range costs nothing; formulas, constants and local names survive", async () => {
    const started = performance.now();
    const bytes = handXlsx([{ name: "Data", body: "<sheetData/>" }, { name: "Other", body: "<sheetData/>" }], {
      workbookExtra: '<definedNames><definedName name="Huge">Data!$A$1:$XFD$1048576</definedName><definedName name="Rate">0.2</definedName>'
        + '<definedName name="Pick">_xlfn.XLOOKUP(1,Data!$A:$A,Data!$B:$B)</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">Data!$A$1:$B$2</definedName>'
        + '<definedName name="Local" localSheetId="1" hidden="1">Other!$A$1</definedName><definedName name="Ext">[1]Sheet1!$A$1</definedName><definedName name="A1">Data!$A$1</definedName></definedNames>',
    });
    const { decoded } = await readFixture(bytes);
    expect(performance.now() - started).toBeLessThan(5000);
    const names = Object.values(resourceOf(decoded, RESOURCE.DEFINED_NAME) ?? {}) as Array<{ name: string; formulaOrRefString: string; localSheetId?: string; hidden?: boolean }>;
    const byName = new Map(names.map((n) => [n.name, n]));
    expect([...byName.keys()].sort()).toEqual(["Huge", "Local", "Pick", "Rate"]);
    expect(byName.get("Huge")?.formulaOrRefString).toBe("Data!$A$1:$XFD$1048576");
    expect(byName.get("Rate")?.formulaOrRefString).toBe("=0.2");
    expect(byName.get("Pick")?.formulaOrRefString).toBe("=XLOOKUP(1,Data!$A:$A,Data!$B:$B)");
    expect(byName.get("Local")?.localSheetId).toBe(sheetNamed(decoded, "Other").id);
    expect(byName.get("Local")?.hidden).toBe(true);
  });

  test("a <col> range past the grid is clamped (ExcelJS would build a billion columns)", async () => {
    const bytes = handXlsx([{ name: "S", body: '<cols><col min="1" max="1000000000" width="12" customWidth="1"/></cols><sheetData/>' }]);
    const { decoded } = await readFixture(bytes);
    const columns = firstSheet(decoded).sheet.columnData;
    expect(Object.keys(columns).length).toBe(16_384);
    // 12 characters as a file stores them (ECMA-376 §18.3.1.13) are 84 px.
    expect(columns[0]?.w).toBe(84);
  });

  test("validation from the raw XML: formula bounds, literal and range lists, prefixes stripped, styles, blanks", async () => {
    const bytes = handXlsx([{
      name: "S",
      body: '<sheetData/><dataValidations count="6">'
        + '<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorStyle="warning" error="No" sqref="A1:A5 C1"><formula1>$B$1</formula1><formula2>100</formula2></dataValidation>'
        + '<dataValidation type="list" sqref="D1"><formula1>"x,y ,""z"""</formula1></dataValidation>'
        + '<dataValidation type="list" sqref="D2"><formula1>Other!$A$1:$A$3</formula1></dataValidation>'
        + '<dataValidation type="custom" sqref="E1"><formula1>_xlfn.ISFORMULA(E1)</formula1></dataValidation>'
        + '<dataValidation type="date" operator="greaterThan" sqref="F1"><formula1>45306</formula1></dataValidation>'
        + '<dataValidation type="none" showInputMessage="1" prompt="hi" sqref="G1"/><dataValidation type="bogus" sqref="H1"><formula1>1</formula1></dataValidation>'
        + "</dataValidations>",
    }]);
    const { decoded, lossy } = await readFixture(bytes);
    const { id } = firstSheet(decoded);
    const rules = resourceOf(decoded, RESOURCE.DATA_VALIDATION)?.[id] as Array<Record<string, unknown>>;
    expect(rules.map((r) => r.type)).toEqual(["whole", "list", "list", "custom", "date"]);
    expect(rules[0]).toMatchObject({ operator: "between", formula1: "=$B$1", formula2: "100", allowBlank: true, showErrorMessage: true, errorStyle: 2, error: "No" });
    expect(rules[0].ranges).toEqual([{ startRow: 0, endRow: 4, startColumn: 0, endColumn: 0 }, { startRow: 0, endRow: 0, startColumn: 2, endColumn: 2 }]);
    expect(rules[1].formula1).toBe(JSON.stringify(["x", "y", '"z"']));
    expect(rules[1].allowBlank).toBe(false);
    expect(rules[2].formula1).toBe("=Other!$A$1:$A$3");
    expect(rules[3].formula1).toBe("=ISFORMULA(E1)");
    expect(rules[4]).toMatchObject({ operator: "greaterThan", formula1: "45306" });
    expect(lossy).toContain("unsupportedValidation");
  });

  test("hyperlinks: in-workbook locations, tooltips, ranges; javascript: and file: links become plain text", async () => {
    const bytes = handXlsx([{
      name: "Main",
      body: `<sheetData><row r="1">${inlineCell("A1", "go")}${inlineCell("B1", "web")}${inlineCell("C1", "bad")}${inlineCell("D1", "file")}</row><row r="2">${inlineCell("A2", "r1")}</row><row r="3">${inlineCell("A3", "r2")}</row></sheetData>`
        + '<hyperlinks><hyperlink ref="A1" location="\'Other Sheet\'!B2" tooltip="Jump"/><hyperlink ref="B1" r:id="rId1" tooltip="Site"/><hyperlink ref="C1" r:id="rId2"/><hyperlink ref="D1" r:id="rId3"/><hyperlink ref="A2:A3" r:id="rId1"/></hyperlinks>',
      rels: [["rId1", "hyperlink", "https://example.com/a", true], ["rId2", "hyperlink", "javascript:alert(1)", true], ["rId3", "hyperlink", "file:///etc/passwd", true]],
    }, { name: "Other Sheet", body: "<sheetData/>" }]);
    const { decoded } = await readFixture(bytes);
    const main = sheetNamed(decoded, "Main").sheet;
    const other = sheetNamed(decoded, "Other Sheet").id;
    const linkOf = (r: number, c: number) => main.cellData[r]?.[c]?.p?.body?.customRanges?.[0]?.properties;
    expect(linkOf(0, 0)).toEqual({ url: `#gid=${other}&range=B2`, tooltip: "Jump" });
    expect(linkOf(0, 1)).toEqual({ url: "https://example.com/a", tooltip: "Site" });
    expect(linkOf(0, 2)).toBeUndefined();
    expect(main.cellData[0]?.[2]?.v).toBe("bad");
    expect(linkOf(0, 3)).toBeUndefined();
    expect(linkOf(1, 0)?.url).toBe("https://example.com/a");
    expect(linkOf(2, 0)?.url).toBe("https://example.com/a");
  });

  test("formulas lose their _xlfn / _xlpm prefixes; a custom row height is kept with auto height off", async () => {
    const bytes = handXlsx([{
      name: "S",
      body: '<sheetData><row r="1"><c r="A1"><f>_xlfn.XLOOKUP(1,B:B,C:C)</f><v>3</v></c><c r="B1"><f>_xlfn.LET(_xlpm.x,2,_xlpm.x*3)</f><v>6</v></c></row><row r="3" ht="30" customHeight="1"/></sheetData>'
        + '<conditionalFormatting sqref="A1:A3"><cfRule type="expression" priority="1"><formula>_xlfn.ISFORMULA(A1)</formula></cfRule></conditionalFormatting>',
    }]);
    const { decoded } = await readFixture(bytes);
    const { id, sheet } = firstSheet(decoded);
    expect(sheet.cellData[0]?.[0]?.f).toBe("=XLOOKUP(1,B:B,C:C)");
    expect(sheet.cellData[0]?.[1]?.f).toBe("=LET(x,2,x*3)");
    expect(sheet.rowData[2]).toEqual({ h: 40, ia: 0 });
    const cf = resourceOf(decoded, RESOURCE.CONDITIONAL_FORMATTING)?.[id] as Array<{ rule: { value: string } }>;
    expect(cf[0].rule.value).toBe("=ISFORMULA(A1)");
  });
});

describe("hostile XML", () => {
  test("<col> ranges ExcelJS would expand to a billion columns, however the value is written", async () => {
    const tricks: Array<[string, number | string]> = [
      ["<col min='1' max='1000000000' width='9'/>", 16_384],
      ['<col min="1" max="&#49;000000000"/>', 16_384],
      ['<col min="1" max="+1000000000"/>', 16_384],
      ['<col min="1" max=" 1000000000"/>', 16_384],
      // A quote that hides "</cols>" inside the value: the rebuilt block drops the tag, the rest no longer parses.
      ["<col min=\"1\" max='1000000000</cols><sheetData/>'/>", "corrupt"],
    ];
    for (const [col, expected] of tricks) {
      const started = performance.now();
      const bytes = handXlsx([{ name: "S", body: `<cols>${col}</cols><sheetData/>` }]);
      const result = await readFixture(bytes).then((r) => Object.keys(firstSheet(r.decoded).sheet.columnData).length, (e: unknown) => (e instanceof SpreadsheetReadError ? e.code : String(e)));
      expect(performance.now() - started).toBeLessThan(5000);
      expect(result).toBe(expected);
    }
  });

  test("untrusted names never reach object prototypes: type=\"constructor\" is just an unknown validation type", async () => {
    const bytes = handXlsx([{
      name: "S",
      body: '<sheetData/><dataValidations><dataValidation type="constructor" sqref="A1"><formula1>1</formula1></dataValidation><dataValidation type="__proto__" sqref="A2"><formula1>1</formula1></dataValidation></dataValidations>',
    }]);
    const { decoded, lossy } = await readFixture(bytes);
    expect(resourceOf(decoded, RESOURCE.DATA_VALIDATION)).toBeUndefined();
    expect(lossy).toEqual(["unsupportedValidation"]);
    // ExcelJS itself looks element names up on a plain object: such a sheet is refused, never half-read.
    const odd = handXlsx([{ name: "S", body: "<sheetData/><constructor/>" }]);
    expect(await codeOf(readFixture(odd))).toBe("corrupt");
  });

  test("two sheets naming one part, too many sheets, and a flood of blocks are refused", async () => {
    const shared = handXlsx([{ name: "A", body: "<sheetData/>" }], {
      workbookExtra: "",
      parts: {
        "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="A" sheetId="1" r:id="rId1"/><sheet name="B" sheetId="2" r:id="rId1"/></sheets></workbook>',
      },
    });
    expect(await codeOf(prescanXlsx(shared, LIMITS))).toBe("corrupt");
    const many = Array.from({ length: 501 }, (_, i) => `<sheet name="S${i}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
    const tooMany = handXlsx([{ name: "A", body: "<sheetData/>" }], { parts: { "xl/workbook.xml": `<workbook xmlns:r="r"><sheets>${many}</sheets></workbook>` } });
    expect(await codeOf(prescanXlsx(tooMany, LIMITS))).toBe("too_many_cells");
    const flood = handXlsx([{ name: "A", body: `<sheetData/>${'<drawing r:id="x"/>'.repeat(65)}` }]);
    expect(await codeOf(prescanXlsx(flood, LIMITS))).toBe("corrupt");
  });

  test("text shaped to make regular expressions backtrack is read in linear time", async () => {
    const comments = `<comments><commentList><comment ref="A1"><text>${"<rPh>".repeat(200_000)}<t>x</t></text></comment></commentList></comments>`;
    const names = `<definedNames><definedName name="Many">${"Data!$A$1,".repeat(800)}Data!$A$1</definedName><definedName name="Long">${"1+".repeat(5000)}1</definedName></definedNames>`;
    const started = performance.now();
    const bytes = handXlsx([{
      name: "Data", body: "<sheetData/>", rels: [["rId1", "comments", "../comments1.xml"]],
    }], { workbookExtra: names, parts: { "xl/comments1.xml": comments } });
    const { decoded } = await readFixture(bytes);
    expect(performance.now() - started).toBeLessThan(5000);
    const byName = Object.values(resourceOf(decoded, RESOURCE.DEFINED_NAME) ?? {}).map((n) => (n as { name: string }).name);
    expect(byName).toEqual(["Many"]);
  });

  test("a validation bound of 100 k digits ending in text is told from a number in linear time", () => {
    const digits = "1".repeat(100_000);
    const xml = `<dataValidations><dataValidation type="decimal" operator="between" sqref="A1"><formula1>${digits}x</formula1><formula2>${digits}.5x</formula2></dataValidation></dataValidations>`;
    const started = performance.now();
    const rules = readValidations(xml, new Set());
    expect(performance.now() - started).toBeLessThan(500); // was quadratic: about 10 s
    expect([rules[0].formula1, rules[0].formula2]).toEqual([`=${digits}x`, `=${digits}.5x`]);
  });
});

describe("work a small file could make huge", () => {
  test("a row numbered 4294967294, and 50 k rows each holding one cell in column XFD, cost only the cells present", async () => {
    let started = performance.now();
    const sparse = handXlsx([{ name: "S", body: `<sheetData><row r="1">${inlineCell("A1", "a")}</row><row r="4294967294">${inlineCell("A4294967294", "b")}</row></sheetData>` }]);
    expect(Object.keys(firstSheet((await readFixture(sparse)).decoded).sheet.cellData)).toEqual(["0"]);
    expect(performance.now() - started).toBeLessThan(5000);
    const rows = Array.from({ length: 50_000 }, (_, i) => `<row r="${i + 1}"><c r="XFD${i + 1}"><v>1</v></c></row>`).join("");
    started = performance.now();
    const wide = await readFixture(handXlsx([{ name: "S", body: `<sheetData>${rows}</sheetData>` }]));
    expect(performance.now() - started).toBeLessThan(5000);
    expect([wide.summary.cellCount, firstSheet(wide.decoded).sheet.cellData[49_999]?.[16_383]?.v]).toEqual([50_000, 1]);
  });

  test("sheet names and ids ExcelJS refuses or indexes by: every sheet kept in order, with its merges, notes, links and names", async () => {
    const long = "Quarterly revenue by region and store 2026";
    const sheetEls = [[long, "4000000000"], ["History", "0"], ["data", "7"], ["Data", "7"]]
      .map(([name, id], i) => `<sheet name="${name}" sheetId="${id}" r:id="rId${i + 1}"/>`).join("");
    const started = performance.now();
    const bytes = handXlsx([
      { name: "x", body: '<sheetData/><mergeCells><mergeCell ref="A1:B2"/></mergeCells>', rels: [["rId1", "comments", "../comments1.xml"]] },
      { name: "x", body: `<sheetData><row r="1">${inlineCell("A1", "go")}</row></sheetData><hyperlinks><hyperlink ref="A1" location="'${long}'!C3"/></hyperlinks>` },
      { name: "x", body: "<sheetData/>" },
      { name: "x", body: "<sheetData/>" },
    ], {
      parts: {
        "xl/workbook.xml": `<workbook xmlns:r="r"><sheets>${sheetEls}</sheets><definedNames><definedName name="Local" localSheetId="3">Data!$A$1</definedName></definedNames></workbook>`,
        "xl/comments1.xml": '<comments><commentList><comment ref="D4"><text><t>note</t></text></comment></commentList></comments>',
      },
    });
    const { decoded } = await readFixture(bytes);
    expect(performance.now() - started).toBeLessThan(5000);
    const [first, second, , fourth] = decoded.sheetOrder;
    expect(decoded.sheetOrder.map((id) => decoded.sheets[id].name)).toEqual(["Quarterly revenue by region and", "Sheet1", "data", "Data (2)"]);
    expect(decoded.sheets[first].mergeData).toEqual([{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }]);
    expect((resourceOf(decoded, RESOURCE.NOTE)?.[first] as Record<string, Record<string, { note: string }>>)["3"]["3"].note).toBe("note");
    expect(decoded.sheets[second].cellData[0]?.[0]?.p?.body?.customRanges?.[0]?.properties?.url).toBe(`#gid=${first}&range=C3`);
    expect(Object.values(resourceOf(decoded, RESOURCE.DEFINED_NAME) ?? {})).toMatchObject([{ name: "Local", localSheetId: fourth }]);
  });

  test("columns count like cells: 500 sheets reaching column XFD (by a cell, a late or escaped r, a <col>) never reach ExcelJS", async () => {
    const coarse = { maxInflatedBytes: 200 * MIB, maxCells: 300_000 };
    const book = (sheets: number, body: string) => handXlsx(Array.from({ length: sheets }, (_, i) => ({ name: `S${i}`, body })));
    for (const body of ['<sheetData><row r="1"><c r="XFD1"/></row></sheetData>', '<sheetData><row r="1"><c s="0" r="&#88;FD1"/></row></sheetData>', '<cols><col min="1" max="16384"/></cols><sheetData/>']) {
      const started = performance.now();
      expect(await codeOf(prescanXlsx(book(500, body), coarse))).toBe("too_many_cells");
      expect(performance.now() - started).toBeLessThan(5000);
    }
    // 18 sheets 16,384 wide fit the 300 k cap; 19 do not.
    expect(await codeOf(prescanXlsx(book(18, '<sheetData><row r="1"><c r="XFD1"/></row></sheetData>'), coarse))).toBe("ok");
    expect(await codeOf(prescanXlsx(book(19, '<sheetData><row r="1"><c r="A1"/><c/>' + "<c/>".repeat(16_382) + "</row></sheetData>"), coarse))).toBe("too_many_cells");
  });

  test("the column pass reads each start tag once: a flood of unterminated <c tags, or one endless tag, costs its bytes", async () => {
    // 20 sheets are more than 16,384 columns each may reach under the coarse cap, so every part's extent is read.
    const coarse = { maxInflatedBytes: 200 * MIB, maxCells: 300_000 };
    const book = (first: string) => handXlsx(Array.from({ length: 20 }, (_, i) => ({ name: `S${i}`, body: i === 0 ? first : "<sheetData/>" })));
    for (const body of [
      `<sheetData><row>${'<c "'.repeat(290_000)}`, // each tag once re-read the rest of the part: minutes
      `<sheetData><row><c ${"a".repeat(4_000_000)}`, // one attribute name the regular expression backtracked over
    ]) {
      const started = performance.now();
      expect(await codeOf(prescanXlsx(book(body), coarse))).toBe("ok"); // ExcelJS refuses it later; the cap is kept
      expect(performance.now() - started).toBeLessThan(5000);
    }
    // Escaped, late and single-quoted references still count, and a malformed tag never ends the part's pass.
    const late = `<sheetData><row r="1"><c "/><c s='0' r='&#88;FD1'/></row></sheetData>`;
    expect(await codeOf(prescanXlsx(handXlsx(Array.from({ length: 19 }, (_, i) => ({ name: `S${i}`, body: late }))), coarse))).toBe("too_many_cells");
  });

  test("merges that overlap cost the cells looked at: 10 k large ones overlapping early or late stop at once", () => {
    const flood = '<mergeCell ref="A1:Z11537"/>'.repeat(10_000);
    const late = { startRow: 11_536, endRow: 11_536, startColumn: 24, endColumn: 25 };
    for (const [ref, range] of [["A1:B1", { startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }], ["Y11537:Z11537", late]] as const) {
      const started = performance.now();
      expect(readMerges(`<mergeCells><mergeCell ref="${ref}"/>${flood}</mergeCells>`, newMergeBudget())).toEqual([range]);
      expect(performance.now() - started).toBeLessThan(5000);
    }
  });

  test("hyperlinks stop being read once their cell budget is spent", () => {
    let sanitized = 0;
    const xml = `<hyperlinks>${'<hyperlink ref="A1:XFD7" r:id="rId1"/>'.repeat(50_000)}</hyperlinks>`;
    const links = readHyperlinks(xml, new Map([["rId1", { target: "https://example.com/", external: true }]]), (href) => {
      sanitized++;
      return href;
    });
    expect([links.size, sanitized]).toEqual([100_000, 1]);
  });
});

describe("sheet sanity", () => {
  test("a workbook whose sheets are all hidden shows its first; a freeze of a million rows is clamped", async () => {
    const pane = '<sheetViews><sheetView workbookViewId="0"><pane xSplit="5000" ySplit="1000000" topLeftCell="A1000001" state="frozen"/></sheetView></sheetViews>';
    const bytes = handXlsx([
      { name: "A", body: `${pane}<sheetData/>`, state: "hidden" },
      { name: "B", body: "<sheetData/>", state: "veryHidden" },
    ]);
    const { decoded } = await readFixture(bytes);
    expect(decoded.sheetOrder.map((id) => decoded.sheets[id].hidden)).toEqual([0, 2]);
    expect(firstSheet(decoded).sheet.freeze).toEqual({ xSplit: 200, ySplit: 1000, startRow: 1000, startColumn: 200 });
  });
});
