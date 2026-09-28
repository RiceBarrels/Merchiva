/**
 * The .docx container: a zip read entry by entry through `fflate`'s streaming inflater, under a budget.
 *
 * The whole package is inflated up front because the reader jumps between parts — document, styles, numbering,
 * theme, settings, several headers and footers, and every `word/media/*` entry — and the import caps files at 20 MB.
 *
 * The file is not always the user's own: Drive's "Open as Doc" hands over any file the person can open, a
 * colleague's upload included, on a manager's browser or the shared store tablet. A 20 MB zip can claim, or really
 * hold, about 20 GB, so nothing is inflated past `DOCX_ZIP_LIMITS`: the central directory is checked first (entry
 * count, declared total, compression ratio), then every entry is streamed and may not inflate past the size it
 * declared, so the declared total bounds both memory and time. A package over a limit throws `DocxZipError`, which
 * the importer reports as `DocImportError("failed")`. The directory is read the way the .pptx zip guard reads it
 * (lib/slides/import/zip-directory.ts). Inflation yields to the event loop every few MB, so a large honest package
 * does not freeze the page.
 *
 * Paths are matched case-insensitively with any leading slash removed: the OPC spec is case-sensitive, but
 * producers other than Word are careless and a missing `word/styles.xml` costs the document all of its formatting.
 */
import { readZipDirectory, streamZipEntry, type ZipEntryInfo } from "@/lib/slides/import/zip-directory";

export interface DocxZipLimits {
  /** Entries in the package, directories included. */
  readonly maxEntries: number;
  /** Σ bytes the entries declare, and so Σ bytes inflated. */
  readonly maxInflatedBytes: number;
  /** An entry declaring more than `ratioMinBytes` may not declare more than `maxRatio`× its compressed size. */
  readonly maxRatio: number;
  readonly ratioMinBytes: number;
}

/** The inflated cap matches the .xlsx import's (SHEET_IMPORT_MAX_INFLATED_BYTES); the ratio rule the .pptx guard's. */
export const DOCX_ZIP_LIMITS: DocxZipLimits = Object.freeze({
  maxEntries: 5_000,
  maxInflatedBytes: 200 * 1024 * 1024,
  maxRatio: 100,
  ratioMinBytes: 8 * 1024 * 1024,
});

export type DocxZipErrorCode = "notZip" | "tooManyEntries" | "tooLarge" | "suspiciousRatio" | "corrupt";

/** A package this reader refuses; `code` says why. */
export class DocxZipError extends Error {
  readonly code: DocxZipErrorCode;

  constructor(code: DocxZipErrorCode) {
    super(`The .docx package was refused (${code})`);
    this.name = "DocxZipError";
    this.code = code;
  }
}

export interface DocxZip {
  /** Entry names as stored, for diagnostics and `word/media` scans. */
  readonly paths: readonly string[];
  has(path: string): boolean;
  /** Raw bytes, narrowed to a plain `ArrayBuffer` backing store so they can go straight into a `Blob`. */
  bytes(path: string): Uint8Array<ArrayBuffer> | null;
  /** UTF-8 text of an entry, or null when it isn't there. */
  text(path: string): string | null;
}

const decoder = new TextDecoder("utf-8");

/** Output between two yields to the event loop. */
const YIELD_EVERY_BYTES = 16 * 1024 * 1024;

function normalize(path: string): string {
  return path.replace(/^\/+/, "").replace(/\\/g, "/").toLowerCase();
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Stored or deflated, and not encrypted: anything else has no readable bytes. */
function readable(entry: ZipEntryInfo): boolean {
  return (entry.flags & 1) === 0 && (entry.method === 0 || entry.method === 8);
}

/** The central directory only: nothing is inflated for a package that declares too much. */
function checkDirectory(entries: readonly ZipEntryInfo[], limits: DocxZipLimits): void {
  let declared = 0;
  for (const entry of entries) {
    if (!readable(entry)) throw new DocxZipError("notZip");
    declared += entry.originalSize;
    if (entry.originalSize > limits.ratioMinBytes && entry.originalSize / Math.max(1, entry.compressedSize) > limits.maxRatio) {
      throw new DocxZipError("suspiciousRatio");
    }
  }
  if (declared > limits.maxInflatedBytes) throw new DocxZipError("tooLarge");
}

/** One entry's bytes, into a buffer of its declared size; producing more than that refuses the package. */
function inflateEntry(bytes: Uint8Array, entry: ZipEntryInfo): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(entry.originalSize);
  let produced = 0;
  let overran = false;
  const result = streamZipEntry(bytes, entry, (chunk) => {
    if (produced + chunk.length > out.length) {
      overran = true;
      return false;
    }
    out.set(chunk, produced);
    produced += chunk.length;
    return true;
  });
  if (overran) throw new DocxZipError("suspiciousRatio");
  if (result === "corrupt") throw new DocxZipError("corrupt");
  return produced === out.length ? out : out.subarray(0, produced);
}

/**
 * Inflates the package within `limits`. This is the only step allowed to throw out of `docxToHtml`: a file that
 * isn't a readable zip, or one over the limits, isn't a document this reader opens, and there is nothing to degrade to.
 */
export async function openDocxZip(buffer: ArrayBuffer, limits: DocxZipLimits = DOCX_ZIP_LIMITS): Promise<DocxZip> {
  const bytes = new Uint8Array(buffer);
  const directory = readZipDirectory(bytes, limits.maxEntries);
  if (directory === "notZip" || directory === "tooManyEntries") throw new DocxZipError(directory);
  checkDirectory(directory.entries, limits);

  // A name stored twice keeps its first position and its last bytes.
  const entries = new Map<string, Uint8Array<ArrayBuffer>>();
  let sinceYield = 0;
  for (const entry of directory.entries) {
    // Directory entries are empty and would shadow nothing useful.
    if (entry.name.endsWith("/")) continue;
    const data = inflateEntry(bytes, entry);
    entries.set(entry.name, data);
    sinceYield += data.length;
    if (sinceYield >= YIELD_EVERY_BYTES) {
      sinceYield = 0;
      await yieldToLoop();
    }
  }

  const byPath = new Map<string, Uint8Array<ArrayBuffer>>();
  const paths: string[] = [];
  for (const [name, data] of entries) {
    paths.push(name);
    const key = normalize(name);
    if (!byPath.has(key)) byPath.set(key, data);
  }

  const read = (path: string): Uint8Array<ArrayBuffer> | null => byPath.get(normalize(path)) ?? null;
  return {
    paths,
    has: (path) => byPath.has(normalize(path)),
    bytes: read,
    text: (path) => {
      const data = read(path);
      if (!data) return null;
      try {
        return decoder.decode(data);
      } catch {
        return null;
      }
    },
  };
}
