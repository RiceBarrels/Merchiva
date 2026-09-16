/**
 * The .docx container: a plain zip read with `fflate` (synchronous, ~10 kB, no worker).
 *
 * The whole package is inflated up front because the reader jumps between parts — document, styles, numbering,
 * theme, settings, several headers and footers, and every `word/media/*` entry — and the import route already caps
 * uploads at 20 MB.
 *
 * Paths are matched case-insensitively with any leading slash removed: the OPC spec is case-sensitive, but
 * producers other than Word are careless and a missing `word/styles.xml` costs the document all of its formatting.
 */
import { unzipSync } from "fflate";

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

function normalize(path: string): string {
  return path.replace(/^\/+/, "").replace(/\\/g, "/").toLowerCase();
}

/**
 * Inflates the package. This is the only step allowed to throw out of `docxToHtml`: a file that isn't a readable
 * zip isn't a document, and there is nothing to degrade to.
 */
export function openDocxZip(buffer: ArrayBuffer): DocxZip {
  const entries = unzipSync(new Uint8Array(buffer));
  const byPath = new Map<string, Uint8Array<ArrayBuffer>>();
  const paths: string[] = [];
  for (const [name, data] of Object.entries(entries)) {
    // Directory entries are empty and would shadow nothing useful.
    if (name.endsWith("/")) continue;
    paths.push(name);
    const key = normalize(name);
    // `unzipSync` always allocates a plain ArrayBuffer; the declared `ArrayBufferLike` would block `new Blob([…])`.
    if (!byPath.has(key)) byPath.set(key, data as Uint8Array<ArrayBuffer>);
  }

  const bytes = (path: string): Uint8Array<ArrayBuffer> | null => byPath.get(normalize(path)) ?? null;
  return {
    paths,
    has: (path) => byPath.has(normalize(path)),
    bytes,
    text: (path) => {
      const data = bytes(path);
      if (!data) return null;
      try {
        return decoder.decode(data);
      } catch {
        return null;
      }
    },
  };
}
