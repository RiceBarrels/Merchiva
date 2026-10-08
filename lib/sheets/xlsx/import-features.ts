// Worksheet features → Univer (sheets.md §11.3.4), the small XML reader they and the prescan share (workers
// have no DOMParser), and what the prescan hands ExcelJS (rebuilt <cols> and <sheets>, the columns it will
// make). Data validation and hyperlinks are read from the raw XML the prescan took out of the file (ExcelJS
// mangles validation bounds that are formulas, and drops in-workbook links and tooltips); merges, defined
// names, notes and the filter range are read in import-workbook.ts (conditional formats: import-styles).
// Everything is untrusted and capped; a rule Univer cannot express is skipped, and reported where §11.8 has
// an item for it.

import type { ISheetDataValidationRule } from "@univerjs/presets";
import type { SheetLossyItem } from "@/lib/sheets/types";
import { DV_ERROR_STYLE, DV_OPERATOR, DV_TYPE } from "@/lib/sheets/univer-constants";
import { clampRange, EXCEL_MAX_COLUMNS, parseA1Range, parseSqref } from "./a1";
import { stripFormulaPrefixes } from "./formula-prefix";
import { cellKey, randomId, type SheetCellLink } from "./import-cells";

/** Validation rules and ranges per sheet, ranges per rule; past them the rest is reported as dataValidationLimit. */
const [DV_MAX_RULES, DV_MAX_TOTAL_RANGES, DV_MAX_RANGES, DV_TEXT_MAX] = [10_000, 50_000, 1_000, 1_000];
/** Cells one sheet's hyperlinks may cover. */
const LINK_MAX_CELLS = 100_000;
const UTF8 = new TextDecoder("utf-8");
/** Bytes that end a tag name: space, tab, LF, CR, ">" and "/". */
const TAG_END: ReadonlySet<number> = new Set([0x20, 0x09, 0x0a, 0x0d, 0x3e, 0x2f]);
/** Linear on any input (fraction digits only after a dot): a <formula1> body is uncapped. */
const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

// ── Minimal XML reading ─────────────────────────────────────────────────────────────────

const ENTITY_RE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#(\d{1,7})|(lt|gt|amp|quot|apos));/g;
const NAMED_ENTITIES: Readonly<Record<string, string>> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const OOXML_ESCAPE_RE = /_x([0-9A-Fa-f]{4})_/g;
const ATTR_RE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function codePoint(n: number): string {
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "\ufffd";
}

/** XML entities (the five named ones and character references) → text. */
export function xmlUnescape(text: string): string {
  return text.replace(ENTITY_RE, (_m, hex: string | undefined, dec: string | undefined, name: string | undefined) =>
    name ? NAMED_ENTITIES[name] : codePoint(hex ? parseInt(hex, 16) : Number(dec)));
}

/** Element text: entities, then OOXML's `_xHHHH_` escapes (`_x005F_` is a literal underscore). */
export function xmlText(text: string): string {
  return xmlUnescape(text).replace(OOXML_ESCAPE_RE, (_m, hex: string) => codePoint(parseInt(hex, 16)));
}

/** The attributes of a start tag's text (unescaped), in an object without a prototype. */
export function xmlAttributes(text: string): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  for (const m of text.matchAll(ATTR_RE)) out[m[1]] = xmlUnescape(m[2] ?? m[3] ?? "");
  return out;
}

/** Every `<name …>` element of `xml` in order: its attributes and raw inner XML (null when self-closing). */
export function* xmlElements(xml: string, name: string): Generator<{ attrs: Record<string, string>; body: string | null }> {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const open = new RegExp(`<${escaped}((?:\\s+[^\\s=/>]+\\s*=\\s*(?:"[^"]*"|'[^']*'))*)\\s*(/?)>`, "g");
  const close = `</${name}>`;
  for (let m = open.exec(xml); m !== null; m = open.exec(xml)) {
    const attrs = xmlAttributes(m[1]);
    if (m[2] === "/") {
      yield { attrs, body: null };
      continue;
    }
    const end = xml.indexOf(close, open.lastIndex);
    yield { attrs, body: xml.slice(open.lastIndex, end === -1 ? xml.length : end) };
    if (end === -1) return;
    open.lastIndex = end + close.length;
  }
}

/** A relationship target resolved against the part that owns the relationships ("/x" is absolute). */
export function resolvePartTarget(source: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const path = source.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") path.pop();
    else if (segment !== "." && segment !== "") path.push(segment);
  }
  return path.join("/");
}

export type RelMap = Map<string, { target: string; external: boolean; type: string }>;

/** A relationships part by id. */
export function readRels(xml: string | null): RelMap {
  const rels: RelMap = new Map();
  if (!xml) return rels;
  for (const el of xmlElements(xml, "Relationship")) {
    const { Id, Target, TargetMode, Type } = el.attrs;
    if (Id && Target !== undefined) rels.set(Id, { target: Target, external: TargetMode === "External", type: Type ?? "" });
  }
  return rels;
}

/** A part's text, or null when the package lacks it. */
export function partText(parts: ReadonlyMap<string, Uint8Array>, name: string): string | null {
  const bytes = parts.get(name);
  return bytes ? new TextDecoder("utf-8").decode(bytes) : null;
}

/** `xml` without its `<name>…</name>` elements (an unclosed one runs to the end), in one pass. */
function withoutElements(xml: string, name: string): string {
  let out = "";
  let pos = 0;
  for (let at = xml.indexOf(`<${name}`, pos); at !== -1; at = xml.indexOf(`<${name}`, pos)) {
    out += xml.slice(pos, at);
    const close = xml.indexOf(`</${name}>`, at);
    if (close === -1) return out;
    pos = close + name.length + 3;
  }
  return out + xml.slice(pos);
}

/**
 * Notes of every sheet (`<comment ref>` text, runs joined, phonetic runs left out) by worksheet part → A1
 * (a part, unlike a name, is never shared by two sheets). ExcelJS only attaches a note to a cell that exists;
 * this keeps the notes on empty cells too.
 */
export function readLegacyComments(
  files: ReadonlyMap<string, Uint8Array>,
  sheets: ReadonlyArray<{ name: string; path: string }>,
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const sheet of sheets) {
    const relsPath = sheet.path.replace(/([^/]+)$/, "_rels/$1.rels");
    for (const rel of readRels(partText(files, relsPath)).values()) {
      if (rel.external || !rel.type.endsWith("/comments")) continue;
      const xml = partText(files, resolvePartTarget(sheet.path, rel.target));
      if (!xml) continue;
      const notes = out.get(sheet.path) ?? new Map<string, string>();
      for (const el of xmlElements(xml, "comment")) {
        const ref = el.attrs.ref;
        const body = withoutElements(el.body ?? "", "rPh");
        const text = [...xmlElements(body, "t")].map((t) => xmlText(t.body ?? "")).join("");
        if (ref && text !== "" && !notes.has(ref)) notes.set(ref, text);
      }
      if (notes.size > 0) out.set(sheet.path, notes);
    }
  }
  return out;
}

// ── What ExcelJS reads, and the columns it makes ─────────────────────────────────────────────────

/** A non-negative number attribute as ExcelJS parses it, or null. */
function numberAttr(attrs: Record<string, string>, name: string, parse: (v: string) => number): number | null {
  const value = attrs[name];
  if (value === undefined) return null;
  const n = parse(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * A <cols> block rebuilt from a strict read of its <col> elements: min/max clamped to the grid (ExcelJS makes
 * one object per column up to the largest `max`), width at most 255 characters, only the attributes ExcelJS
 * reads. Whatever the original held (odd quoting, entities, junk), what ExcelJS parses is well-formed.
 */
export function rebuildColumns(xml: string): string {
  const cols: string[] = [];
  for (const el of xmlElements(xml, "col")) {
    const a = el.attrs;
    const min = numberAttr(a, "min", (v) => parseInt(v, 10));
    const max = numberAttr(a, "max", (v) => parseInt(v, 10));
    if (min === null || max === null || min > EXCEL_MAX_COLUMNS) continue;
    let tag = `<col min="${Math.max(1, min)}" max="${Math.max(1, Math.min(EXCEL_MAX_COLUMNS, max))}"`;
    const width = numberAttr(a, "width", parseFloat);
    if (width !== null) tag += ` width="${Math.min(255, width)}"`;
    const style = numberAttr(a, "style", (v) => parseInt(v, 10));
    if (style !== null) tag += ` style="${style}"`;
    for (const flag of ["hidden", "customWidth", "bestFit", "collapsed"]) if (a[flag] === "1" || a[flag] === "true") tag += ` ${flag}="1"`;
    const outline = numberAttr(a, "outlineLevel", (v) => parseInt(v, 10));
    if (outline !== null) tag += ` outlineLevel="${Math.min(7, outline)}"`;
    cols.push(`${tag}/>`);
  }
  return cols.length > 0 ? `<cols>${cols.join("")}</cols>` : "";
}

/** The name ExcelJS is given for the sheet at `index` of the workbook's <sheet> list. */
export function loadSheetName(index: number): string {
  return `s${index + 1}`;
}

/**
 * A <sheets> block rebuilt for ExcelJS: one <sheet> per original, in order (their attributes are collected
 * into `list`), named loadSheetName(i) with sheetId i + 1, keeping only the state and relationship. ExcelJS
 * refuses a name over 31 characters (it truncates it, then finds the copy a duplicate), "History" and a
 * duplicate, and keeps its worksheets in an array indexed by sheetId: 4000000000 stalls it, 0 or a repeated
 * id loses a sheet. The file's own names stay in `list` for the importer.
 */
export function rebuildSheets(xml: string, list: Array<Record<string, string>>): string {
  let out = "<sheets>";
  for (const el of xmlElements(xml, "sheet")) {
    const index = list.push(el.attrs) - 1;
    const { state, "r:id": rid } = el.attrs;
    out += `<sheet name="${loadSheetName(index)}" sheetId="${index + 1}"`;
    if (state === "hidden" || state === "veryHidden") out += ` state="${state}"`;
    if (rid !== undefined) out += ` r:id="${rid.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")}"`;
    out += "/>";
  }
  return `${out}</sheets>`;
}

/** The column ExcelJS reads from a cell reference (colCache.decodeAddress): capitals before the row, "$" skipped. */
function refColumn(ref: string): number {
  let column = 0;
  let hasRow = false;
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i);
    if (!hasRow && code >= 65 && code <= 90) column = Math.min(EXCEL_MAX_COLUMNS, column * 26 + code - 64);
    else if (code >= 48 && code <= 57) hasRow = true;
    else if (hasRow && column > 0 && code !== 36) break;
  }
  return column;
}

/** XML whitespace: space, tab, LF, CR. */
function isXmlSpace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

/** Bytes that end an attribute name: whitespace, "=", ">", "/", "<" and the quotes. */
function endsAttributeName(byte: number): boolean {
  return isXmlSpace(byte) || byte === 0x3d || byte === 0x3e || byte === 0x2f || byte === 0x3c || byte === 0x22 || byte === 0x27;
}

/**
 * The value (unescaped) of attribute `name` in the start tag at `at` of `buf`, the last one winning as in
 * xmlAttributes; undefined when the tag has none, or is not well-formed. One pass over the tag and nothing past it:
 * a "<" ends the read even inside quotes (no well-formed start tag holds one, and ExcelJS refuses a file that does),
 * so a part flooded with unterminated tags costs its bytes once, never once per tag.
 */
function attributeAt(buf: Uint8Array, at: number, name: string): string | undefined {
  let i = at + 1;
  while (i < buf.length && !TAG_END.has(buf[i]) && buf[i] !== 0x3c) i++; // the element name
  let value: string | undefined;
  for (;;) {
    while (i < buf.length && isXmlSpace(buf[i])) i++;
    if (i >= buf.length || buf[i] === 0x3c) return undefined;
    if (buf[i] === 0x3e) return value;
    if (buf[i] === 0x2f) return buf[i + 1] === 0x3e ? value : undefined;
    const nameAt = i;
    while (i < buf.length && !endsAttributeName(buf[i])) i++;
    const nameEnd = i;
    if (nameEnd === nameAt) return undefined; // a quote where a name belongs
    while (i < buf.length && isXmlSpace(buf[i])) i++;
    if (buf[i] !== 0x3d) return undefined;
    i++;
    while (i < buf.length && isXmlSpace(buf[i])) i++;
    const quote = buf[i];
    if (quote !== 0x22 && quote !== 0x27) return undefined;
    const valueAt = ++i;
    while (i < buf.length && buf[i] !== quote && buf[i] !== 0x3c) i++;
    if (i >= buf.length || buf[i] === 0x3c) return undefined;
    if (nameEnd - nameAt === name.length && [...name].every((ch, k) => buf[nameAt + k] === ch.charCodeAt(0))) {
      value = xmlUnescape(UTF8.decode(buf.subarray(valueAt, i)));
    }
    i++;
  }
}

/** The r of the <c> at `at`: read in place when it comes first as r="…" with no entity (as writers put it). */
function cellRefAt(buf: Uint8Array, at: number): string | undefined {
  if (buf[at + 2] === 0x20 && buf[at + 3] === 0x72 && buf[at + 4] === 0x3d && buf[at + 5] === 0x22) {
    let ref = "";
    for (let i = at + 6; i < buf.length && i < at + 40 && buf[i] !== 0x26; i++) {
      if (buf[i] === 0x22) return ref;
      ref += String.fromCharCode(buf[i]);
    }
  }
  return attributeAt(buf, at, "r");
}

/**
 * The columns ExcelJS makes for a worksheet part: an object per column up to the widest its <col max> or a cell
 * reaches (a <c> without r takes the next column of its row). 500 sheets each holding one cell in column XFD
 * would make 8 million of them, gigabytes, from a file of 155 KB.
 */
export function worksheetColumnExtent(buf: Uint8Array): number {
  let widest = 0;
  let column = 0;
  for (let i = buf.indexOf(0x3c); i !== -1; i = buf.indexOf(0x3c, i + 1)) {
    if (buf[i + 1] === 0x72 && buf[i + 2] === 0x6f && buf[i + 3] === 0x77 && TAG_END.has(buf[i + 4])) {
      column = 0; // <row
    } else if (buf[i + 1] === 0x63 && TAG_END.has(buf[i + 2])) {
      const ref = cellRefAt(buf, i);
      column = ref ? refColumn(ref) : column > 0 ? Math.min(EXCEL_MAX_COLUMNS, column + 1) : 0;
      widest = Math.max(widest, column);
    } else if (buf[i + 1] === 0x63 && buf[i + 2] === 0x6f && buf[i + 3] === 0x6c && TAG_END.has(buf[i + 4])) {
      widest = Math.max(widest, Math.min(EXCEL_MAX_COLUMNS, parseInt(attributeAt(buf, i, "max") ?? "", 10) || 0));
    }
  }
  return widest;
}

const DV_TYPES: Readonly<Record<string, ISheetDataValidationRule["type"]>> = {
  list: DV_TYPE.LIST, whole: DV_TYPE.WHOLE, decimal: DV_TYPE.DECIMAL, date: DV_TYPE.DATE, time: DV_TYPE.TIME,
  textLength: DV_TYPE.TEXT_LENGTH, custom: DV_TYPE.CUSTOM,
};
const DV_OPERATORS: ReadonlySet<string> = new Set(Object.values(DV_OPERATOR));

/** A formula operand as Univer keeps it: a number as text, anything else a formula ("=…", no `_xlfn.`). */
function operandFormula(raw: string | undefined): string | undefined {
  const value = raw?.trim().replace(/^=/, "") ?? "";
  if (value === "") return undefined;
  if (NUMBER_RE.test(value)) return Number.isFinite(Number(value)) ? String(Number(value)) : undefined;
  return `=${stripFormulaPrefixes(value)}`;
}

/** A list source: a literal "a,b,c" becomes Univer's JSON option list, a range or formula stays a formula. */
function listFormula(raw: string | undefined): string | undefined {
  const value = raw?.trim() ?? "";
  if (value === "") return undefined;
  if (!value.startsWith('"')) return `=${stripFormulaPrefixes(value.replace(/^=/, ""))}`;
  const items = value.replace(/^"|"$/g, "").replace(/""/g, '"').split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? JSON.stringify(items) : undefined;
}

/** The text of the first `<name>` element of `xml`, or undefined. */
function elementText(xml: string, name: string): string | undefined {
  const body = [...xmlElements(xml, name)][0]?.body;
  return typeof body === "string" ? xmlText(body) : undefined;
}

function dvText(value: string | undefined): string | undefined {
  return value ? value.slice(0, DV_TEXT_MAX) : undefined;
}

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

/** A sheet's <dataValidations> as Univer rules. */
export function readValidations(xml: string | undefined, lossy: Set<SheetLossyItem>): ISheetDataValidationRule[] {
  const out: ISheetDataValidationRule[] = [];
  if (!xml) return out;
  let rangeBudget = DV_MAX_TOTAL_RANGES;
  for (const el of xmlElements(xml, "dataValidation")) {
    const a = el.attrs;
    const excelType = a.type ?? "none";
    if (excelType === "none") continue; // "any value": an input message only, which Univer shows for no rule
    const type = Object.hasOwn(DV_TYPES, excelType) ? DV_TYPES[excelType] : undefined;
    if (!type) {
      lossy.add("unsupportedValidation");
      continue;
    }
    if (out.length >= DV_MAX_RULES || rangeBudget <= 0) {
      lossy.add("dataValidationLimit");
      break;
    }
    const all = parseSqref((a.sqref ?? "").slice(0, DV_MAX_RANGES * 24));
    const keep = Math.min(DV_MAX_RANGES, rangeBudget);
    if (all.length > keep) lossy.add("dataValidationLimit");
    const ranges = all.slice(0, keep);
    rangeBudget -= ranges.length;
    const body = el.body ?? "";
    const f1 = elementText(body, "formula1");
    const formula1 = excelType === "list" ? listFormula(f1) : operandFormula(f1);
    const formula2 = operandFormula(elementText(body, "formula2"));
    if (ranges.length === 0 || formula1 === undefined) continue;
    const rule: ISheetDataValidationRule = { uid: randomId(), type, ranges, formula1, allowBlank: truthy(a.allowBlank) };
    if (type !== DV_TYPE.LIST && type !== DV_TYPE.CUSTOM) {
      const operator = a.operator && DV_OPERATORS.has(a.operator) ? a.operator : DV_OPERATOR.BETWEEN;
      rule.operator = operator as ISheetDataValidationRule["operator"];
      if (operator === DV_OPERATOR.BETWEEN || operator === DV_OPERATOR.NOT_BETWEEN) {
        if (formula2 === undefined) continue;
        rule.formula2 = formula2;
      }
    }
    if (truthy(a.showErrorMessage)) {
      rule.showErrorMessage = true;
      rule.errorStyle = a.errorStyle === "warning" ? DV_ERROR_STYLE.WARNING : a.errorStyle === "information" ? DV_ERROR_STYLE.INFO : DV_ERROR_STYLE.STOP;
    } else {
      rule.showErrorMessage = false;
    }
    if (truthy(a.showInputMessage)) rule.showInputMessage = true;
    const texts = { error: dvText(a.error), errorTitle: dvText(a.errorTitle), prompt: dvText(a.prompt), promptTitle: dvText(a.promptTitle) };
    for (const [key, value] of Object.entries(texts)) if (value) rule[key as keyof typeof texts] = value;
    out.push(rule);
  }
  return out;
}

// ── Hyperlinks ───────────────────────────────────────────────────────────────────────────────────

/**
 * A sheet's <hyperlinks> by cell: an external target (its relationship), a location in the workbook, or a
 * target with a location appended. `sanitize` (sanitizeImportedLink) decides what survives.
 */
export function readHyperlinks(
  xml: string | undefined,
  rels: ReadonlyMap<string, { target: string; external: boolean }>,
  sanitize: (href: string) => string | null,
): Map<string, SheetCellLink> {
  const links = new Map<string, SheetCellLink>();
  if (!xml) return links;
  let budget = LINK_MAX_CELLS;
  for (const el of xmlElements(xml, "hyperlink")) {
    if (budget <= 0) break;
    const range = clampRange(parseA1Range(el.attrs.ref ?? ""));
    if (!range) continue;
    const target = rels.get(el.attrs["r:id"] ?? "")?.target ?? "";
    const location = (el.attrs.location ?? "").replace(/^#/, "");
    const href = target === "" ? (location ? `#${location}` : "") : location && !target.includes("#") ? `${target}#${location}` : target;
    const url = href === "" ? null : sanitize(href);
    if (url === null) continue;
    const link: SheetCellLink = { url, tooltip: (el.attrs.tooltip ?? "").slice(0, 255) };
    for (let r = range.startRow; r <= range.endRow && budget > 0; r++) {
      for (let c = range.startColumn; c <= range.endColumn && budget > 0; c++, budget--) {
        const key = cellKey(r, c);
        if (!links.has(key)) links.set(key, link);
      }
    }
  }
  return links;
}
