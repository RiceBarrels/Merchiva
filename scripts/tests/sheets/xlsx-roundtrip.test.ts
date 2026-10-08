// The .xlsx read path end to end (sheets.md §11.3, §15 xlsx-roundtrip): an ExcelJS-built workbook with every
// mapped feature → writeBuffer → prescan + import (as the worker runs it) → assertions → a headless Univer
// load and saveForExport() → export → read again → the same workbook (styles compared by content, sheets and
// links by name, numbers within 1e-9, sizes within 1 px). Also the 1904 date system, the written file's
// validation and conditional-format parts, and the create / import entry points (in-thread read in Bun).

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as ExcelJSNode from "exceljs";
import { strFromU8, unzipSync } from "fflate";
import type { ICellData, IStyleData, IWorkbookData } from "@univerjs/presets";
import { DriveClientError } from "@/lib/drive/errors";
import { decodeSheetSnapshot } from "@/lib/sheets/codec";
import {
  SHEET_BLANK_TEMPLATE_ID, blankSheetContent, defaultSheetName, sheetDocumentInput, sheetTitleFromFileName, univerLocaleOf,
} from "@/lib/sheets/create";
import { importSheetFile } from "@/lib/sheets/import";
import { XLSX_MIME } from "@/lib/sheets/constants";
import { RESOURCE, UNIVER_LOCALE } from "@/lib/sheets/univer-constants";
import * as client from "@/lib/sheets/xlsx/client";
import {
  SpreadsheetReadError, createXlsxWorker, readSpreadsheetFile, spreadsheetKind, spreadsheetReadErrorKey, writeXlsx,
} from "@/lib/sheets/xlsx/client";
import { exportXlsxBytes } from "@/lib/sheets/xlsx/export-workbook";
import en from "@/scripts/i18n/drive/sheets/en.json";
import { disposeHeadlessUniverses } from "./helpers/headless";
import { createHeadlessSheet } from "./helpers/headless-adapter";
import { ExcelJS, featureWorkbook, readFixture, resourceOf, sheetNamed, workbookBytes } from "./helpers/xlsx-fixtures";

afterEach(() => disposeHeadlessUniverses());

type Json = Record<string, unknown>;

function lookupEn(key: string): string {
  let node: unknown = en;
  for (const part of key.split(".")) node = (node as Json)?.[part];
  return typeof node === "string" ? node : key;
}

/** A workbook as comparable data: sheets and links by name, styles inlined, ids and random ids dropped. */
function view(wb: IWorkbookData) {
  const nameOf = new Map(wb.sheetOrder.map((id) => [id, wb.sheets[id].name] as const));
  const styleOf = (s: unknown) => (typeof s === "string" ? (wb.styles[s] as IStyleData) : s ?? undefined);
  const linkName = (url: string) => url.replace(/gid=([^&]+)/, (_m, id: string) => `sheet=${nameOf.get(id)}`);
  const cell = (c: ICellData) => ({
    v: typeof c.v === "number" ? Math.round(c.v * 1e9) / 1e9 : c.v, t: c.t, f: c.f ?? undefined, ft: c.ft ?? undefined,
    ref: c.ref ?? undefined, s: styleOf(c.s), text: c.p?.body?.dataStream,
    runs: c.p?.body?.textRuns?.map((r) => ({ st: r.st, ed: r.ed, ts: r.ts })),
    links: c.p?.body?.customRanges?.map((r) => ({ url: linkName(String(r.properties?.url)), tooltip: r.properties?.tooltip })),
  });
  const perSheet = (name: string, strip: string) => {
    const data = resourceOf(wb, name) ?? {};
    return Object.fromEntries(Object.entries(data).map(([id, value]) => [nameOf.get(id), JSON.parse(JSON.stringify(value), (k, v) => (k === strip ? undefined : v))]));
  };
  return {
    dateSystem: wb.dateSystem,
    sheets: wb.sheetOrder.map((id) => {
      const s = wb.sheets[id];
      const cells: Json = {};
      for (const [r, row] of Object.entries(s.cellData)) for (const [c, data] of Object.entries(row ?? {})) cells[`${r}:${c}`] = cell(data as ICellData);
      const rows = Object.fromEntries(Object.entries(s.rowData).map(([r, d]) => [r, { ...d, s: styleOf(d?.s) }]));
      const cols = Object.fromEntries(Object.entries(s.columnData).map(([c, d]) => [c, { ...d, s: styleOf(d?.s) }]));
      return {
        name: s.name, hidden: s.hidden, tabColor: s.tabColor, freeze: s.freeze, zoomRatio: s.zoomRatio, rightToLeft: s.rightToLeft,
        showGridlines: s.showGridlines, defaultColumnWidth: s.defaultColumnWidth, defaultRowHeight: s.defaultRowHeight,
        rowCount: s.rowCount, columnCount: s.columnCount, merges: s.mergeData, rows, cols, cells,
      };
    }),
    validations: perSheet(RESOURCE.DATA_VALIDATION, "uid"),
    formats: perSheet(RESOURCE.CONDITIONAL_FORMATTING, "cfId"),
    notes: perSheet(RESOURCE.NOTE, "id"),
    filters: perSheet(RESOURCE.FILTER, ""),
    names: Object.values(resourceOf(wb, RESOURCE.DEFINED_NAME) ?? {}).map((n) => ({ ...(n as Json), id: undefined })),
  };
}

describe("import of an ExcelJS-built workbook", () => {
  test("values, types, formulas, rich text, links and notes", async () => {
    const { decoded, lossy } = await readFixture(await workbookBytes(featureWorkbook()));
    const { id, sheet } = sheetNamed(decoded, "Values");
    const at = (r: number, c: number) => sheet.cellData[r]?.[c] as ICellData;
    expect(at(0, 0)).toMatchObject({ v: 42.5, t: 2 });
    expect(at(1, 0)).toMatchObject({ v: "hello", t: 1 });
    expect([at(2, 0).v, at(2, 0).t, at(3, 0).v]).toEqual([1, 3, 0]);
    expect(at(4, 0).v).toBeCloseTo(45306.520833, 5);
    expect(decoded.styles[at(4, 0).s as string]?.n?.pattern).toBe("mm-dd-yy");
    expect(at(5, 0)).toMatchObject({ v: "#N/A", t: 1 });
    expect(at(6, 0).p?.body?.textRuns).toEqual([{ st: 0, ed: 4, ts: { bl: 1, cl: { rgb: "#c00000" } } }, { st: 9, ed: 15, ts: { it: 1 } }]);
    expect(at(7, 0).v).toBe("line one\nline two");
    expect(at(8, 0)).toMatchObject({ v: "007", t: 4 });
    expect(at(9, 0)).toMatchObject({ f: "=SUM(A1,1)", v: 43.5 });
    expect(at(0, 1).f).toBe("=D1*2");
    expect(at(1, 1)).toMatchObject({ f: "=D2*2", v: 4 });
    expect(at(0, 2)).toMatchObject({ f: "=D1:D2*10", ft: 2, ref: "C1:C2" });
    expect(at(1, 2)).toMatchObject({ v: 20 });
    expect(lossy).toEqual(["iconSets", "arrayFormulas"]);
    expect(at(0, 4).p?.body?.customRanges?.[0]?.properties).toEqual({ url: "https://example.com/x", tooltip: "Open site" });
    expect(at(1, 4).p).toBeUndefined();
    expect(at(2, 4).p?.body?.customRanges?.[0]?.properties?.url).toBe(`#gid=${sheetNamed(decoded, "Second Sheet").id}&range=B2`);
    const notes = resourceOf(decoded, RESOURCE.NOTE)?.[id] as Record<string, Record<string, { note: string }>>;
    expect([notes["0"]["5"].note, notes["1"]["5"].note]).toEqual(["A note", "On an empty cell"]);
  });

  test("styles, sizes, sheets and features", async () => {
    const { decoded } = await readFixture(await workbookBytes(featureWorkbook()));
    const { id, sheet } = sheetNamed(decoded, "Values");
    const styleAt = (r: number, c: number) => decoded.styles[sheet.cellData[r]?.[c]?.s as string];
    expect(styleAt(0, 6)).toEqual({ ff: "Arial", fs: 14, bl: 1, it: 1, ul: { s: 1, t: 10 }, st: { s: 1 }, cl: { rgb: "#1f4e79" } });
    expect(styleAt(1, 6)).toEqual({ bg: { rgb: "#ffff00" } });
    expect(styleAt(2, 6)).toEqual({ ht: 2, vt: 2, tb: 3 });
    expect([styleAt(3, 6).tr, styleAt(4, 6).tr, styleAt(5, 6).tr]).toEqual([{ a: 45 }, { a: -30 }, { a: 0, v: 1 }]);
    expect(styleAt(6, 6)).toEqual({ ht: 1, pd: { l: 18 }, td: 2 });
    expect(styleAt(8, 6)).toEqual({ cl: { rgb: "#8eaadc" } });
    expect(styleAt(10, 6).bd).toEqual({ bl_tr: { s: 1, cl: { rgb: "#0000ff" } }, tl_br: { s: 1, cl: { rgb: "#0000ff" } } });
    expect(Array.from({ length: 13 }, (_, r) => styleAt(r, 7).bd?.t?.s)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(sheet.freeze).toEqual({ xSplit: 1, ySplit: 2, startRow: 2, startColumn: 1 });
    expect([sheet.zoomRatio, sheet.showGridlines, sheet.tabColor]).toEqual([1.25, 0, "#ff0000"]);
    expect(sheet.columnData[0]).toEqual({ w: 140 });
    expect(sheet.columnData[1]?.hd).toBe(1);
    expect([sheet.rowData[2], sheet.rowData[11]]).toEqual([{ h: 40, ia: 0 }, { hd: 1 }]);
    expect(sheet.mergeData).toEqual([{ startRow: 0, endRow: 1, startColumn: 8, endColumn: 9 }]);
    expect(decoded.sheetOrder.map((sid) => [decoded.sheets[sid].name, decoded.sheets[sid].hidden])).toEqual([["Values", 0], ["Second Sheet", 1], ["Veiled", 2]]);
    expect(sheetNamed(decoded, "Second Sheet").sheet.rightToLeft).toBe(1);
    expect(resourceOf(decoded, RESOURCE.FILTER)?.[id]).toEqual({ ref: { startRow: 0, endRow: 10, startColumn: 0, endColumn: 3 } });
    const cf = resourceOf(decoded, RESOURCE.CONDITIONAL_FORMATTING)?.[id] as Array<{ rule: Json }>;
    expect(cf.map((c) => c.rule.subType ?? c.rule.type)).toEqual(["number", "formula", "rank", "average", "formula", "timePeriod", "colorScale"]);
    expect(cf[4].rule.value).toBe('=NOT(ISERROR(SEARCH("abc",A1)))');
    const names = Object.values(resourceOf(decoded, RESOURCE.DEFINED_NAME) ?? {}) as Json[];
    expect(names.map((n) => [n.name, n.formulaOrRefString])).toEqual([["Inputs", "Values!$A$1:$A$3"]]);
  });

  test("the 1904 date system survives: serials stay the file's and the workbook says date1904", async () => {
    const wbx = new ExcelJSNode.Workbook();
    wbx.properties.date1904 = true;
    wbx.addWorksheet("D").getCell("A1").value = new Date(Date.UTC(2024, 0, 15));
    const { decoded } = await readFixture(await workbookBytes(wbx));
    expect(decoded.dateSystem).toBe("date1904");
    expect(sheetNamed(decoded, "D").sheet.cellData[0]?.[0]?.v).toBe(43844);
    const { bytes } = await exportXlsxBytes(ExcelJS, decoded);
    const again = await readFixture(bytes);
    expect([again.decoded.dateSystem, sheetNamed(again.decoded, "D").sheet.cellData[0]?.[0]?.v]).toEqual(["date1904", 43844]);
  });
});

describe("round trip through Univer", () => {
  test("import → headless Univer saveForExport → export → import gives the same workbook", async () => {
    const first = await readFixture(await workbookBytes(featureWorkbook()));
    const headless = await createHeadlessSheet({ data: first.decoded });
    const { bytes, lossy } = await exportXlsxBytes(ExcelJS, headless.adapter.saveForExport());
    expect([...lossy]).toEqual([]);
    const second = await readFixture(bytes);
    const before = view(first.decoded);
    expect(Object.keys(before.sheets[0].cells).length).toBeGreaterThan(40);
    expect(Object.keys(before.validations).length + Object.keys(before.formats).length + Object.keys(before.notes).length).toBe(3);
    expect(view(second.decoded)).toEqual(before);
    expect(second.lossy).toEqual(["arrayFormulas"]);
  });

  test("the written file: one <dataValidation> per rule range, conditional formats as cfRules", async () => {
    const first = await readFixture(await workbookBytes(featureWorkbook()));
    const { bytes } = await exportXlsxBytes(ExcelJS, first.decoded);
    const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    const sqrefs = [...xml.matchAll(/<dataValidation [^>]*sqref="([^"]+)"/g)].map((m) => m[1]);
    expect(sqrefs.sort()).toEqual(["K1:K5", "K6", "L1:L3", "M1"]);
    const types = [...xml.matchAll(/<cfRule [^>]*type="([^"]+)"/g)].map((m) => m[1]);
    expect(types).toEqual(["cellIs", "expression", "top10", "aboveAverage", "expression", "timePeriod", "colorScale"]);
  });
});

describe("create and import entry points", () => {
  test("titles, locales, the blank seed and what createDriveDocument receives", () => {
    expect(sheetTitleFromFileName("C:\\reports\\Q3 sales.XLSX")).toBe("Q3 sales");
    expect(sheetTitleFromFileName("data.csv")).toBe("data");
    expect([univerLocaleOf("zh-hk"), univerLocaleOf("hi"), univerLocaleOf("ar")]).toEqual(["zhHK", "enUS", "arSA"]);
    const name = defaultSheetName(lookupEn);
    expect(name).toBe("Sheet1");
    const content = blankSheetContent({ title: "Budget", locale: UNIVER_LOCALE.FR_FR, sheetName: name });
    const wb = decodeSheetSnapshot(content.state);
    expect([wb.name, wb.locale, wb.sheets[wb.sheetOrder[0]].name, content.cellCount]).toEqual(["Budget", "frFR", "Sheet1", 0]);
    const target = { organizationId: "org-1", space: "my" as const, folderId: "f-1", actingMemberId: "m-op", title: "Budget" };
    expect(sheetDocumentInput(content, target, { templateId: SHEET_BLANK_TEMPLATE_ID })).toMatchObject({
      fileType: "sheet", organizationId: "org-1", space: "my", folderId: "f-1", actingMemberId: "m-op", title: "Budget",
      templateId: "sheet:blank", initialState: content.state, html: "", wordCount: 0,
    });
  });

  test("readSpreadsheetFile reads in-thread without a Worker (xlsx and csv) and names its failures", async () => {
    const xlsx = new File([await workbookBytes(featureWorkbook())], "Plan.xlsx");
    const read = await readSpreadsheetFile(xlsx, { locale: UNIVER_LOCALE.EN_US, sheetName: "Sheet1" });
    expect([read.title, read.sheetCount, read.lossy]).toEqual(["Plan", 3, ["iconSets", "arrayFormulas"]]);
    expect(read.plainText.startsWith("Values\n")).toBe(true);
    const csv = await readSpreadsheetFile(new File(["a,=1+1\n2,3\n"], "list.csv"), { locale: UNIVER_LOCALE.EN_US, sheetName: "Sheet1" });
    const wb = decodeSheetSnapshot(csv.state);
    expect([csv.title, wb.sheets[wb.sheetOrder[0]].name, csv.cellCount]).toEqual(["list", "list", 4]);
    const code = async (file: File) => readSpreadsheetFile(file, { locale: "enUS", sheetName: "S" }).then(() => "ok", (e: unknown) => (e instanceof SpreadsheetReadError ? e.code : "other"));
    expect(await code(new File(["x"], "notes.txt"))).toBe("unsupported");
    expect(await code(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.csv"))).toBe("too_large");
    expect(await code(new File(["not a zip"], "fake.xlsx"))).toBe("unsupported");
    expect(await code(new File([], "empty.xlsx"))).toBe("corrupt");
    expect([spreadsheetKind({ name: "a.XLSM" }), spreadsheetKind({ name: "a", type: "text/csv" }), spreadsheetKind({ name: "a.ods" })]).toEqual(["xlsx", "csv", null]);
    expect(spreadsheetReadErrorKey(new SpreadsheetReadError("too_many_cells"))).toBe("sheets.import.tooManyCells");
    expect(spreadsheetReadErrorKey(new Error("x"))).toBe("sheets.import.failed");
    for (const key of ["sheets.import.tooManyCells", "sheets.import.failed", "sheets.import.unsupported", "sheets.import.tooLarge", "sheets.import.encrypted"]) {
      expect(lookupEn(key)).not.toBe(key);
    }
  });

  test("through the real module worker: it posts ready, reads a file and writes one (client.ts with a window)", async () => {
    // client.ts only starts workers in a browser; Bun runs module workers, so a window-like scope is enough.
    const scope = globalThis as { window?: unknown };
    const hadWindow = "window" in scope;
    scope.window = globalThis;
    try {
      const worker = await createXlsxWorker();
      expect(worker).not.toBeNull();
      worker?.terminate();
      const read = await readSpreadsheetFile(new File([await workbookBytes(featureWorkbook())], "Plan.xlsx"), { locale: UNIVER_LOCALE.EN_US, sheetName: "Sheet1" });
      expect([read.title, read.sheetCount, read.lossy]).toEqual(["Plan", 3, ["iconSets", "arrayFormulas"]]);
      const { blob, lossy } = await writeXlsx(decodeSheetSnapshot(read.state));
      expect([blob.type, lossy]).toEqual([XLSX_MIME, []]);
      const again = await readFixture(new Uint8Array(await blob.arrayBuffer()));
      expect(again.decoded.sheetOrder.map((id) => again.decoded.sheets[id].name)).toEqual(["Values", "Second Sheet", "Veiled"]);
    } finally {
      if (!hadWindow) delete scope.window;
    }
  });

  test("importSheetFile reads the file first: an unreadable one never reaches the server, a readable one does", async () => {
    const target = { organizationId: "org-1", space: "store" as const, folderId: "", actingMemberId: "" };
    const bad = await importSheetFile(new File(["x"], "a.txt"), target, { locale: "en" }).catch((e: unknown) => e);
    expect(bad instanceof SpreadsheetReadError && bad.code).toBe("unsupported");
    // No live connection in tests: the create call itself is what fails.
    const good = await importSheetFile(new File(["a,b\n1,2\n"], "a.csv"), target, { locale: "en" }).catch((e: unknown) => e);
    expect(good instanceof DriveClientError && good.code).toBe("not_connected");
  });

  test("a CSV in a legacy encoding is decoded for the app's language first, which importSheetFile passes", async () => {
    // "中文,1" in GBK; Bun has no navigator.languages, so only the given language can pick gb18030.
    const gbk = () => new File([new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0x2c, 0x31, 0x0a])], "gbk.csv");
    const read = await readSpreadsheetFile(gbk(), { locale: UNIVER_LOCALE.ZH_CN, sheetName: "Sheet1", languages: ["zh-cn"] });
    expect(read.plainText).toContain("中文");
    const spy = spyOn(client, "readSpreadsheetFile");
    try {
      const target = { organizationId: "org-1", space: "store" as const, folderId: "", actingMemberId: "" };
      await importSheetFile(gbk(), target, { locale: "zh-cn" }).catch(() => null);
      expect(spy.mock.calls[0]?.[1].languages).toEqual(["zh-cn"]);
    } finally {
      spy.mockRestore();
    }
  });

  test("too_large names the file's size only: a file under the limit with too much content reads as too many cells", async () => {
    // 9 MiB of incompressible text passes the 10 MiB CSV limit, then encodes past the 6 MiB snapshot cap.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+-./:;<>?@[]^_{|}~";
    const random = new Uint8Array(9 * 1024 * 1024);
    for (let at = 0; at < random.length; at += 65_536) crypto.getRandomValues(random.subarray(at, at + 65_536));
    const csv = random.map((b, i) => (i % 64 === 63 ? (i % 6_400 === 6_399 ? 0x0a : 0x2c) : alphabet.charCodeAt(b % alphabet.length)));
    const code = await readFixture(csv, { kind: "csv" }).then(() => "ok", (e: unknown) => (e instanceof SpreadsheetReadError ? e.code : String(e)));
    expect(code).toBe("too_many_cells");
    expect(spreadsheetReadErrorKey(new SpreadsheetReadError("too_large"))).toBe("sheets.import.tooLarge");
  });
});
