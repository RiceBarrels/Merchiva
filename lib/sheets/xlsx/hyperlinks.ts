// Cell hyperlinks between Excel and Univer (sheets.md §11.1, §12.1). An imported file is untrusted: its
// links may be javascript:, file:, UNC or relative paths, so only http(s)/mailto URLs and links to a sheet,
// range or defined name of the same workbook survive (the rest becomes plain text). Univer writes in-workbook
// links as "#gid=<sheetId>&range=A1" and "#rangeid=<definedNameId>"; Excel as "#'Sheet name'!A1" and
// "#Name". Whatever these functions return also passes isSafeSheetLink, the rule every op and load applies.

import { isSafeSheetLink } from "@/lib/sheets/sanitize";
import { parseA1Range, quoteSheetName, splitSheetRef, toA1Range } from "./a1";

/** Excel's limit on a hyperlink address. */
export const SHEET_LINK_MAX_CHARS = 2079;

const SAFE_URL_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "mailto:"]);
/** C0/C1 controls: a link holding one is refused whole, never cleaned up. */
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

function lookup(map: ReadonlyMap<string, string>, key: string): string | undefined {
  const exact = map.get(key);
  if (exact !== undefined) return exact;
  const lower = key.toLowerCase();
  for (const [name, value] of map) if (name.toLowerCase() === lower) return value;
  return undefined;
}

function gidLink(sheetId: string, range?: string): string {
  const gid = `#gid=${encodeURIComponent(sheetId)}`;
  return range ? `${gid}&range=${range}` : gid;
}

/**
 * An Excel in-workbook location ("#'Sheet 2'!A1", "Sheet2!$B$2:$C$3", "#Name") → a Univer link, or null when
 * its sheet or name does not exist in this workbook or its cell reference is malformed. Sheet and name
 * lookups are case-insensitive, as in Excel.
 */
export function internalLinkToUniver(
  location: string,
  sheetIdByName: ReadonlyMap<string, string>,
  definedNameIdByName?: ReadonlyMap<string, string>,
): string | null {
  const value = location.trim().replace(/^#/, "");
  if (value === "") return null;
  const { sheetName, ref } = splitSheetRef(value);
  if (sheetName === null) {
    const nameId = definedNameIdByName ? lookup(definedNameIdByName, value) : undefined;
    if (nameId !== undefined) return `#rangeid=${encodeURIComponent(nameId)}`;
    const sheetId = lookup(sheetIdByName, value.replace(/^'(.*)'$/s, "$1").replace(/''/g, "'"));
    return sheetId !== undefined ? gidLink(sheetId) : null;
  }
  const sheetId = lookup(sheetIdByName, sheetName);
  if (sheetId === undefined) return null;
  if (ref.trim() === "") return gidLink(sheetId);
  const range = parseA1Range(ref);
  return range ? gidLink(sheetId, toA1Range(range)) : null;
}

/**
 * The link an imported cell may keep, in Univer form, or null (the cell keeps its text only): an
 * http:, https: or mailto: URL (trimmed, no control characters, at most SHEET_LINK_MAX_CHARS), or a
 * location inside this workbook.
 */
export function sanitizeImportedLink(
  href: string,
  sheetIdByName: ReadonlyMap<string, string>,
  definedNameIdByName?: ReadonlyMap<string, string>,
): string | null {
  if (typeof href !== "string") return null;
  const value = href.trim();
  if (value === "" || value.length > SHEET_LINK_MAX_CHARS || CONTROL_RE.test(value)) return null;
  let link: string | null;
  if (value.startsWith("#")) {
    link = internalLinkToUniver(value, sheetIdByName, definedNameIdByName);
  } else {
    let protocol: string | null = null;
    try {
      protocol = new URL(value).protocol;
    } catch {
      protocol = null;
    }
    // No scheme at all: only a "Sheet!A1" location naming a sheet of this workbook is kept.
    if (protocol === null) link = value.includes("!") ? internalLinkToUniver(value, sheetIdByName, definedNameIdByName) : null;
    else link = SAFE_URL_PROTOCOLS.has(protocol) ? value : null;
  }
  return link !== null && isSafeSheetLink(link) ? link : null;
}

/**
 * A Univer link → the hyperlink ExcelJS writes: in-workbook links become "#'Sheet name'!A1" (a missing or
 * broken range → A1 of the sheet) or "#Name"; external links pass through when safe. null when the link
 * cannot be written (unknown sheet or name, unsafe or over-long URL): the cell is then exported as text.
 */
export function univerLinkToExcel(
  url: string,
  sheetNameById: ReadonlyMap<string, string>,
  definedNameById?: ReadonlyMap<string, string>,
): string | null {
  if (typeof url !== "string") return null;
  const value = url.trim();
  if (value === "" || value.length > SHEET_LINK_MAX_CHARS || !isSafeSheetLink(value)) return null;
  if (!value.startsWith("#")) return CONTROL_RE.test(value) ? null : value;
  const params = new URLSearchParams(value.slice(1));
  const nameId = params.get("rangeid");
  if (nameId) {
    const name = definedNameById?.get(nameId);
    return name ? `#${name}` : null;
  }
  const sheetId = params.get("gid");
  const sheetName = sheetId ? sheetNameById.get(sheetId) : undefined;
  if (sheetName === undefined) return null;
  const range = parseA1Range(params.get("range") ?? "");
  return `#${quoteSheetName(sheetName)}!${range ? toA1Range(range) : "A1"}`;
}
