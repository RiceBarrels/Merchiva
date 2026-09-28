// Named ranges an .xlsx round trip leaves out are reported as the `definedNames` lossy item (W1.2e#3, sheets.md
// §11.8): on import (lib/sheets/xlsx/import-workbook.ts readDefinedNames) every name that is not kept, and on
// download (export-workbook.ts) every name the writer cannot write. Excel's reserved names are never the user's and
// are left out silently on both sides: `_xlnm.` built-ins (print areas and titles, the filter database), the
// hidden `_xlfn.` placeholders Excel keeps for newer functions (`#NAME?`, which no writer could write back), and the
// hidden `_xlchart.` data of Excel's newer chart types (those charts are dropped and reported as `charts`). A file
// whose names all survive reports nothing. A user's hidden name is kept; ExcelJS cannot write the `hidden` flag, so
// it downloads as a visible name, unreported (Univer lists it like any other, and formulas may use it).

import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import * as ExcelJSNode from "exceljs";
import type { IWorkbookData } from "@univerjs/presets";
import { SHEET_LOSSY_ITEMS } from "@/lib/sheets/types";
import { RESOURCE } from "@/lib/sheets/univer-constants";
import { exportXlsxBytes } from "@/lib/sheets/xlsx/export-workbook";
import { lossyItemKey } from "@/lib/sheets/xlsx/lossy";
import en from "@/scripts/i18n/drive/sheets/en.json";
import { ExcelJS, handXlsx, readFixture, resourceOf } from "./helpers/xlsx-fixtures";

const definedNames = (xml: string) => handXlsx([{ name: "Data", body: "<sheetData/>" }], { workbookExtra: `<definedNames>${xml}</definedNames>` });
const KEPT = '<definedName name="Prices">Data!$A$1:$A$3</definedName><definedName name="Rate">0.2</definedName>';

async function imported(xml: string) {
  const { decoded, lossy } = await readFixture(definedNames(xml));
  const names = Object.values(resourceOf(decoded, RESOURCE.DEFINED_NAME) ?? {}) as Array<{ name: string }>;
  return { names: names.map((n) => n.name).sort(), lossy };
}

describe("import", () => {
  test("names that all survive, and Excel's reserved _xlnm. / _xlfn. / _xlchart. names, report nothing", async () => {
    const { names, lossy } = await imported(`${KEPT}<definedName name="_xlnm.Print_Area" localSheetId="0">Data!$A$1:$B$2</definedName>`
      + '<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Data!$A$1:$C$9</definedName>'
      + '<definedName name="_xlfn.IFS" hidden="1">#NAME?</definedName><definedName name="_xlfn._xlws.SORT" hidden="1">#NAME?</definedName>'
      + '<definedName name="_xlchart.v1.0" hidden="1">Data!$A$2:$A$10</definedName><definedName name="_xlchart.v2.1" hidden="1">0</definedName>');
    expect([names, lossy.includes("definedNames")]).toEqual([["Prices", "Rate"], false]);
  });

  test("a user's hidden name is kept hidden, and downloads as a visible name without a report", async () => {
    const { decoded, lossy } = await readFixture(definedNames('<definedName name="Secret" hidden="1">Data!$B$1</definedName>'));
    const names = Object.values(resourceOf(decoded, RESOURCE.DEFINED_NAME) ?? {}) as Array<{ name: string; hidden?: boolean }>;
    expect([names.map((n) => [n.name, n.hidden]), lossy.includes("definedNames")]).toEqual([[["Secret", true]], false]);
    const out = await exportXlsxBytes(ExcelJS, decoded);
    const xml = await (await JSZip.loadAsync(out.bytes)).file("xl/workbook.xml")?.async("string");
    expect([xml?.match(/<definedNames>.*<\/definedNames>/s)?.[0], out.lossy.has("definedNames")])
      .toEqual(['<definedNames><definedName name="Secret">Data!$B$1</definedName></definedNames>', false]);
  });

  test("each name left out is reported; the rest are kept", async () => {
    for (const dropped of [
      '<definedName name="Ext">[1]Sheet1!$A$1</definedName>', // a link to another file
      '<definedName name="A1">Data!$A$1</definedName>', // looks like a cell
      '<definedName name="Two words">Data!$A$1</definedName>', // a name Excel refuses
      '<definedName name="Lost" localSheetId="5">Data!$A$1</definedName>', // a sheet the file does not have
      '<definedName name="prices">Data!$B$1</definedName>', // the same name twice in one scope
      '<definedName name="Empty"></definedName>',
      `<definedName name="Long">${"1+".repeat(4100)}1</definedName>`, // past Excel's formula length
    ]) {
      const { names, lossy } = await imported(`${KEPT}${dropped}`);
      expect([dropped.slice(0, 40), names, lossy.includes("definedNames")]).toEqual([dropped.slice(0, 40), ["Prices", "Rate"], true]);
    }
  });
});

describe("download", () => {
  const workbook = (names: Record<string, { name: string; formulaOrRefString: string }>): IWorkbookData => ({
    id: "u", name: "Names", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["s1"],
    sheets: { s1: { id: "s1", name: "Sheet1", cellData: { 0: { 0: { v: 1, t: 2 } } } } },
    resources: [{ name: RESOURCE.DEFINED_NAME, data: JSON.stringify(Object.fromEntries(Object.entries(names).map(([id, n]) => [id, { id, ...n }]))) }],
  }) as unknown as IWorkbookData;
  const PRICES = { name: "Prices", formulaOrRefString: "=Sheet1!$A$1:$A$3" };

  async function exported(extra: Record<string, { name: string; formulaOrRefString: string }>) {
    const { bytes, lossy } = await exportXlsxBytes(ExcelJS, workbook({ p: PRICES, ...extra }));
    const back = new ExcelJSNode.Workbook();
    await back.xlsx.load(bytes as unknown as ExcelJSNode.Buffer);
    return { names: back.definedNames.model.map((entry) => entry.name).sort(), lossy: lossy.has("definedNames") };
  }

  test("names that are all written, and a reserved name (never written), report nothing", async () => {
    expect(await exported({})).toEqual({ names: ["Prices"], lossy: false });
    expect(await exported({ fn: { name: "_xlfn.IFS", formulaOrRefString: "=#NAME?" } })).toEqual({ names: ["Prices"], lossy: false });
    // A workbook imported before `_xlchart.` names were left out may still hold one; its chart is long gone.
    expect(await exported({ ch: { name: "_xlchart.v1.0", formulaOrRefString: "=Sheet1!$A$1:$A$3" } })).toEqual({ names: ["Prices"], lossy: false });
  });

  test("each name the writer leaves out is reported; the rest are written", async () => {
    for (const dropped of [
      { name: "Rate", formulaOrRefString: "=0.07" }, // a constant: ExcelJS writes ranges only
      { name: "Doubled", formulaOrRefString: "=SUM(Sheet1!$A$1:$A$3)*2" }, // a formula
      { name: "Two words", formulaOrRefString: "=Sheet1!$B$1" }, // a name Excel refuses
      { name: "prices", formulaOrRefString: "=Sheet1!$B$1" }, // the same name twice
      { name: "Gone", formulaOrRefString: "=Missing!$A$1" }, // a sheet that is not exported
      { name: "Huge", formulaOrRefString: "=Sheet1!$B$1:$B$250000" }, // past the all-names cell budget
    ]) {
      expect([dropped.name, await exported({ d: dropped })]).toEqual([dropped.name, { names: ["Prices"], lossy: true }]);
    }
  });

  test("the item is listed last in the dialogs and has its line of copy", () => {
    expect(SHEET_LOSSY_ITEMS.at(-1)).toBe("definedNames");
    expect(lossyItemKey("definedNames")).toBe("sheets.lossy.items.definedNames");
    expect(en.sheets.lossy.items.definedNames).toBe("Some named ranges");
  });
});
