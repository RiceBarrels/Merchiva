// The .xlsx prescan (sheets.md §11.2): an uploaded file is untrusted, so ExcelJS never reads it directly.
// fflate's streaming Unzip walks the local file headers and inflates only the parts ExcelJS or the importer
// read, counting the bytes actually produced (never the sizes the zip claims) and every <c> / <row> start of
// the worksheets; a cap trips the moment it is passed. What ExcelJS then gets is a new zip, rebuilt from
// exactly those counted bytes: a crafted central directory (overlapping entries, lying sizes) cannot reach
// it. Each worksheet also loses the blocks ExcelJS expands cell by cell or cannot read safely (merges, data
// validation, hyperlinks, drawings, tables…) and gets its <cols> rebuilt, clamped to the grid; the importer
// reads those blocks itself (import-features.ts, import-workbook.ts), and the workbook's <definedNames> the
// same way. The workbook's <sheets> is rebuilt with names and ids ExcelJS always accepts (rebuildSheets). A
// cap on the file's content (inflated bytes, parts, sheets) is too_many_cells: too_large is the file's own
// size. No DOM globals.

import { Unzip, UnzipInflate, zipSync, type Zippable } from "fflate";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { EXCEL_MAX_COLUMNS } from "./a1";
import {
  loadSheetName, partText, readLegacyComments, readRels, rebuildColumns, rebuildSheets, worksheetColumnExtent, type RelMap,
} from "./import-features";
import { lossyFromPrescan } from "./lossy";
import { SpreadsheetReadError } from "./types";

export interface PrescanLimits {
  /** Σ bytes actually inflated (SHEET_IMPORT_MAX_INFLATED_BYTES). */
  maxInflatedBytes: number;
  /** Σ <c> elements over every worksheet, and Σ <row> elements. */
  maxCells: number;
}

/** A worksheet as the workbook lists it, with the blocks the importer reads itself. */
export interface PrescanSheet {
  /** The file's own name (links and defined names use it). */
  name: string;
  /** The name ExcelJS was given for this sheet (loadSheetName of its index). */
  loadName: string;
  path: string;
  /** Raw XML of each block taken out of the sheet (absent when the sheet has none). */
  blocks: Partial<Record<SheetBlock, string>>;
  /** The sheet's relationships by id (hyperlink targets). */
  rels: RelMap;
}

export interface PrescanResult {
  /** The zip ExcelJS reads. */
  bytes: Uint8Array;
  sheets: PrescanSheet[];
  /** Raw XML of the workbook's <definedNames>, "" when it has none. */
  definedNames: string;
  /** Legacy comments (notes) by worksheet part → A1 → text, including notes on empty cells. */
  comments: Map<string, Map<string, string>>;
  cellCount: number;
  lossy: Set<SheetLossyItem>;
}

/** Worksheet blocks taken out of what ExcelJS reads; the first three are read by the importer. */
export type SheetBlock = "mergeCells" | "dataValidations" | "hyperlinks";
const READ_BLOCKS: ReadonlySet<string> = new Set<SheetBlock>(["mergeCells", "dataValidations", "hyperlinks"]);
const DROP_BLOCKS: ReadonlySet<string> = new Set([
  "drawing", "legacyDrawing", "legacyDrawingHF", "picture", "tableParts", "oleObjects", "controls",
]);
/** Tag names whose presence is a lossy marker (lossy.ts LOSSY_XML_MARKERS), and extra ones found here. */
const MARKER_TAGS: ReadonlyMap<string, string> = new Map([
  ["sheetProtection", "<sheetProtection"], ["workbookProtection", "<workbookProtection"],
  ["x14:sparklineGroups", "x14:sparklineGroups"], ["xdr:pic", "<xdr:pic>"], ["xdr:sp", "<xdr:sp>"],
]);
const EXTRA_LOSSY_TAGS: ReadonlyMap<string, SheetLossyItem> = new Map([
  ["filterColumn", "filterCriteria"], ["x14:dataValidations", "unsupportedValidation"],
]);

const WORKBOOK = "xl/workbook.xml";
const WORKBOOK_RELS = "xl/_rels/workbook.xml.rels";
const WORKSHEET_RE = /^xl\/worksheets\/sheet\d+\.xml$/;
const SHEET_RELS_RE = /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/;
const COMMENTS_RE = /^xl\/[^/]*comments[^/]*\.xml$/i;
const DRAWING_RE = /^xl\/drawings\/drawing\d+\.xml$/;
/** Parts ExcelJS reads (xlsx.js load), besides the worksheets. */
const EXCELJS_PARTS: ReadonlySet<string> = new Set([WORKBOOK, WORKBOOK_RELS, "xl/sharedStrings.xml", "xl/styles.xml"]);
const MAX_PARTS = 100_000;
const MAX_SHEETS = 500;
const MAX_BLOCKS_PER_PART = 64;
const INFLATE_SLICE = 16 * 1024;
const YIELD_EVERY_MS = 40;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

type PartKind = "exceljs" | "sheet" | "read" | "scan";

function classify(name: string): PartKind | null {
  if (WORKSHEET_RE.test(name)) return "sheet";
  if (EXCELJS_PARTS.has(name)) return "exceljs";
  if (SHEET_RELS_RE.test(name) || COMMENTS_RE.test(name)) return "read";
  return DRAWING_RE.test(name) ? "scan" : null;
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

/** A stream name as a compound file's directory stores it (UTF-16LE). */
function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) out[i * 2] = text.charCodeAt(i);
  return out;
}

/** An OLE compound file (legacy .xls, or an encrypted .xlsx): encrypted when it holds the encryption streams. */
function sniffCompoundFile(bytes: Uint8Array): never {
  if (indexOfBytes(bytes, utf16le("EncryptionInfo"), 0) !== -1 || indexOfBytes(bytes, utf16le("EncryptedPackage"), 0) !== -1) {
    throw new SpreadsheetReadError("encrypted");
  }
  throw new SpreadsheetReadError("unsupported", "Legacy .xls files are not supported");
}

// ── Tag scanner ──────────────────────────────────────────────────────────────────────────────────

const LOOKAHEAD = 40;
const DELIMS: ReadonlySet<number> = new Set([0x20, 0x09, 0x0a, 0x0d, 0x3e, 0x2f]); // space tab LF CR > /

interface ScanCounts {
  cells: number;
  rows: number;
}

/**
 * Finds element starts across chunk boundaries: counts <c> and <row>, and reports every other tag name with
 * its offset in the part. A '<' within LOOKAHEAD bytes of a chunk end waits for the next chunk.
 */
class TagScanner {
  private tail = new Uint8Array(0);
  private offset = 0;

  constructor(private readonly counts: ScanCounts | null, private readonly onTag: (name: string, at: number) => void) {}

  push(chunk: Uint8Array, final: boolean): void {
    const buf = this.tail.length > 0 ? concat([this.tail, chunk]) : chunk;
    const base = this.offset - this.tail.length;
    const limit = final ? buf.length : buf.length - LOOKAHEAD;
    let i = buf.indexOf(0x3c);
    while (i !== -1 && i < limit) {
      this.tagAt(buf, i, base + i);
      i = buf.indexOf(0x3c, i + 1);
    }
    const keepFrom = final ? buf.length : Math.max(i === -1 ? buf.length : i, buf.length - LOOKAHEAD);
    this.tail = buf.slice(Math.max(0, keepFrom));
    this.offset += chunk.length;
  }

  private tagAt(buf: Uint8Array, i: number, at: number): void {
    const b1 = buf[i + 1];
    if (b1 === 0x2f || b1 === 0x3f || b1 === 0x21) return; // </  <?  <!
    if (b1 === 0x76 && buf[i + 2] === 0x3e) return; // <v>
    if (this.counts && b1 === 0x63 && DELIMS.has(buf[i + 2])) {
      this.counts.cells++;
      return;
    }
    if (this.counts && b1 === 0x72 && buf[i + 2] === 0x6f && buf[i + 3] === 0x77 && DELIMS.has(buf[i + 4])) {
      this.counts.rows++;
      return;
    }
    let name = "";
    for (let j = i + 1; j < buf.length && j <= i + LOOKAHEAD && !DELIMS.has(buf[j]); j++) name += String.fromCharCode(buf[j]);
    if (name !== "") this.onTag(name, at);
  }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ── Streaming inflate ────────────────────────────────────────────────────────────────────────────

interface InflatedPart {
  name: string;
  kind: PartKind;
  chunks: Uint8Array[];
  done: boolean;
  /** Offsets of the blocks to take out (worksheets only). */
  blocks: Array<{ name: string; at: number }>;
}

interface StreamState {
  inflated: number;
  counts: ScanCounts;
  markers: Set<string>;
  lossy: Set<SheetLossyItem>;
  failure: SpreadsheetReadError | null;
}

async function inflateParts(bytes: Uint8Array, limits: PrescanLimits): Promise<{ parts: Map<string, InflatedPart>; names: string[]; state: StreamState }> {
  const state: StreamState = { inflated: 0, counts: { cells: 0, rows: 0 }, markers: new Set(), lossy: new Set(), failure: null };
  const parts = new Map<string, InflatedPart>();
  const names: string[] = [];
  const fail = (code: "too_many_cells" | "corrupt", message?: string) => {
    state.failure ??= new SpreadsheetReadError(code, message);
  };
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (names.length >= MAX_PARTS) return fail("too_many_cells", "Too many parts");
    const name = file.name.replace(/^\/+/, "");
    names.push(name);
    const kind = classify(name);
    if (!kind) return; // never started: fflate keeps only its compressed bytes
    const part: InflatedPart = { name, kind, chunks: [], done: false, blocks: [] };
    const sheet = kind === "sheet";
    const scanner = sheet || kind === "scan" || name === WORKBOOK
      ? new TagScanner(sheet ? state.counts : null, (tag, at) => {
        const marker = MARKER_TAGS.get(tag);
        if (marker) state.markers.add(marker);
        const extra = EXTRA_LOSSY_TAGS.get(tag);
        if (extra) state.lossy.add(extra);
        const block = (sheet && (READ_BLOCKS.has(tag) || DROP_BLOCKS.has(tag) || tag === "cols"))
          || (name === WORKBOOK && (tag === "definedNames" || tag === "sheets"));
        // Each block appears once in a real file; a flood of them would make cutting quadratic.
        if (block && part.blocks.push({ name: tag, at }) > MAX_BLOCKS_PER_PART) fail("corrupt");
      })
      : null;
    parts.set(name, part);
    file.ondata = (err, data, final) => {
      if (state.failure) return;
      if (err) return fail("corrupt");
      state.inflated += data.length;
      if (state.inflated > limits.maxInflatedBytes) return fail("too_many_cells", "Too much content");
      scanner?.push(data, final);
      if (state.counts.cells > limits.maxCells || state.counts.rows > limits.maxCells) return fail("too_many_cells");
      if (kind !== "scan") part.chunks.push(data);
      if (final) part.done = true;
    };
    try {
      file.start();
    } catch {
      fail("corrupt");
    }
  };
  let lastYield = Date.now();
  for (let at = 0; at < bytes.length; at += INFLATE_SLICE) {
    const end = Math.min(bytes.length, at + INFLATE_SLICE);
    try {
      unzip.push(bytes.subarray(at, end), end === bytes.length);
    } catch {
      fail("corrupt");
    }
    if (state.failure) throw state.failure;
    if (Date.now() - lastYield > YIELD_EVERY_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYield = Date.now();
    }
  }
  return { parts, names, state };
}

// ── Worksheet and workbook surgery ───────────────────────────────────────────────────────────────

const ASCII = new TextEncoder();
const UTF8 = new TextDecoder("utf-8");

function indexOfBytes(buf: Uint8Array, needle: Uint8Array, from: number): number {
  let i = buf.indexOf(needle[0], from);
  while (i !== -1 && i + needle.length <= buf.length) {
    let j = 1;
    while (j < needle.length && buf[i + j] === needle[j]) j++;
    if (j === needle.length) return i;
    i = buf.indexOf(needle[0], i + 1);
  }
  return -1;
}

/** The end of the element starting at `at`: after its "/>", or after its closing tag. */
function blockEnd(buf: Uint8Array, at: number, name: string): number {
  let quote = 0;
  for (let i = at + 1; i < buf.length; i++) {
    const b = buf[i];
    if (quote) {
      if (b === quote) quote = 0;
    } else if (b === 0x22 || b === 0x27) {
      quote = b;
    } else if (b === 0x3e) {
      if (buf[i - 1] === 0x2f) return i + 1;
      const close = indexOfBytes(buf, ASCII.encode(`</${name}>`), i + 1);
      return close === -1 ? buf.length : close + name.length + 3;
    }
  }
  return buf.length;
}

/**
 * Takes the listed blocks out of a part (clamping <cols> and rebuilding <sheets> instead, whose <sheet>
 * attributes go to `sheetList`); returns the new bytes and the blocks read.
 */
function cutBlocks(
  buf: Uint8Array,
  blocks: ReadonlyArray<{ name: string; at: number }>,
  sheetList: Array<Record<string, string>>,
): { bytes: Uint8Array; read: Record<string, string> } {
  const read: Record<string, string> = {};
  const pieces: Uint8Array[] = [];
  let pos = 0;
  for (const block of [...blocks].sort((a, b) => a.at - b.at)) {
    if (block.at < pos) continue;
    const end = blockEnd(buf, block.at, block.name);
    pieces.push(buf.subarray(pos, block.at));
    const text = () => UTF8.decode(buf.subarray(block.at, end));
    if (block.name === "cols") pieces.push(ASCII.encode(rebuildColumns(text())));
    else if (block.name === "sheets") pieces.push(ASCII.encode(rebuildSheets(text(), sheetList)));
    else if (READ_BLOCKS.has(block.name) || block.name === "definedNames") read[block.name] = (read[block.name] ?? "") + text();
    pos = end;
  }
  pieces.push(buf.subarray(pos));
  return { bytes: pieces.length === 1 ? pieces[0] : concat(pieces), read };
}

/**
 * Every <sheet> of the workbook in tab order (a defined name's localSheetId indexes this list), with the part
 * each one is, resolved as ExcelJS resolves it ("" when it has none).
 */
function listSheets(sheetList: ReadonlyArray<Record<string, string>>, rels: RelMap): Array<{ name: string; path: string }> {
  return sheetList.map((attrs) => {
    const rel = rels.get(attrs["r:id"] ?? "");
    return { name: attrs.name ?? "", path: rel ? `xl/${rel.target.replace(/^(\s|\/xl\/)+/, "")}` : "" };
  });
}

// ── Entry point ──────────────────────────────────────────────────────────────────────────────────

/** Streams, caps and filters an .xlsx (§11.2). Rejects with SpreadsheetReadError. */
export async function prescanXlsx(bytes: Uint8Array, limits: PrescanLimits): Promise<PrescanResult> {
  if (startsWith(bytes, CFB_MAGIC)) sniffCompoundFile(bytes);
  if (!startsWith(bytes, ZIP_MAGIC)) throw new SpreadsheetReadError("unsupported", "Not a zip container");
  const { parts, names, state } = await inflateParts(bytes, limits);
  const files = new Map<string, Uint8Array>();
  const blocksByPart = new Map<string, Record<string, string>>();
  const sheetAttrs: Array<Record<string, string>> = [];
  for (const part of parts.values()) {
    if (part.kind === "scan") continue;
    if (!part.done) throw new SpreadsheetReadError("corrupt", `Truncated part ${part.name}`);
    let data = concat(part.chunks);
    part.chunks = [];
    if (part.blocks.length > 0) {
      const cut = cutBlocks(data, part.blocks, sheetAttrs);
      data = cut.bytes;
      blocksByPart.set(part.name, cut.read);
    }
    files.set(part.name, data);
  }
  if (!files.get(WORKBOOK)?.length) throw new SpreadsheetReadError("corrupt", "No workbook part");
  const sheetList = listSheets(sheetAttrs, readRels(partText(files, WORKBOOK_RELS)));
  // ExcelJS builds one worksheet per <sheet>: many sheets naming one part would each re-read it.
  if (sheetList.length > MAX_SHEETS) throw new SpreadsheetReadError("too_many_cells", "Too many sheets");
  const paths = sheetList.map((sheet) => sheet.path).filter(Boolean);
  if (new Set(paths).size !== paths.length) throw new SpreadsheetReadError("corrupt", "Two sheets share a part");
  // ExcelJS makes an object per column up to each sheet's widest, so columns count like cells (only a workbook
  // with many sheets can pass the cap: a sheet is at most 16,384 wide).
  if (paths.length * EXCEL_MAX_COLUMNS > limits.maxCells) {
    let columns = 0;
    for (const path of paths) {
      const part = files.get(path);
      if (part && classify(path) === "sheet") columns += worksheetColumnExtent(part);
      if (columns > limits.maxCells) throw new SpreadsheetReadError("too_many_cells", "Too many columns");
    }
  }
  const sheets: PrescanSheet[] = sheetList.map(({ name, path }, index) => ({
    name,
    loadName: loadSheetName(index),
    path,
    blocks: (blocksByPart.get(path) ?? {}) as Partial<Record<SheetBlock, string>>,
    rels: readRels(partText(files, path.replace(/([^/]+)$/, "_rels/$1.rels"))),
  }));
  const comments = readLegacyComments(files, sheetList);
  const zippable: Zippable = {};
  for (const [name, data] of files) {
    const kind = classify(name);
    if (kind === "exceljs" || kind === "sheet") zippable[name] = [data, { level: 0 }];
  }
  files.clear();
  const lossy = lossyFromPrescan({ partNames: names, markers: state.markers, dataValidationStripped: false });
  for (const item of state.lossy) lossy.add(item);
  return {
    bytes: zipSync(zippable, { level: 0 }),
    sheets,
    definedNames: blocksByPart.get(WORKBOOK)?.definedNames ?? "",
    comments,
    cellCount: state.counts.cells,
    lossy,
  };
}
