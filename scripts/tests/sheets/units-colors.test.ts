// lib/sheets/xlsx/{units,colors,number-formats,export-styles,export-features}.ts — the conversions both xlsx
// directions share (sheets.md §11.1): column widths (ECMA-376 file widths) and row heights, serial dates in
// both date systems (checked against ExcelJS's own converters), ARGB ⇄ hex, theme colours with tints, the
// indexed palette, number formats; and written files (widths, heights, colours, merges, conditional formats
// and validation rules).

import { describe, expect, test } from "bun:test";
import * as ExcelJS from "exceljs";
import excelUtils from "exceljs/lib/utils/utils";
import { strFromU8, unzipSync } from "fflate";
import type { IWorkbookData } from "@univerjs/presets";
import {
  EXCEL_DEFAULT_COL_WIDTH, EXCEL_DEFAULT_ROW_PT, dateFromExcelSerial, excelSerialFromDate, excelWidthToPx, ptToPx,
  pxToExcelWidth, pxToPt,
} from "@/lib/sheets/xlsx/units";
import {
  EXCEL_INDEXED_COLORS, applyTint, argbToHex, hexToArgb, resolveExcelColor, themeColorTypeToHex, univerColorToArgb,
} from "@/lib/sheets/xlsx/colors";
import { isDateFormat, normalizeNumFmt } from "@/lib/sheets/xlsx/number-formats";
import { EXCEL_BORDER_BY_UNIVER, UNIVER_BORDER_BY_EXCEL, dxfStyleFrom, excelStyleFrom } from "@/lib/sheets/xlsx/export-styles";
import { exportXlsxBytes } from "@/lib/sheets/xlsx/export-workbook";
import type { ExcelJSModule } from "@/lib/sheets/xlsx/types";

const { dateToExcel, excelToDate } = excelUtils as {
  dateToExcel(d: Date, date1904?: boolean): number;
  excelToDate(v: number, date1904?: boolean): Date;
};

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** Excel's stored tints only approximate its swatches: one step per channel is the same colour. */
function expectNear(actual: string | null, expected: string): void {
  expect(actual).not.toBeNull();
  const got = channels(actual as string);
  const want = channels(`#${expected.toLowerCase()}`);
  got.forEach((c, i) => expect(Math.abs(c - want[i])).toBeLessThanOrEqual(1));
}

describe("units", () => {
  test("Excel's default column (stored as 9.140625) is 64 px and its default row (15 pt) 20 px", () => {
    expect(EXCEL_DEFAULT_COL_WIDTH).toBe(9.140625);
    expect(excelWidthToPx(EXCEL_DEFAULT_COL_WIDTH)).toBe(64);
    expect(pxToExcelWidth(64)).toBe(9.140625);
    expect(ptToPx(EXCEL_DEFAULT_ROW_PT)).toBe(20);
    expect(pxToExcelWidth(88)).toBe(12.5703125);
    expect(pxToPt(24)).toBe(18);
  });

  test("px → width → px and px → pt → px are identities for every size a sheet uses", () => {
    for (let px = 1; px <= 2000; px++) {
      expect(excelWidthToPx(pxToExcelWidth(px))).toBe(px);
      expect(ptToPx(pxToPt(px))).toBe(px);
    }
  });

  test("a file width already holds the 5 px padding (ECMA-376 §18.3.1.13's own example: 8.7109375 is 61 px)", () => {
    expect(excelWidthToPx(8.7109375)).toBe(61);
    expect(pxToExcelWidth(61)).toBe(8.7109375);
    // A 10-character column as Excel's dialog shows it (10 × 7 + 5 px), stored as 10.7109375.
    expect(excelWidthToPx(10.7109375)).toBe(75);
    // The dialog's 8.43, written raw, is five pixels narrower than the default column.
    expect(excelWidthToPx(8.43)).toBe(59);
    expect(pxToExcelWidth(7)).toBe(1);
  });

  test("zero, negative and non-finite sizes become 0", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(excelWidthToPx(bad)).toBe(0);
      expect(pxToExcelWidth(bad)).toBe(0);
      expect(ptToPx(bad)).toBe(0);
      expect(pxToPt(bad)).toBe(0);
    }
  });

  test("serial dates: known values in both date systems", () => {
    const day = new Date(Date.UTC(2024, 0, 15));
    expect(excelSerialFromDate(day, false)).toBe(45306);
    expect(excelSerialFromDate(day, true)).toBe(43844);
    expect(excelSerialFromDate(new Date(Date.UTC(2024, 0, 15, 12)), false)).toBe(45306.5);
    expect(dateFromExcelSerial(45306, false).toISOString()).toBe("2024-01-15T00:00:00.000Z");
    expect(dateFromExcelSerial(43844, true).toISOString()).toBe("2024-01-15T00:00:00.000Z");
    expect(dateFromExcelSerial(61, false).toISOString()).toBe("1900-03-01T00:00:00.000Z");
  });

  test("serial dates agree with ExcelJS's dateToExcel / excelToDate, both ways, both systems", () => {
    const serials = [1, 60.25, 61, 25569, 36526.75, 43844, 45306.5, 60000.125];
    for (const date1904 of [false, true]) {
      for (const serial of serials) {
        const date = dateFromExcelSerial(serial, date1904);
        expect(date.getTime()).toBe(excelToDate(serial, date1904).getTime());
        expect(excelSerialFromDate(date, date1904)).toBeCloseTo(dateToExcel(date, date1904), 9);
        expect(excelSerialFromDate(date, date1904)).toBeCloseTo(serial, 9);
      }
    }
  });
});

describe("colors", () => {
  test("ARGB ⇄ hex: the alpha byte is dropped on read, written as FF", () => {
    expect(argbToHex("FF00FF00")).toBe("#00ff00");
    expect(argbToHex("00ABCDEF")).toBe("#abcdef");
    expect(argbToHex("abcdef")).toBe("#abcdef");
    for (const bad of ["", "FF00FF0", "GG000000", null, undefined]) expect(argbToHex(bad)).toBeNull();
    expect(hexToArgb("#abc")).toBe("FFAABBCC");
    expect(hexToArgb("#AbCdEf")).toBe("FFABCDEF");
    expect(hexToArgb(" #aabbcc80 ")).toBe("FFAABBCC");
    expect(hexToArgb("rgb(1, 2, 255)")).toBe("FF0102FF");
    expect(hexToArgb("rgba(16,32,48,0.5)")).toBe("FF102030");
  });

  test("transparent, named, malformed and out-of-range colours are no colour", () => {
    for (const bad of ["#aabbcc00", "#0000", "rgba(1,2,3,0)", "transparent", "red", "#12", "rgb(256,0,0)", "", null]) {
      expect(hexToArgb(bad)).toBeNull();
    }
  });

  test("hex → ARGB → hex keeps the colour", () => {
    for (const hex of ["#000000", "#ffffff", "#4472c4", "#1a2b3c"]) expect(argbToHex(hexToArgb(hex))).toBe(hex);
  });

  test("theme slots use Excel's attribute order (0 = light 1, 1 = dark 1, 2 = light 2, 3 = dark 2)", () => {
    expect(resolveExcelColor({ theme: 0 })).toBe("#ffffff");
    expect(resolveExcelColor({ theme: 1 })).toBe("#000000");
    expect(resolveExcelColor({ theme: 2 })).toBe("#e7e6e6");
    expect(resolveExcelColor({ theme: 3 })).toBe("#44546a");
    expect(resolveExcelColor({ theme: 4 })).toBe("#4472c4");
    expect(resolveExcelColor({ theme: 10 })).toBe("#0563c1");
    expect(resolveExcelColor({ theme: 11 })).toBe("#954f72");
    expect(resolveExcelColor({ theme: 12 })).toBeNull();
  });

  test("theme + tint matches Excel's lighter / darker swatches", () => {
    const swatches: Array<[number, number, string]> = [
      [4, 0.7999816888943144, "D9E1F2"], [4, 0.5999938962981048, "B4C6E7"], [4, 0.3999755851924192, "8EA9DB"],
      [4, -0.249977111117893, "2F5597"], [4, -0.499984740745262, "203764"],
      [0, -0.0499893185216834, "F2F2F2"], [0, -0.1499984740745262, "D9D9D9"], [0, -0.249977111117893, "BFBFBF"],
      [0, -0.3499862666707358, "A6A6A6"], [0, -0.499984740745262, "808080"],
      [1, 0.499984740745262, "808080"], [1, 0.3499862666707358, "595959"], [1, 0.249977111117893, "404040"],
      [1, 0.1499984740745262, "262626"], [1, 0.0499893185216834, "0D0D0D"],
      [2, -0.0999786370433668, "D0CECE"], [3, 0.7999816888943144, "D6DCE4"],
      [5, 0.3999755851924192, "F4B084"], [9, -0.249977111117893, "548235"],
    ];
    for (const [theme, tint, expected] of swatches) expectNear(resolveExcelColor({ theme, tint }), expected);
    expect(applyTint("#4472c4", 0)).toBe("#4472c4");
    expect(applyTint("4472C4", 1)).toBe("#ffffff");
    expect(applyTint("4472C4", -1)).toBe("#000000");
  });

  test("the indexed palette has 64 colours plus the system foreground (64) and background (65)", () => {
    expect(EXCEL_INDEXED_COLORS).toHaveLength(66);
    expect(resolveExcelColor({ indexed: 2 })).toBe("#ff0000");
    expect(resolveExcelColor({ indexed: 10 })).toBe("#ff0000");
    expect(resolveExcelColor({ indexed: 22 })).toBe("#c0c0c0");
    expect(resolveExcelColor({ indexed: 64 })).toBe("#000000");
    expect(resolveExcelColor({ indexed: 65 })).toBe("#ffffff");
    expect(resolveExcelColor({ indexed: 66 })).toBeNull();
  });

  test("argb wins over theme; nothing usable is null", () => {
    expect(resolveExcelColor({ argb: "FF112233", theme: 4 })).toBe("#112233");
    expect(resolveExcelColor({})).toBeNull();
    expect(resolveExcelColor(null)).toBeNull();
    expect(resolveExcelColor({ theme: 1.5 })).toBeNull();
  });

  test("Univer colours: rgb first, else the theme token in scheme order", () => {
    expect(themeColorTypeToHex(0)).toBe("#000000");
    expect(themeColorTypeToHex(1)).toBe("#ffffff");
    expect(themeColorTypeToHex(4)).toBe("#4472c4");
    expect(themeColorTypeToHex(99)).toBeNull();
    expect(univerColorToArgb({ rgb: "#123456", th: 4 })).toBe("FF123456");
    expect(univerColorToArgb({ th: 5 })).toBe("FFED7D31");
    expect(univerColorToArgb({ rgb: "" })).toBeNull();
    expect(univerColorToArgb(null)).toBeNull();
  });

  test("style colours reach the ExcelJS style (font, fill, borders); the border tables are inverses", () => {
    const style = excelStyleFrom({ cl: { rgb: "#ff0000" }, bg: { rgb: "rgb(0,128,0)" }, bd: { t: { s: 8, cl: { rgb: "#0000ff" } } } });
    expect(style.font?.color).toEqual({ argb: "FFFF0000" });
    expect(style.fill).toEqual({ type: "pattern", pattern: "solid", fgColor: { argb: "FF008000" } });
    expect(style.border?.top).toEqual({ style: "medium", color: { argb: "FF0000FF" } });
    for (const [univer, excel] of Object.entries(EXCEL_BORDER_BY_UNIVER)) {
      expect(UNIVER_BORDER_BY_EXCEL[excel as ExcelJS.BorderStyle]).toBe(Number(univer));
    }
    expect(Object.keys(UNIVER_BORDER_BY_EXCEL)).toHaveLength(13);
  });

  test("a conditional-format highlight paints its fill as both colours (Excel reads the background one)", () => {
    const dxf = dxfStyleFrom({ bg: { rgb: "#ffff00" }, cl: { th: 4 }, bl: 1 });
    expect(dxf.fill).toEqual({ type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" }, bgColor: { argb: "FFFFFF00" } });
    expect(dxf.font).toEqual({ bold: true, color: { argb: "FF4472C4" } });
    expect(dxfStyleFrom({})).toEqual({});
  });
});

describe("number formats", () => {
  test("General, empty and over-long codes normalize to none; others are kept trimmed", () => {
    expect(normalizeNumFmt("General")).toBe("");
    expect(normalizeNumFmt(" general ")).toBe("");
    expect(normalizeNumFmt(undefined)).toBe("");
    expect(normalizeNumFmt("0".repeat(256))).toBe("");
    expect(normalizeNumFmt(" #,##0.00 ")).toBe("#,##0.00");
  });

  test("date and time codes are recognized; numbers, text and quoted letters are not", () => {
    for (const fmt of ["yyyy-mm-dd", "m/d/yy", "[$-409]mmmm d, yyyy", "h:mm AM/PM", "[h]:mm:ss", 'yyyy"年"m"月"d"日"', "dd/mm/yyyy hh:mm"]) {
      expect(isDateFormat(fmt)).toBe(true);
    }
    for (const fmt of ["General", "0.00", "#,##0", "0%", "0.00E+00", "@", '0 "days"', "[Red]#,##0;[Blue]-#,##0", "_(* #,##0_)", "\\d0"]) {
      expect(isDateFormat(fmt)).toBe(false);
    }
  });
});

describe("a written file read back by ExcelJS", () => {
  test("column widths, row heights, default sizes and the tab colour keep their pixels and colour", async () => {
    const wb = {
      id: "u", name: "Sizes", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["a"],
      sheets: {
        a: {
          id: "a", name: "Sizes", tabColor: "#FF8800", defaultColumnWidth: 88, defaultRowHeight: 24,
          columnData: { 0: { w: 120 }, 2: { w: 7 }, 5: { hd: 1 } },
          rowData: {
            1: { h: 40, ia: 0 }, 2: { h: 90, ia: 1 }, 4: { hd: 1 }, 6: { h: 50, ah: 30 }, 7: { h: 50 },
            8: { s: { bl: 1 } }, 9: { s: { bl: 1 } },
          },
          cellData: { 0: { 0: { v: 1, t: 2 } }, 8: { 0: { v: "wrapped text" } } },
        },
      },
    } as unknown as IWorkbookData;
    const { bytes } = await exportXlsxBytes(ExcelJS as unknown as ExcelJSModule, wb);
    // Any height ExcelJS writes is a custom one, which Excel never fits to the content again.
    const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    const rowTag = (r: number) => xml.match(new RegExp(`<row r="${r}"[^>]*>`))?.[0] ?? "";
    expect(rowTag(7)).not.toContain("ht="); // Univer fits it (no ia, an auto height)
    expect(rowTag(8)).toContain('ht="37.5" customHeight="1"');
    expect(rowTag(9)).toContain('s="1"'); // styled, with a cell: no height
    expect(rowTag(9)).not.toContain("ht=");
    expect(rowTag(10)).toContain('ht="18" customHeight="1"'); // styled, no cell: kept by a height
    expect(rowTag(5)).toContain('ht="18" customHeight="1" hidden="1"');
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const ws = back.worksheets[0];
    expect(excelWidthToPx(ws.getColumn(1).width ?? 0)).toBe(120);
    expect(excelWidthToPx(ws.getColumn(3).width ?? 0)).toBe(7);
    expect(ws.getColumn(6).hidden).toBe(true);
    expect(ptToPx(ws.getRow(2).height)).toBe(40);
    expect(ws.getRow(3).height).toBeUndefined();
    expect(ws.getRow(5).hidden).toBe(true);
    expect(ptToPx(ws.properties.defaultRowHeight)).toBe(24);
    expect(excelWidthToPx(ws.properties.defaultColWidth ?? 0)).toBe(88);
    expect(resolveExcelColor(ws.properties.tabColor)).toBe("#ff8800");
  });

  test("merges are clamped to the sheet's grid; overlapping ones and ones past the budget are left out", async () => {
    const merge = (startRow: number, endRow: number, startColumn: number, endColumn: number) => ({ startRow, endRow, startColumn, endColumn });
    const wb = {
      id: "u", name: "Merges", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["a", "b"],
      sheets: {
        a: {
          id: "a", name: "A", rowCount: 10, columnCount: 5, cellData: {},
          mergeData: [merge(0, 1, 0, 1), merge(1, 2, 1, 2), merge(5, 100, 0, 0), merge(0, 1_048_575, 3, 9), merge(20, 30, 0, 1)],
        },
        // 800,000 merged cells: past the workbook's budget, so nothing is merged (and nothing hangs).
        b: { id: "b", name: "B", cellData: {}, mergeData: [merge(0, 399_999, 0, 1), merge(0, 1, 3, 3)] },
      },
    } as unknown as IWorkbookData;
    const { bytes } = await exportXlsxBytes(ExcelJS as unknown as ExcelJSModule, wb);
    const files = unzipSync(bytes);
    const refs = (part: string) => [...strFromU8(files[part]).matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(refs("xl/worksheets/sheet1.xml")).toEqual(["A1:B2", "A6:A10", "D1:E10"]);
    expect(refs("xl/worksheets/sheet2.xml")).toEqual(["D1:D2"]);
  });

  test("a date validation bound is written as its serial in the workbook's own date system", async () => {
    const dateRule = (uid: string, row: number, formula1: string) => ({
      uid, type: "date", operator: "greaterThan", formula1, ranges: [{ startRow: row, endRow: row, startColumn: 0, endColumn: 0 }],
    });
    const serials = async (dateSystem: string) => {
      const wb = {
        id: "u", name: "Dates", appVersion: "1.0.2", locale: "enUS", dateSystem, styles: {}, sheetOrder: ["a"],
        sheets: { a: { id: "a", name: "Dates", cellData: {} } },
        // Two adjacent single-cell rules with different bounds must stay two rules.
        resources: [{ name: "SHEET_DATA_VALIDATION_PLUGIN", data: JSON.stringify({ a: [dateRule("1", 0, "2024-01-15"), dateRule("2", 1, "45000")] }) }],
      } as unknown as IWorkbookData;
      const { bytes } = await exportXlsxBytes(ExcelJS as unknown as ExcelJSModule, wb);
      const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
      return [...xml.matchAll(/sqref="(A\d)"><formula1>([^<]+)</g)].map((m) => [m[1], m[2]]);
    };
    expect(await serials("date1900")).toEqual([["A1", "45306"], ["A2", "45000"]]);
    expect(await serials("date1904")).toEqual([["A1", "43844"], ["A2", "45000"]]);
  });

  test("conditional formats of every kind and validation rules land in the sheet part", async () => {
    const col = (c: number, c2 = c) => ({ startRow: 0, endRow: 9, startColumn: c, endColumn: c2 });
    const hl = (rule: Record<string, unknown>) => ({ type: "highlightCell", style: { bg: { rgb: "#ffff00" } }, ...rule });
    const cf = [
      [col(0), hl({ subType: "number", operator: "greaterThan", value: 5 })],
      [col(1), hl({ subType: "text", operator: "containsText", value: 'a"b' })],
      [[col(2), col(4)], hl({ subType: "duplicateValues" })],
      [col(3), hl({ subType: "timePeriod", operator: "last7Days" })],
      [col(5), hl({ subType: "rank", isBottom: true, isPercent: false, value: 3 })],
      [col(6), hl({ subType: "average", operator: "greaterThanOrEqual" })],
      [col(7), hl({ subType: "average", operator: "greaterThan" })],
      [col(8), { type: "colorScale", config: [{ index: 1, color: "#ff0000", value: { type: "max" } }, { index: 0, color: "#00ff00", value: { type: "min" } }] }],
      [col(9), { type: "iconSet", isShowValue: true, config: [] }],
      [col(10), { type: "dataBar", isShowValue: true, config: { min: { type: "min" }, max: { type: "percent", value: 90 }, isGradient: true, positiveColor: "#638ec6" } }],
      [col(11), hl({ subType: "formula", value: "=XLOOKUP(1,A:A,B:B)>0" })],
    ].map(([ranges, rule], i) => ({ cfId: String(i), ranges: Array.isArray(ranges) ? ranges : [ranges], stopIfTrue: false, rule }));
    const cell = (row: number, c: number, c2 = c, row2 = row) => [{ startRow: row, endRow: row2, startColumn: c, endColumn: c2 }];
    const dv = [
      { uid: "1", type: "list", formula1: JSON.stringify(["Yes", "No"]), errorStyle: 1, error: "Pick one", ranges: cell(0, 12, 12, 9) },
      { uid: "2", type: "whole", operator: "between", formula1: "1", formula2: "10", ranges: cell(0, 13, 14, 3) },
      { uid: "3", type: "whole", operator: "greaterThan", formula1: "0", allowBlank: false, ranges: cell(0, 15) },
      { uid: "4", type: "custom", formula1: "=IFS(A1>0,TRUE)", ranges: cell(0, 16) },
    ];
    const wb = {
      id: "u", name: "Rules", appVersion: "1.0.2", locale: "enUS", styles: {}, sheetOrder: ["a"],
      sheets: { a: { id: "a", name: "Rules", cellData: {} } },
      resources: [
        { name: "SHEET_CONDITIONAL_FORMATTING_PLUGIN", data: JSON.stringify({ a: cf }) },
        { name: "SHEET_DATA_VALIDATION_PLUGIN", data: JSON.stringify({ a: dv }) },
      ],
    } as unknown as IWorkbookData;
    const { bytes, lossy } = await exportXlsxBytes(ExcelJS as unknown as ExcelJSModule, wb);
    expect(lossy.has("iconSets")).toBe(true);
    const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    const rules = [...xml.matchAll(/<cfRule type="(\w+)"[^>]*priority="(\d+)"/g)].map((m) => `${m[2]}:${m[1]}`);
    expect(rules).toEqual([
      "1:cellIs", "2:expression", "3:expression", "4:timePeriod", "5:top10", "6:expression", "7:aboveAverage",
      "8:colorScale", "9:dataBar", "10:expression",
    ]);
    const formulas = [...xml.matchAll(/<formula>([^<]*)<\/formula>/g)].map((m) => m[1]);
    expect(formulas).toEqual([
      "5", "NOT(ISERROR(SEARCH(&quot;a&quot;&quot;b&quot;,B1)))", "(COUNTIF($C$1:$C$10,C1)+COUNTIF($E$1:$E$10,C1))&gt;1",
      "AND(TODAY()-FLOOR(D1,1)&lt;=6,FLOOR(D1,1)&lt;=TODAY())", "G1&gt;=AVERAGE($G$1:$G$10)", "_xlfn.XLOOKUP(1,A:A,B:B)&gt;0",
    ]);
    expect(xml).toContain('<conditionalFormatting sqref="C1:C10 E1:E10">');
    expect(xml).toContain('<cfRule type="top10" dxfId="4" priority="5" bottom="1" rank="3"/>');
    expect(xml).toContain('<colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="FF00FF00"/><color rgb="FFFF0000"/></colorScale>');
    expect(xml).toContain('<dataBar><cfvo type="min"/><cfvo type="percent" val="90"/><color rgb="FF638EC6"/></dataBar>');
    // The bar's x14 twin (solid, since ExcelJS cannot write a gradient one) is linked by a real id.
    const barId = xml.match(/<x14:id>(\{[0-9A-F-]{36}\})<\/x14:id>/)?.[1];
    expect(barId).toBeDefined();
    expect(xml).toContain(`<x14:cfRule type="dataBar" id="${barId}"><x14:dataBar minLength="0" maxLength="100" gradient="0">`);

    expect(xml).toContain('<dataValidation type="list" allowBlank="1" showErrorMessage="1" error="Pick one" sqref="M1:M10"><formula1>&quot;Yes,No&quot;</formula1>');
    expect(xml).toContain('<dataValidation type="whole" allowBlank="1" sqref="N1:O4"><formula1>1</formula1><formula2>10</formula2>');
    expect(xml).toContain('<dataValidation type="whole" operator="greaterThan" sqref="P1"><formula1>0</formula1>');
    expect(xml).toContain('<dataValidation type="custom" allowBlank="1" sqref="Q1"><formula1>_xlfn.IFS(A1&gt;0,TRUE)</formula1>');
  });
});
