// Fixtures for the xlsx / csv suites (sheets.md §15, SH4): the Node ExcelJS build as the mappers' module,
// hand-made .xlsx packages (for the parts ExcelJS cannot write: legacy notes on empty cells, internal-link
// hyperlinks, lossy markers), raw zip surgery for hostile archives (sizes that lie, a central directory whose
// entries overlap), an OLE "encrypted package", and the read pipeline as the worker runs it.

import * as ExcelJSNode from "exceljs";
import { deflateSync, strToU8, zipSync, type Zippable } from "fflate";
import type { IWorkbookData } from "@univerjs/presets";
import { decodeSheetSnapshot } from "@/lib/sheets/codec";
import { UNIVER_LOCALE } from "@/lib/sheets/univer-constants";
import { readSpreadsheetBytes, type SpreadsheetFileKind } from "@/lib/sheets/xlsx/protocol";
import type { ExcelJSModule } from "@/lib/sheets/xlsx/types";

/** The Node build, typed as the module the mappers take (the worker passes the bare browser build). */
export const ExcelJS = ExcelJSNode as unknown as ExcelJSModule;

export interface ReadOptions {
  fileName?: string;
  kind?: SpreadsheetFileKind;
  maxCells?: number;
  sheetName?: string;
}

/** readSpreadsheetBytes as the worker calls it; also decodes the encoded state back into a workbook. */
export async function readFixture(bytes: Uint8Array, opts: ReadOptions = {}) {
  const kind = opts.kind ?? "xlsx";
  const result = await readSpreadsheetBytes(ExcelJS, bytes, {
    fileName: opts.fileName ?? (kind === "csv" ? "Fixture.csv" : "Fixture.xlsx"),
    kind,
    locale: UNIVER_LOCALE.EN_US,
    sheetName: opts.sheetName ?? "Sheet1",
    maxCells: opts.maxCells ?? 2_000_000,
    languages: ["en-US"],
  });
  return { ...result, decoded: decodeSheetSnapshot(result.state) };
}

/** ExcelJS `writeBuffer` as bytes. */
export async function workbookBytes(wbx: ExcelJSNode.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await wbx.xlsx.writeBuffer());
}

/** The first sheet of a workbook, and its id. */
export function firstSheet(wb: IWorkbookData) {
  const id = wb.sheetOrder[0];
  return { id, sheet: wb.sheets[id] };
}

/** The sheet named `name`. */
export function sheetNamed(wb: IWorkbookData, name: string) {
  const id = wb.sheetOrder.find((sid) => wb.sheets[sid].name === name);
  if (!id) throw new Error(`No sheet ${name}`);
  return { id, sheet: wb.sheets[id] };
}

/** A workbook resource's parsed JSON (undefined when absent). */
export function resourceOf(wb: IWorkbookData, name: string): Record<string, unknown> | undefined {
  const entry = (wb.resources ?? []).find((r) => r.name === name);
  return entry ? (JSON.parse(entry.data) as Record<string, unknown>) : undefined;
}

// ── Hand-made packages ───────────────────────────────────────────────────────────────────────────

const XMLNS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface HandSheet {
  name: string;
  /** Everything inside <worksheet> (sheetData included). */
  body: string;
  /** Relationships of the sheet: [id, type (last path segment), target, external?]. */
  rels?: Array<[string, string, string, boolean?]>;
  state?: "hidden" | "veryHidden";
}

/** A minimal but valid .xlsx: the given sheets, optional workbook XML extras and extra parts. */
export function handXlsx(sheets: HandSheet[], opts: { workbookExtra?: string; parts?: Record<string, string | Uint8Array> } = {}): Uint8Array {
  const files: Zippable = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>'),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><styleSheet ${XMLNS}><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`),
  };
  const sheetEls = sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ""} r:id="rId${i + 1}"/>`).join("");
  files["xl/workbook.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook ${XMLNS}><sheets>${sheetEls}</sheets>${opts.workbookExtra ?? ""}</workbook>`);
  files["xl/_rels/workbook.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdS" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><worksheet ${XMLNS}>${s.body}</worksheet>`);
    if (s.rels) {
      const rels = s.rels.map(([id, type, target, external]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"${external ? ' TargetMode="External"' : ""}/>`).join("");
      files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
    }
  });
  for (const [name, data] of Object.entries(opts.parts ?? {})) files[name] = typeof data === "string" ? strToU8(data) : data;
  return zipSync(files);
}

/** An inline-string cell `<c r t="inlineStr">`. */
export function inlineCell(ref: string, text: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
}

// ── Raw zip surgery ──────────────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface RawEntry {
  name: string;
  data: Uint8Array;
  /** Uncompressed size written into the headers (the truth by default). */
  claimedSize?: number;
}

function localRecord(name: Uint8Array, payload: Uint8Array, method: 0 | 8, crc: number, size: number): Uint8Array {
  const out = new Uint8Array(30 + name.length + payload.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(8, method, true);
  v.setUint32(14, crc, true);
  v.setUint32(18, payload.length, true);
  v.setUint32(22, size, true);
  v.setUint16(26, name.length, true);
  out.set(name, 30);
  out.set(payload, 30 + name.length);
  return out;
}

function centralRecord(name: Uint8Array, method: 0 | 8, crc: number, packed: number, size: number, offset: number): Uint8Array {
  const out = new Uint8Array(46 + name.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x02014b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(6, 20, true);
  v.setUint16(10, method, true);
  v.setUint32(16, crc, true);
  v.setUint32(20, packed, true);
  v.setUint32(24, size, true);
  v.setUint16(28, name.length, true);
  v.setUint32(42, offset, true);
  out.set(name, 46);
  return out;
}

function joinZip(locals: Uint8Array[], central: Uint8Array[]): Uint8Array {
  const localSize = locals.reduce((n, r) => n + r.length, 0);
  const cdSize = central.reduce((n, r) => n + r.length, 0);
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, central.length, true);
  v.setUint16(10, central.length, true);
  v.setUint32(12, cdSize, true);
  v.setUint32(16, localSize, true);
  const out = new Uint8Array(localSize + cdSize + 22);
  let at = 0;
  for (const part of [...locals, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A deflate zip written by hand, its headers claiming `claimedSize` when given. */
export function rawZip(entries: RawEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = strToU8(entry.name);
    const packed = deflateSync(entry.data);
    const crc = crc32(entry.data);
    const size = entry.claimedSize ?? entry.data.length;
    const local = localRecord(name, packed, 8, crc, size);
    central.push(centralRecord(name, 8, crc, packed.length, size, offset));
    locals.push(local);
    offset += local.length;
  }
  return joinZip(locals, central);
}

/**
 * A parser differential: `hidden` is a complete entry smuggled inside the stored data of a padding entry. A
 * reader walking the local headers (the prescan) skips it with the padding; a reader following the central
 * directory (JSZip, which ExcelJS uses) finds it.
 */
export function smuggledZip(visible: RawEntry[], hidden: RawEntry): Uint8Array {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of visible) {
    const name = strToU8(entry.name);
    const packed = deflateSync(entry.data);
    const local = localRecord(name, packed, 8, crc32(entry.data), entry.data.length);
    central.push(centralRecord(name, 8, crc32(entry.data), packed.length, entry.data.length, offset));
    locals.push(local);
    offset += local.length;
  }
  const hiddenName = strToU8(hidden.name);
  const hiddenPacked = deflateSync(hidden.data);
  const inner = localRecord(hiddenName, hiddenPacked, 8, crc32(hidden.data), hidden.data.length);
  const padName = strToU8("xl/media/pad.bin");
  const pad = localRecord(padName, inner, 0, crc32(inner), inner.length);
  central.push(centralRecord(padName, 0, crc32(inner), inner.length, inner.length, offset));
  central.push(centralRecord(hiddenName, 8, crc32(hidden.data), hiddenPacked.length, hidden.data.length, offset + 30 + padName.length));
  locals.push(pad);
  return joinZip(locals, central);
}

/** An OLE compound file header followed by the UTF-16LE stream names of an encrypted OOXML package. */
export function encryptedPackage(): Uint8Array {
  const magic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const utf16 = (s: string) => {
    const out = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) out[i * 2] = s.charCodeAt(i);
    return out;
  };
  const body = [utf16("EncryptionInfo"), utf16("EncryptedPackage")];
  const out = new Uint8Array(512 + body[0].length + body[1].length);
  out.set(magic, 0);
  out.set(body[0], 512);
  out.set(body[1], 512 + body[0].length);
  return out;
}

// ── The feature workbook of the round-trip suite ─────────────────────────────────────────────────

const BORDER_FAMILIES = [
  "thin", "hair", "dotted", "dashed", "dashDot", "dashDotDot", "double", "medium", "mediumDashed", "mediumDashDot",
  "mediumDashDotDot", "slantDashDot", "thick",
] as const;

/** One workbook with every feature the importer maps (sheets.md §15 xlsx-roundtrip). */
export function featureWorkbook(): ExcelJSNode.Workbook {
  const wbx = new ExcelJSNode.Workbook();
  const ws = wbx.addWorksheet("Values", {
    properties: { tabColor: { argb: "FFFF0000" } },
    views: [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: false, zoomScale: 125 }],
  });
  ws.getCell("A1").value = 42.5;
  ws.getCell("A2").value = "hello";
  ws.getCell("A3").value = true;
  ws.getCell("A4").value = false;
  ws.getCell("A5").value = new Date(Date.UTC(2024, 0, 15, 12, 30));
  ws.getCell("A6").value = { error: "#N/A" };
  ws.getCell("A7").value = { richText: [{ text: "Bold", font: { bold: true, color: { argb: "FFC00000" } } }, { text: " and " }, { text: "italic", font: { italic: true } }] };
  ws.getCell("A8").value = "line one\nline two";
  ws.getCell("A8").alignment = { wrapText: true };
  ws.getCell("A9").value = "007";
  ws.getCell("A9").numFmt = "@";
  ws.getCell("A10").value = { formula: "SUM(A1,1)", result: 43.5 };
  ws.getCell("A11").value = { formula: "A2&\"!\"", result: "hello!" };
  ws.getCell("D1").value = 1;
  ws.getCell("D2").value = 2;
  ws.getCell("B1").value = { formula: "D1*2", result: 2, shareType: "shared", ref: "B1:B2" } as ExcelJSNode.CellValue;
  ws.getCell("B2").value = { sharedFormula: "B1", result: 4 } as ExcelJSNode.CellValue;
  ws.getCell("C1").value = { formula: "D1:D2*10", result: 10, shareType: "array", ref: "C1:C2" } as ExcelJSNode.CellValue;
  ws.getCell("C2").value = 20;
  ws.getCell("E1").value = { text: "site", hyperlink: "https://example.com/x", tooltip: "Open site" };
  ws.getCell("E2").value = { text: "evil", hyperlink: "javascript:alert(1)" };
  ws.getCell("E3").value = { text: "jump", hyperlink: "#'Second Sheet'!B2" };
  ws.getCell("F1").value = "noted";
  ws.getCell("F1").note = "A note";
  ws.getCell("F2").note = "On an empty cell";
  ws.getCell("G1").value = "font";
  ws.getCell("G1").font = { name: "Arial", size: 14, bold: true, italic: true, underline: "double", strike: true, color: { argb: "FF1F4E79" } };
  ws.getCell("G2").value = "fill";
  ws.getCell("G2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  ws.getCell("G3").value = "align";
  ws.getCell("G3").alignment = { horizontal: "center", vertical: "middle", wrapText: true, indent: 0 };
  ws.getCell("G4").value = "rotated";
  ws.getCell("G4").alignment = { textRotation: 45, horizontal: "right", vertical: "top" };
  ws.getCell("G5").value = "down";
  ws.getCell("G5").alignment = { textRotation: -30 };
  ws.getCell("G6").value = "vertical";
  ws.getCell("G6").alignment = { textRotation: "vertical" };
  ws.getCell("G7").value = "indent";
  ws.getCell("G7").alignment = { indent: 2, horizontal: "left", readingOrder: "rtl" };
  ws.getCell("G8").value = 0.256;
  ws.getCell("G8").numFmt = "0.00%";
  ws.getCell("G9").value = "theme";
  ws.getCell("G9").font = { color: { theme: 4, tint: 0.3999755851924192 } as ExcelJSNode.Color };
  ws.getCell("G10").value = "sup";
  ws.getCell("G10").font = { vertAlign: "superscript", size: 9 };
  ws.getCell("G11").value = "diag";
  ws.getCell("G11").border = { diagonal: { up: true, down: true, style: "thin", color: { argb: "FF0000FF" } } };
  ws.getCell("G12").value = "shrink";
  ws.getCell("G12").alignment = { shrinkToFit: true };
  BORDER_FAMILIES.forEach((style, i) => {
    const cell = ws.getCell(i + 1, 8);
    cell.value = style;
    cell.border = { top: { style, color: { argb: "FF00B050" } }, left: { style }, bottom: { style }, right: { style } };
  });
  ws.mergeCells("I1:J2");
  ws.getCell("I1").value = "merged";
  ws.getColumn(1).width = 20;
  ws.getColumn(2).hidden = true;
  ws.getRow(3).height = 30;
  ws.getRow(12).hidden = true;
  ws.getCell("A12").value = "hidden row";
  ws.dataValidations.add("K1:K5", { type: "list", allowBlank: true, formulae: ['"Yes,No,Maybe"'] });
  ws.dataValidations.add("K6", { type: "whole", operator: "between", allowBlank: false, showErrorMessage: true, errorStyle: "warning", error: "1 to 10", formulae: [1, 10] });
  ws.dataValidations.add("L1:L3", { type: "custom", formulae: ["LEN(L1)<5"] });
  ws.dataValidations.add("M1", { type: "decimal", operator: "greaterThan", formulae: [0.5], showInputMessage: true, prompt: "More than half" });
  const red = { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" } } } as Partial<ExcelJSNode.Style>;
  const rules: ExcelJSNode.ConditionalFormattingRule[] = [
    { type: "cellIs", operator: "greaterThan", formulae: [10], style: red, priority: 1 } as ExcelJSNode.ConditionalFormattingRule,
    { type: "expression", formulae: ["MOD(ROW(),2)=0"], style: red, priority: 2 },
    { type: "top10", rank: 3, percent: true, bottom: true, style: red, priority: 3 } as ExcelJSNode.ConditionalFormattingRule,
    { type: "aboveAverage", aboveAverage: false, style: red, priority: 4 } as ExcelJSNode.ConditionalFormattingRule,
    { type: "containsText", operator: "containsText", text: "abc", style: red, priority: 5 } as ExcelJSNode.ConditionalFormattingRule,
    { type: "timePeriod", timePeriod: "lastWeek", style: red, priority: 6 } as ExcelJSNode.ConditionalFormattingRule,
    { type: "colorScale", cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }], color: [{ argb: "FFF8696B" }, { argb: "FFFFEB84" }, { argb: "FF63BE7B" }], priority: 7 } as ExcelJSNode.ConditionalFormattingRule,
    { type: "iconSet", iconSet: "3TrafficLights", cfvo: [{ type: "percent", value: 0 }, { type: "percent", value: 33 }, { type: "percent", value: 67 }], priority: 8 } as ExcelJSNode.ConditionalFormattingRule,
  ];
  ws.addConditionalFormatting({ ref: "A1:A20", rules });
  ws.autoFilter = "A1:D11";
  wbx.definedNames.add("Values!$A$1:$A$3", "Inputs");
  const second = wbx.addWorksheet("Second Sheet", { state: "hidden", views: [{ rightToLeft: true }] });
  second.getCell("B2").value = "target";
  const veiled = wbx.addWorksheet("Veiled", { state: "veryHidden" });
  veiled.getCell("A1").value = 1;
  return wbx;
}
