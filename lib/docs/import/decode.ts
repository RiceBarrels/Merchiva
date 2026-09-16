/**
 * Byte → text decoding for `.txt`, `.md` and `.html` imports (docs-editor-ui spec §6.4). `File.text()` always decodes
 * UTF-8, which turns legacy files (GBK/Big5 notes, Notepad "Unicode" UTF-16, Word "Save as Web Page" in
 * windows-1252) into mojibake. Order, following the WHATWG sniffing rules where they apply:
 *
 * 1. A byte order mark (UTF-8, UTF-16LE, UTF-16BE) wins.
 * 2. HTML only: `<meta charset>` / `http-equiv` charset (or an XML declaration) in the first bytes.
 * 3. BOM-less UTF-16 (text files only), recognised by its NUL byte pattern.
 * 4. Strict UTF-8.
 * 5. Legacy encodings for the user's languages (strict), then windows-1252, which never fails.
 *
 * Pure (TextDecoder only), so it runs under Bun tests. Labels a runtime doesn't support are skipped.
 */

export type TextImportKind = "txt" | "md" | "html";

export interface DecodeImportTextOptions {
  /** BCP 47 language tags, most preferred first. Defaults to `navigator.languages` in the browser. */
  languages?: readonly string[];
}

const SNIFF_BYTES = 4096;
const FALLBACK_ENCODING = "windows-1252";

function tryDecoder(label: string, fatal: boolean): TextDecoder | null {
  try {
    return new TextDecoder(label, { fatal });
  } catch {
    return null;
  }
}

function decodeStrict(bytes: Uint8Array, label: string): string | null {
  const decoder = tryDecoder(label, true);
  if (!decoder) return null;
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

function decodeLoose(bytes: Uint8Array, label: string): string | null {
  const decoder = tryDecoder(label, false);
  return decoder ? decoder.decode(bytes) : null;
}

function bomEncoding(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return null;
}

/** ASCII view of the first bytes (every byte maps to one char), for charset declarations. */
function asciiHead(bytes: Uint8Array): string {
  const end = Math.min(bytes.length, SNIFF_BYTES);
  let out = "";
  for (let i = 0; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** The encoding an HTML document declares (`<meta charset>`, `http-equiv`, or `<?xml encoding?>`), normalised. */
export function sniffHtmlCharset(bytes: Uint8Array): string | null {
  const head = asciiHead(bytes);
  const match =
    /<meta\b[^>]*?\bcharset\s*=\s*["']?\s*([A-Za-z0-9._:\-]+)/i.exec(head) ??
    /<\?xml\b[^>]*?\bencoding\s*=\s*["']\s*([A-Za-z0-9._:\-]+)/i.exec(head);
  if (!match) return null;
  const decoder = tryDecoder(match[1], false);
  if (!decoder) return null;
  // An ASCII-compatible declaration can't really be UTF-16 (HTML spec: treat it as UTF-8).
  if (decoder.encoding === "utf-16le" || decoder.encoding === "utf-16be") return "utf-8";
  return decoder.encoding;
}

/** BOM-less UTF-16: mostly-ASCII text has a NUL in every other byte. */
export function sniffUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const length = Math.min(bytes.length, SNIFF_BYTES) & ~1;
  if (length < 4) return null;
  let evenNul = 0;
  let oddNul = 0;
  for (let i = 0; i < length; i += 2) {
    if (bytes[i] === 0) evenNul++;
    if (bytes[i + 1] === 0) oddNul++;
  }
  const pairs = length / 2;
  if (oddNul / pairs > 0.3 && evenNul / pairs < 0.05) return "utf-16le";
  if (evenNul / pairs > 0.3 && oddNul / pairs < 0.05) return "utf-16be";
  return null;
}

const LEGACY_BY_LANGUAGE: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/^zh-(tw|hk|mo|hant)\b/, ["big5", "gb18030"]],
  [/^zh\b/, ["gb18030", "big5"]],
  [/^ja\b/, ["shift_jis", "euc-jp"]],
  [/^ko\b/, ["euc-kr"]],
  [/^(ar|fa|ur)\b/, ["windows-1256"]],
  [/^(he|iw|yi)\b/, ["windows-1255"]],
  [/^(ru|uk|be|bg|sr|mk|kk)\b/, ["windows-1251"]],
  [/^el\b/, ["windows-1253"]],
  [/^(tr|az)\b/, ["windows-1254"]],
  [/^th\b/, ["windows-874"]],
  [/^vi\b/, ["windows-1258"]],
  [/^(pl|cs|sk|hu|ro|hr|sl|bs|sq)\b/, ["windows-1250"]],
  [/^(lt|lv|et)\b/, ["windows-1257"]],
];

/** Legacy encodings to try, in order, for the given languages. Always ends with windows-1252. */
export function legacyEncodingsFor(languages: readonly string[]): string[] {
  const out: string[] = [];
  for (const language of languages) {
    const tag = language.trim().toLowerCase().replace(/_/g, "-");
    for (const [pattern, encodings] of LEGACY_BY_LANGUAGE) {
      if (!pattern.test(tag)) continue;
      for (const encoding of encodings) if (!out.includes(encoding)) out.push(encoding);
      break;
    }
  }
  if (!out.includes(FALLBACK_ENCODING)) out.push(FALLBACK_ENCODING);
  return out;
}

function defaultLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  const list = Array.isArray(navigator.languages) ? navigator.languages : [];
  return list.length > 0 ? list : navigator.language ? [navigator.language] : [];
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/** Decodes an imported text/Markdown/HTML file. The result never starts with a BOM. */
export function decodeImportText(input: ArrayBuffer | Uint8Array, kind: TextImportKind, options: DecodeImportTextOptions = {}): string {
  const bytes = toBytes(input);
  if (bytes.length === 0) return "";

  const bom = bomEncoding(bytes);
  if (bom) return decodeLoose(bytes, bom) ?? "";

  if (kind === "html") {
    const declared = sniffHtmlCharset(bytes);
    if (declared) {
      const text = decodeLoose(bytes, declared);
      if (text !== null) return text;
    }
  } else {
    const utf16 = sniffUtf16(bytes);
    if (utf16) {
      const text = decodeLoose(bytes, utf16);
      if (text !== null) return text;
    }
  }

  const utf8 = decodeStrict(bytes, "utf-8");
  if (utf8 !== null) return utf8;

  const candidates = legacyEncodingsFor(options.languages ?? defaultLanguages());
  for (const label of candidates) {
    if (label === FALLBACK_ENCODING) continue;
    const text = decodeStrict(bytes, label);
    if (text !== null) return text;
  }
  return decodeLoose(bytes, FALLBACK_ENCODING) ?? decodeLoose(bytes, "utf-8") ?? "";
}
